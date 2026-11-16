import { Command } from "commander";
import { output } from "../../formatters/table.js";
import type { RdsMysqlClient } from "../../services/rds-mysql/client.js";
import type { RdsMysqlParameter, RdsMysqlParameterGroupDetail } from "../../services/rds-mysql/types.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { sanitizeForTerminal } from "../../utils/terminal.js";
import { collectOption, parseIntegerOption } from "../parse-options.js";
import {
  applyRdsMysqlWrite,
  formatCell,
  outputRdsMysqlWriteResult,
  parseUuidArgument,
  type RdsMysqlCommandOptions,
  type RdsMysqlWriteOptions,
  rdsMysqlOperationResult,
  resolveRdsMysqlClient,
  withRdsMysqlConfirmOptions,
  withRdsMysqlOptions,
  withRdsMysqlSpinner,
} from "./helpers.js";

/**
 * 파라미터의 적용 유형을 재시작 관점으로 풀어 쓴다.
 * API 는 BOTH, SESSION, FILE 만 알려 준다. 콘솔 가이드의 「고정은 재시작해야 적용, 동적은 바로 적용」 과
 * 이어 FILE 을 고정으로 읽은 것이라, 단정하지 않고 추정이라고 적는다.
 */
export function describeApplyType(applyType: string | null | undefined): string {
  if (applyType === "FILE") return "재시작 필요(추정)";
  if (applyType === "BOTH") return "동적(추정)";
  if (applyType === "SESSION") return "세션 단위";
  return applyType === null || applyType === undefined ? "알 수 없음" : sanitizeForTerminal(applyType);
}

export function requiresRestart(applyType: string | null | undefined): boolean {
  return applyType === "FILE";
}

const GROUP_HINT_PREFIX = "nhncloud rds-mysql parameter-group";

function getGroup(client: RdsMysqlClient, id: string): Promise<RdsMysqlParameterGroupDetail> {
  return withRdsMysqlSpinner(`파라미터 그룹 조회 중 (${id})...`, () => client.getParameterGroup(id));
}

interface ListOptions extends RdsMysqlCommandOptions {
  name?: string;
  dbVersion?: string;
  page?: string;
  size?: string;
}

const listCommand = withRdsMysqlOptions(
  new Command("list")
    .description("파라미터 그룹 목록을 조회한다")
    .option("--name <text>", "파라미터 그룹 이름(부분 검색)")
    .option("--db-version <version>", "DB 엔진 버전 (예: MYSQL_V8411)")
    .option("--page <n>", "페이지 (기본 1)")
    .option("--size <n>", "페이지 크기 (1~100, 기본 20)"),
).action(async (_opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<ListOptions>();
  const page = opts.page === undefined ? undefined : parseIntegerOption(opts.page, "--page", { min: 1 });
  const size = opts.size === undefined ? undefined : parseIntegerOption(opts.size, "--size", { min: 1, max: 100 });
  const { client } = await resolveRdsMysqlClient(opts);

  const list = await withRdsMysqlSpinner("파라미터 그룹 목록 조회 중...", () =>
    client.listParameterGroups({ parameterGroupName: opts.name, dbVersion: opts.dbVersion, page, size }),
  );
  output(opts, {
    headers: ["parameterGroupId", "parameterGroupName", "dbVersion", "parameterGroupType", "parameterGroupStatus"],
    rows: list.items.map((g) => [
      formatCell(g.parameterGroupId),
      formatCell(g.parameterGroupName),
      formatCell(g.dbVersion),
      formatCell(g.parameterGroupType),
      formatCell(g.parameterGroupStatus),
    ]),
    raw: list.items,
    ids: list.items.map((g) => g.parameterGroupId),
  });
  if (list.totalCounts !== null && list.totalCounts > list.items.length) {
    process.stderr.write(
      `안내: 전체 ${list.totalCounts}개 중 ${list.items.length}개를 보였습니다. --page, --size 로 이어서 조회합니다.\n`,
    );
  }
});

interface GetOptions extends RdsMysqlCommandOptions {
  parameter?: string;
}

const getCommand = withRdsMysqlOptions(
  new Command("get")
    .description("파라미터 그룹과 파라미터 값을 조회한다")
    .argument("<parameter-group-id>", "파라미터 그룹 ID (UUID)")
    .option("--parameter <text>", "파라미터 이름에 포함된 글자로 거른다 (대소문자 무시)"),
).action(async (parameterGroupId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<GetOptions>();
  const id = parseUuidArgument(parameterGroupId, "<parameter-group-id>");
  const { client } = await resolveRdsMysqlClient(opts);

  const group = await getGroup(client, id);
  const needle = opts.parameter?.toLowerCase();
  const parameters =
    needle === undefined ? group.parameters : group.parameters.filter((p) => p.parameterName.toLowerCase().includes(needle));
  output(opts, {
    headers: ["parameterName", "value", "defaultValue", "applyType", "updateType", "allowedValue", "parameterId"],
    rows: parameters.map((p) => [
      formatCell(p.parameterName),
      formatCell(p.value),
      formatCell(p.defaultValue),
      formatCell(p.applyType),
      formatCell(p.updateType),
      formatCell(p.allowedValue),
      formatCell(p.parameterId),
    ]),
    raw: { ...group, parameters },
    ids: parameters.map((p) => p.parameterName),
  });
  process.stderr.write(
    `파라미터 그룹 ${sanitizeForTerminal(group.parameterGroupName)} (${sanitizeForTerminal(group.dbVersion ?? group.dbEngineVersionFamily ?? "버전 알 수 없음")}, 상태 ${sanitizeForTerminal(group.parameterGroupStatus ?? "알 수 없음")}), 파라미터 ${parameters.length}/${group.parameters.length}개\n`,
  );
});

interface CopyOptions extends RdsMysqlWriteOptions {
  name: string;
  description?: string;
}

const copyCommand = withRdsMysqlConfirmOptions(
  new Command("copy")
    .description("파라미터 그룹을 복사해 새 그룹을 만든다. --yes가 없으면 미리보기만 한다")
    .argument("<parameter-group-id>", "복사할 파라미터 그룹 ID (UUID)")
    .requiredOption("--name <name>", "새 파라미터 그룹 이름 (1~100자)")
    .option("--description <text>", "새 파라미터 그룹 설명 (100자 이하)"),
).action(async (parameterGroupId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<CopyOptions>();
  const id = parseUuidArgument(parameterGroupId, "<parameter-group-id>");
  const nameLength = [...opts.name].length;
  if (nameLength < 1 || nameLength > 100) {
    throw new NhnCloudCliError(`--name은 1자 이상 100자 이하여야 합니다 (입력 길이: ${nameLength}).`, EXIT_PARAM_ERROR);
  }
  if (opts.description !== undefined && [...opts.description].length > 100) {
    throw new NhnCloudCliError("--description은 100자 이하여야 합니다.", EXIT_PARAM_ERROR);
  }
  const { client } = await resolveRdsMysqlClient(opts);

  const source = await getGroup(client, id);
  const sameName = await withRdsMysqlSpinner("같은 이름의 파라미터 그룹 확인 중...", () =>
    client.listParameterGroups({ parameterGroupName: opts.name, size: 100 }),
  );
  if (sameName.items.some((g) => g.parameterGroupName === opts.name)) {
    throw new NhnCloudCliError(
      `같은 이름의 파라미터 그룹이 이미 있습니다: ${JSON.stringify(opts.name)}. ${GROUP_HINT_PREFIX} list로 확인하세요.`,
      EXIT_PARAM_ERROR,
    );
  }

  const result = rdsMysqlOperationResult({
    operation: "parameter-group-copy",
    target: source.parameterGroupName,
    action: "create",
    details: {
      sourceParameterGroupId: id,
      dbVersion: source.dbVersion ?? null,
      dbEngineVersionFamily: source.dbEngineVersionFamily ?? null,
      newParameterGroupName: opts.name,
      description: opts.description ?? null,
      parameterCount: source.parameters.length,
    },
  });
  await applyRdsMysqlWrite(
    opts,
    { wait: false, timeoutMs: 0 },
    client,
    result,
    async () => {
      const newId = await client.copyParameterGroup(id, {
        parameterGroupName: opts.name,
        ...(opts.description === undefined ? {} : { description: opts.description }),
      });
      result["createdId"] = newId;
      return null;
    },
    `${GROUP_HINT_PREFIX} list --name <이름>`,
  );
});

interface Change {
  parameterName: string;
  parameterId: string;
  before: string | null;
  after: string;
  applyType: string | null;
  restartRequired: boolean;
  summary: string;
}

function describeChange(p: RdsMysqlParameter, after: string): Change {
  const before = p.value ?? null;
  const applyType = p.applyType ?? null;
  return {
    parameterName: p.parameterName,
    parameterId: p.parameterId,
    before,
    after,
    applyType,
    restartRequired: requiresRestart(applyType),
    summary: `${p.parameterName}: ${before ?? "-"} -> ${after} [${describeApplyType(applyType)}]`,
  };
}

function parseAssignments(assignments: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const assignment of assignments) {
    const index = assignment.indexOf("=");
    if (index <= 0) {
      throw new NhnCloudCliError(
        `--set은 이름=값 형식이어야 합니다 (입력: ${JSON.stringify(assignment)}).`,
        EXIT_PARAM_ERROR,
      );
    }
    const name = assignment.slice(0, index);
    if (map.has(name)) {
      throw new NhnCloudCliError(`같은 파라미터를 두 번 지정했습니다: ${JSON.stringify(name)}`, EXIT_PARAM_ERROR);
    }
    map.set(name, assignment.slice(index + 1));
  }
  return map;
}

function warnGroupNotApplied(group: RdsMysqlParameterGroupDetail): void {
  if (group.parameterGroupType !== undefined && group.parameterGroupType !== null && group.parameterGroupType !== "USER") {
    process.stderr.write(
      `경고: 파라미터 그룹 유형이 ${sanitizeForTerminal(group.parameterGroupType)}입니다. 사용자 그룹이 아니면 서버가 수정을 거절할 수 있습니다.\n`,
    );
  }
}

const APPLY_NOTICE =
  "안내: 이 요청은 파라미터 그룹의 값만 바꿉니다. 연결된 DB 인스턴스에는 자동으로 적용되지 않고 그룹이 적용 필요(NEED_TO_APPLY) 상태가 됩니다. 콘솔의 「파라미터 그룹 변경 사항 적용」(유지 관리)으로 적용하며, 재시작이 필요한 파라미터는 적용 과정에서 DB 인스턴스가 재시작됩니다.\n";

interface SetOptions extends RdsMysqlWriteOptions {
  set: string[];
}

const setCommand = withRdsMysqlConfirmOptions(
  new Command("set-parameters")
    .description(
      "파라미터 그룹의 파라미터 값을 바꾼다. 미리보기는 바뀌는 항목만 전후 값과 적용 유형을 보인다. --yes가 없으면 미리보기만 한다",
    )
    .argument("<parameter-group-id>", "파라미터 그룹 ID (UUID)")
    .option("--set <name=value>", "바꿀 파라미터 (필수). 여러 번 지정할 수 있다", collectOption, [] as string[]),
).action(async (parameterGroupId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<SetOptions>();
  const id = parseUuidArgument(parameterGroupId, "<parameter-group-id>");
  if (opts.set.length === 0) {
    throw new NhnCloudCliError("--set <이름=값>을 한 번 이상 지정해야 합니다.", EXIT_PARAM_ERROR);
  }
  const assignments = parseAssignments(opts.set);
  const { client } = await resolveRdsMysqlClient(opts);

  const group = await getGroup(client, id);
  const byName = new Map(group.parameters.map((p) => [p.parameterName, p]));
  const unknown = [...assignments.keys()].filter((name) => !byName.has(name));
  if (unknown.length > 0) {
    throw new NhnCloudCliError(
      `파라미터 그룹에 없는 파라미터입니다: ${unknown.map((n) => JSON.stringify(n)).join(", ")}. ${GROUP_HINT_PREFIX} get ${id} --parameter <이름>으로 확인하세요.`,
      EXIT_PARAM_ERROR,
    );
  }
  const constants = [...assignments.keys()].filter((name) => byName.get(name)?.updateType === "CONSTANT");
  if (constants.length > 0) {
    throw new NhnCloudCliError(
      `수정할 수 없는 파라미터입니다(updateType=CONSTANT): ${constants.map((n) => JSON.stringify(n)).join(", ")}`,
      EXIT_PARAM_ERROR,
    );
  }

  const changes: Change[] = [];
  for (const [name, value] of assignments) {
    const parameter = byName.get(name);
    if (parameter !== undefined && parameter.value !== value) changes.push(describeChange(parameter, value));
  }
  const restartRequired = changes.some((c) => c.restartRequired);
  const result = rdsMysqlOperationResult({
    operation: "parameter-group-set-parameters",
    target: group.parameterGroupName,
    action: changes.length === 0 ? "unchanged" : "update",
    details: {
      parameterGroupId: id,
      parameterGroupStatus: group.parameterGroupStatus ?? null,
      changedCount: changes.length,
      restartRequired: changes.length === 0 ? false : restartRequired,
    },
  });
  result["changes"] = changes;

  if (changes.length === 0) {
    outputRdsMysqlWriteResult(opts, result);
    process.stderr.write("지정한 값이 이미 같아 요청하지 않았습니다.\n");
    return;
  }
  warnGroupNotApplied(group);
  if (restartRequired) {
    process.stderr.write(
      "경고: 재시작이 필요한 파라미터(applyType=FILE, 추정)가 있습니다. 나중에 DB 인스턴스에 적용할 때 재시작이 따릅니다.\n",
    );
  }
  process.stderr.write(APPLY_NOTICE);

  await applyRdsMysqlWrite(
    opts,
    { wait: false, timeoutMs: 0 },
    client,
    result,
    async () => {
      await client.updateParameters(
        id,
        changes.map((c) => ({ parameterId: c.parameterId, value: c.after })),
      );
      return null;
    },
    `${GROUP_HINT_PREFIX} get ${id}`,
  );
});

const resetCommand = withRdsMysqlConfirmOptions(
  new Command("reset")
    .description("파라미터 그룹의 모든 파라미터를 DB 엔진 버전의 기본값으로 되돌린다. --yes가 없으면 미리보기만 한다")
    .argument("<parameter-group-id>", "파라미터 그룹 ID (UUID)"),
).action(async (parameterGroupId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<RdsMysqlWriteOptions>();
  const id = parseUuidArgument(parameterGroupId, "<parameter-group-id>");
  const { client } = await resolveRdsMysqlClient(opts);

  const group = await getGroup(client, id);
  const changes = group.parameters
    .filter((p) => p.defaultValue !== undefined && p.defaultValue !== null && p.value !== p.defaultValue)
    .map((p) => describeChange(p, p.defaultValue as string));
  const restartRequired = changes.some((c) => c.restartRequired);
  const result = rdsMysqlOperationResult({
    operation: "parameter-group-reset",
    target: group.parameterGroupName,
    action: changes.length === 0 ? "unchanged" : "reset",
    details: {
      parameterGroupId: id,
      parameterGroupStatus: group.parameterGroupStatus ?? null,
      changedCount: changes.length,
      restartRequired: changes.length === 0 ? false : restartRequired,
    },
  });
  result["changes"] = changes;

  if (changes.length === 0) {
    outputRdsMysqlWriteResult(opts, result);
    process.stderr.write("모든 파라미터가 이미 기본값이라 요청하지 않았습니다.\n");
    return;
  }
  warnGroupNotApplied(group);
  process.stderr.write(
    "경고: 되돌린 뒤에는 이전 값을 복구하는 API 가 없습니다. 필요하면 먼저 parameter-group copy 로 복사본을 만들어 두세요.\n",
  );
  if (restartRequired) {
    process.stderr.write("경고: 재시작이 필요한 파라미터(applyType=FILE, 추정)가 바뀝니다. 적용할 때 재시작이 따릅니다.\n");
  }
  process.stderr.write(APPLY_NOTICE);

  await applyRdsMysqlWrite(
    opts,
    { wait: false, timeoutMs: 0 },
    client,
    result,
    async () => {
      await client.resetParameterGroup(id);
      return null;
    },
    `${GROUP_HINT_PREFIX} get ${id}`,
  );
});

export const parameterGroupCommand = new Command("parameter-group")
  .description("파라미터 그룹 조회, 복사, 값 변경, 초기화 명령")
  .addCommand(listCommand)
  .addCommand(getCommand)
  .addCommand(copyCommand)
  .addCommand(setCommand)
  .addCommand(resetCommand);
