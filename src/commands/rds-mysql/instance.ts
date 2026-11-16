import { Command } from "commander";
import { output } from "../../formatters/table.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { sanitizeForTerminal } from "../../utils/terminal.js";
import {
  applyRdsMysqlWrite,
  checkInstanceForWrite,
  formatCell,
  outputRdsMysqlWriteResult,
  parseUuidArgument,
  parseWaitOptions,
  type RdsMysqlCommandOptions,
  type RdsMysqlWriteOptions,
  rdsMysqlOperationResult,
  resolveRdsMysqlClient,
  withRdsMysqlOptions,
  withRdsMysqlSpinner,
  withRdsMysqlWriteOptions,
} from "./helpers.js";
import { describeApplyType, requiresRestart } from "./parameter-group.js";

const listCommand = withRdsMysqlOptions(new Command("list").description("DB 인스턴스 목록을 조회한다")).action(
  async (_opts: unknown, command: Command) => {
    const opts = command.optsWithGlobals<RdsMysqlCommandOptions>();
    const { client } = await resolveRdsMysqlClient(opts);

    const instances = await withRdsMysqlSpinner("DB 인스턴스 목록 조회 중...", () => client.listDbInstances());
    output(opts, {
      headers: ["dbInstanceId", "dbInstanceName", "dbVersion", "dbInstanceType", "dbInstanceStatus", "progressStatus"],
      rows: instances.map((i) => [
        formatCell(i.dbInstanceId), formatCell(i.dbInstanceName), formatCell(i.dbVersion),
        formatCell(i.dbInstanceType), formatCell(i.dbInstanceStatus), formatCell(i.progressStatus),
      ]),
      raw: instances,
      ids: instances.map((i) => i.dbInstanceId),
    });
  },
);

const getCommand = withRdsMysqlOptions(
  new Command("get").description("DB 인스턴스 상세를 조회한다").argument("<db-instance-id>", "DB 인스턴스 ID (UUID)"),
).action(async (dbInstanceId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<RdsMysqlCommandOptions>();
  const parsedId = parseUuidArgument(dbInstanceId, "<db-instance-id>");
  const { client } = await resolveRdsMysqlClient(opts);

  const instance = await withRdsMysqlSpinner(`DB 인스턴스 ${parsedId} 조회 중...`, () => client.getDbInstance(parsedId));
  output(opts, {
    headers: ["field", "value"],
    rows: Object.entries(instance).map(([key, value]) => [formatCell(key), formatCell(value)]),
    raw: instance,
    ids: [instance.dbInstanceId],
  });
});

interface SetParameterGroupOptions extends RdsMysqlWriteOptions {
  parameterGroupId: string;
}

const setParameterGroupCommand = withRdsMysqlWriteOptions(
  new Command("set-parameter-group")
    .description(
      "DB 인스턴스에 연결할 파라미터 그룹을 바꾼다. 재시작이 따를 수 있다. --yes가 없으면 미리보기만 한다",
    )
    .argument("<db-instance-id>", "DB 인스턴스 ID (UUID)")
    .requiredOption("--parameter-group-id <id>", "연결할 파라미터 그룹 ID (UUID)"),
).action(async (dbInstanceId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<SetParameterGroupOptions>();
  const id = parseUuidArgument(dbInstanceId, "<db-instance-id>");
  const groupId = parseUuidArgument(opts.parameterGroupId, "--parameter-group-id");
  const wait = parseWaitOptions(opts);
  const { client } = await resolveRdsMysqlClient(opts);

  const instance = await checkInstanceForWrite(client, id, false);
  const currentGroupId = typeof instance["parameterGroupId"] === "string" ? instance["parameterGroupId"] : null;
  const target = await withRdsMysqlSpinner(`파라미터 그룹 조회 중 (${groupId})...`, () => client.getParameterGroup(groupId));
  if (typeof instance.dbVersion === "string" && typeof target.dbVersion === "string" && instance.dbVersion !== target.dbVersion) {
    throw new NhnCloudCliError(
      `DB 엔진 버전이 다릅니다 (인스턴스 ${sanitizeForTerminal(instance.dbVersion)}, 파라미터 그룹 ${sanitizeForTerminal(target.dbVersion)}). 같은 버전의 파라미터 그룹을 고르세요.`,
      EXIT_PARAM_ERROR,
    );
  }

  // 현재 그룹과 값이 다른 파라미터를 찾아 재시작이 따르는지 본다. 현재 그룹을 모르면 판단하지 않는다.
  let changedCount: number | null = null;
  let restartRequired: boolean | null = null;
  const changedNames: string[] = [];
  if (currentGroupId !== null && currentGroupId !== groupId) {
    const current = await withRdsMysqlSpinner(`현재 파라미터 그룹 조회 중 (${currentGroupId})...`, () =>
      client.getParameterGroup(currentGroupId),
    );
    const currentValues = new Map(current.parameters.map((p) => [p.parameterName, p.value ?? null]));
    const changed = target.parameters.filter((p) => currentValues.has(p.parameterName) && currentValues.get(p.parameterName) !== (p.value ?? null));
    changedCount = changed.length;
    restartRequired = changed.some((p) => requiresRestart(p.applyType));
    for (const p of changed) {
      changedNames.push(`${p.parameterName}: ${currentValues.get(p.parameterName) ?? "-"} -> ${p.value ?? "-"} [${describeApplyType(p.applyType)}]`);
    }
  }

  const unchanged = currentGroupId === groupId;
  const result = rdsMysqlOperationResult({
    operation: "instance-set-parameter-group",
    dbInstanceId: id,
    target: target.parameterGroupName,
    action: unchanged ? "unchanged" : "update",
    details: {
      currentParameterGroupId: currentGroupId,
      newParameterGroupId: groupId,
      newParameterGroupStatus: target.parameterGroupStatus ?? null,
      changedParameterCount: changedCount,
      restartRequired,
    },
  });
  result["changedParameters"] = changedNames.map((summary) => ({ summary }));

  if (unchanged) {
    outputRdsMysqlWriteResult(opts, result);
    process.stderr.write("이미 이 파라미터 그룹이 연결돼 있어 요청하지 않았습니다.\n");
    return;
  }
  if (restartRequired === true) {
    process.stderr.write(
      "경고: 값이 바뀌는 파라미터 중 재시작이 필요한 것(applyType=FILE, 추정)이 있습니다. 반영하는 과정에서 DB 인스턴스가 재시작될 수 있습니다.\n",
    );
  } else {
    process.stderr.write(
      "안내: 파라미터 그룹을 바꾸는 수정 요청은 재시작이 따를 수 있습니다. 값 비교로는 재시작이 필요한 항목을 찾지 못했지만 서버가 판정합니다.\n",
    );
  }

  await applyRdsMysqlWrite(
    opts,
    wait,
    client,
    result,
    () => client.setInstanceParameterGroup(id, groupId),
    `nhncloud rds-mysql instance get ${id}`,
  );
});

/** 재구축할 수 있는 역할이다. 정상 Primary(MASTER)는 재구축 대상이 아니다. */
const REBUILDABLE_TYPES: ReadonlySet<string> = new Set(["FAILED_MASTER", "CANDIDATE_MASTER", "READ_ONLY_SLAVE"]);

const rebuildCommand = withRdsMysqlWriteOptions(
  new Command("rebuild")
    .description(
      "Failed Over Primary, Standby, 읽기 복제본을 재구축한다. 대상의 모든 데이터베이스를 지우고 Primary 에서 다시 만든다. --yes가 없으면 미리보기만 한다",
    )
    .argument("<db-instance-id>", "재구축할 DB 인스턴스 ID (UUID)"),
).action(async (dbInstanceId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<RdsMysqlWriteOptions>();
  const id = parseUuidArgument(dbInstanceId, "<db-instance-id>");
  const wait = parseWaitOptions(opts);
  const { client } = await resolveRdsMysqlClient(opts);

  const instance = await checkInstanceForWrite(client, id, false);
  const type = typeof instance.dbInstanceType === "string" ? instance.dbInstanceType : null;
  if (type === null || !REBUILDABLE_TYPES.has(type)) {
    throw new NhnCloudCliError(
      `재구축할 수 없는 DB 인스턴스입니다 (dbInstanceType=${sanitizeForTerminal(type ?? "알 수 없음")}). 재구축은 FAILED_MASTER, CANDIDATE_MASTER, READ_ONLY_SLAVE 에만 합니다.`,
      EXIT_PARAM_ERROR,
    );
  }
  process.stderr.write(
    "경고: 재구축은 이 DB 인스턴스의 모든 데이터베이스를 지우고 Primary 의 데이터로 다시 만듭니다. 진행하는 동안 이 인스턴스를 쓸 수 없고, 백업을 수행하는 인스턴스의 스토리지 I/O 가 느려지며 바이너리 로그만큼 백업 스토리지 비용이 늘 수 있습니다. 재구축에는 테이블 잠금 옵션으로 만든 백업과 바이너리 로그가 필요합니다.\n",
  );

  await applyRdsMysqlWrite(
    opts,
    wait,
    client,
    rdsMysqlOperationResult({
      operation: "instance-rebuild",
      dbInstanceId: id,
      target: id,
      action: "rebuild",
      details: { dbInstanceType: type, dbInstanceStatus: instance.dbInstanceStatus },
    }),
    () => client.rebuildDbInstance(id),
    `nhncloud rds-mysql instance get ${id}`,
  );
});

export const instanceCommand = new Command("instance")
  .description("DB 인스턴스 조회, 파라미터 그룹 변경, 재구축 명령")
  .addCommand(listCommand)
  .addCommand(getCommand)
  .addCommand(setParameterGroupCommand)
  .addCommand(rebuildCommand);
