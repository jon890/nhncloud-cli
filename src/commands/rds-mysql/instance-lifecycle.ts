import { Command } from "commander";
import { output } from "../../formatters/table.js";
import type { RdsMysqlDbInstanceDetail } from "../../services/rds-mysql/types.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { sanitizeForTerminal } from "../../utils/terminal.js";
import { collectOption, parseIntegerOption } from "../parse-options.js";
import {
  addBuildOptions,
  type BuildOptions,
  buildBackup,
  buildNetwork,
  buildStorage,
  checkNameLength,
  parsePort,
  parseUuidList,
} from "./instance-build.js";
import {
  applyRdsMysqlWrite,
  checkInstanceForWrite,
  formatCell,
  outputRdsMysqlWriteResult,
  parseAuthPluginOption,
  parseTlsOption,
  parseUuidArgument,
  parseWaitOptions,
  type RdsMysqlCommandOptions,
  type RdsMysqlDetails,
  type RdsMysqlWriteOptions,
  rdsMysqlOperationResult,
  readDbUserPassword,
  resolveRdsMysqlClient,
  withRdsMysqlConfirmOptions,
  withRdsMysqlOptions,
  withRdsMysqlSpinner,
  withRdsMysqlWriteOptions,
} from "./helpers.js";

const INSTANCE_GET_HINT = (id: string): string => `nhncloud rds-mysql instance get ${id}`;

function fail(message: string): never {
  throw new NhnCloudCliError(message, EXIT_PARAM_ERROR);
}

function stringField(instance: RdsMysqlDbInstanceDetail, key: string): string | null {
  const value = instance[key];
  return typeof value === "string" ? value : null;
}

const ID_ARGUMENT = "<db-instance-id>";
const ID_DESCRIPTION = "DB 인스턴스 ID (UUID)";

/** 이미 원하는 상태면 요청 없이 끝낸다. */
function finishUnchanged(opts: RdsMysqlWriteOptions, result: ReturnType<typeof rdsMysqlOperationResult>, message: string): void {
  outputRdsMysqlWriteResult(opts, result);
  process.stderr.write(`${message}\n`);
}

// ---------------------------------------------------------------------------
// start / stop
// ---------------------------------------------------------------------------

function powerCommand(kind: "start" | "stop"): Command {
  const isStart = kind === "start";
  const targetStatus = isStart ? "AVAILABLE" : "SHUTDOWN";
  const command = withRdsMysqlWriteOptions(
    new Command(kind)
      .description(
        isStart
          ? "중지된 DB 인스턴스를 시작한다. --yes가 없으면 미리보기만 한다"
          : "DB 인스턴스를 정지한다. 정지하는 동안 접속할 수 없다. --yes가 없으면 미리보기만 한다",
      )
      .argument(ID_ARGUMENT, ID_DESCRIPTION),
  );
  return command.action(async (dbInstanceId: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<RdsMysqlWriteOptions>();
    const id = parseUuidArgument(dbInstanceId, ID_ARGUMENT);
    const wait = parseWaitOptions(opts);
    const { client } = await resolveRdsMysqlClient(opts);

    const instance = await checkInstanceForWrite(client, id, false);
    const status = stringField(instance, "dbInstanceStatus");
    const result = rdsMysqlOperationResult({
      operation: `instance-${kind}`,
      dbInstanceId: id,
      target: instance.dbInstanceName,
      action: status === targetStatus ? "unchanged" : kind,
      details: { dbInstanceStatus: status, dbInstanceType: stringField(instance, "dbInstanceType") },
    });
    if (status === targetStatus) {
      finishUnchanged(opts, result, isStart ? "이미 사용 가능 상태라 요청하지 않았습니다." : "이미 중지된 상태라 요청하지 않았습니다.");
      return;
    }
    if (isStart && status !== "SHUTDOWN") {
      process.stderr.write(`경고: DB 인스턴스 상태가 SHUTDOWN 이 아닙니다 (dbInstanceStatus=${sanitizeForTerminal(status ?? "알 수 없음")}). 서버가 거절할 수 있습니다.\n`);
    }
    if (!isStart) {
      process.stderr.write(
        "경고: 정지하면 접속할 수 없고, 고가용성 DB 인스턴스는 고가용성이 일시 중지됩니다. 장기간 정지하면 서버가 자동으로 시작할 수 있는지는 콘솔 가이드를 확인하세요.\n",
      );
    }
    await applyRdsMysqlWrite(
      opts,
      wait,
      client,
      result,
      () => (isStart ? client.startDbInstance(id) : client.stopDbInstance(id)),
      INSTANCE_GET_HINT(id),
    );
  });
}

// ---------------------------------------------------------------------------
// restart
// ---------------------------------------------------------------------------

interface RestartOptions extends RdsMysqlWriteOptions {
  onlineFailover?: boolean;
  backup?: boolean;
  waitReplicationDelay?: boolean;
  readOnly?: boolean;
  osRestart?: boolean;
  force?: boolean;
}

const restartCommand = withRdsMysqlWriteOptions(
  new Command("restart")
    .description(
      "DB 인스턴스를 재시작한다. --force 는 MySQL 이 정상 동작하지 않을 때 쓰는 강제 재시작이다. --yes가 없으면 미리보기만 한다",
    )
    .argument(ID_ARGUMENT, ID_DESCRIPTION)
    .option("--online-failover", "장애 조치를 이용해 재시작한다 (고가용성 DB 인스턴스만)")
    .option("--backup", "재시작 전에 현재 시점 백업을 수행한다")
    .option("--wait-replication-delay", "복제 지연이 해소될 때까지 기다린다")
    .option("--read-only", "재시작 전에 쓰기 부하를 차단한다")
    .option("--os-restart", "운영체제도 재시작한다")
    .option("--force", "강제 재시작. 고가용성 DB 인스턴스는 할 수 없고, 다른 재시작 옵션과 --wait 를 함께 쓸 수 없다"),
).action(async (dbInstanceId: string, _opts: unknown, cmd: Command) => {
  const opts = cmd.optsWithGlobals<RestartOptions>();
  const id = parseUuidArgument(dbInstanceId, ID_ARGUMENT);
  const wait = parseWaitOptions(opts);
  const flags = {
    useOnlineFailover: opts.onlineFailover === true,
    executeBackup: opts.backup === true,
    waitReplicationDelay: opts.waitReplicationDelay === true,
    useReadOnly: opts.readOnly === true,
    osRestart: opts.osRestart === true,
  };
  if (opts.force === true) {
    if (Object.values(flags).some(Boolean)) fail("--force 는 다른 재시작 옵션과 함께 쓸 수 없습니다.");
    if (wait.wait) fail("강제 재시작은 작업이 없어 --wait 를 쓸 수 없습니다. instance get 으로 상태를 확인하세요.");
  }
  const { client } = await resolveRdsMysqlClient(opts);

  const instance = await checkInstanceForWrite(client, id, false);
  if (opts.force === true || flags.useOnlineFailover) {
    const ha = await withRdsMysqlSpinner(`고가용성 정보 조회 중 (${id})...`, () => client.getHaInfo(id));
    if (opts.force === true && ha.useHighAvailability) {
      fail("고가용성 DB 인스턴스는 강제 재시작할 수 없습니다. 일반 재시작(--online-failover 포함)을 쓰세요.");
    }
    if (flags.useOnlineFailover && !ha.useHighAvailability) {
      fail("--online-failover 는 고가용성 DB 인스턴스에서만 쓸 수 있습니다.");
    }
  }

  const result = rdsMysqlOperationResult({
    operation: opts.force === true ? "instance-force-restart" : "instance-restart",
    dbInstanceId: id,
    target: instance.dbInstanceName,
    action: opts.force === true ? "force-restart" : "restart",
    details: opts.force === true ? { dbInstanceStatus: stringField(instance, "dbInstanceStatus") } : { ...flags },
  });
  if (opts.force === true) {
    process.stderr.write(
      "경고: 강제 재시작은 MySQL 에 종료 신호를 보내 10분간 정상 종료를 기다린 뒤 가상 머신을 다시 켭니다. 10분 안에 종료되지 않으면 가상 머신을 강제로 재부팅하므로 일부 트랜잭션이 유실되고 데이터 볼륨이 손상될 수 있습니다. 재시작 뒤에도 사용 가능 상태로 돌아오지 않을 수 있습니다.\n",
    );
  } else {
    process.stderr.write("경고: 재시작하는 동안 이 DB 인스턴스에 접속할 수 없습니다. 서비스 부하가 낮은 시간대에 하세요.\n");
  }

  await applyRdsMysqlWrite(
    opts,
    wait,
    client,
    result,
    async () => {
      if (opts.force === true) {
        await client.forceRestartDbInstance(id);
        return null;
      }
      return client.restartDbInstance(id, flags);
    },
    INSTANCE_GET_HINT(id),
  );
});

// ---------------------------------------------------------------------------
// promote
// ---------------------------------------------------------------------------

const promoteCommand = withRdsMysqlWriteOptions(
  new Command("promote")
    .description(
      "읽기 복제본을 Primary 와 복제 관계가 없는 독립 DB 인스턴스로 승격한다. 되돌릴 수 없다. --yes가 없으면 미리보기만 한다",
    )
    .argument(ID_ARGUMENT, "승격할 읽기 복제본의 ID (UUID)"),
).action(async (dbInstanceId: string, _opts: unknown, cmd: Command) => {
  const opts = cmd.optsWithGlobals<RdsMysqlWriteOptions>();
  const id = parseUuidArgument(dbInstanceId, ID_ARGUMENT);
  const wait = parseWaitOptions(opts);
  const { client } = await resolveRdsMysqlClient(opts);

  const instance = await checkInstanceForWrite(client, id, false);
  const type = stringField(instance, "dbInstanceType");
  if (type !== "READ_ONLY_SLAVE") {
    fail(`승격할 수 없는 DB 인스턴스입니다 (dbInstanceType=${sanitizeForTerminal(type ?? "알 수 없음")}). 승격은 읽기 복제본(READ_ONLY_SLAVE)에만 합니다.`);
  }
  process.stderr.write(
    "경고: 승격하면 Primary 와의 복제가 끊기고 한 번 승격한 DB 인스턴스는 이전 복제 관계로 되돌릴 수 없습니다. 복제 지연이 있으면 해소될 때까지 승격되지 않을 수 있습니다.\n",
  );
  await applyRdsMysqlWrite(
    opts,
    wait,
    client,
    rdsMysqlOperationResult({
      operation: "instance-promote",
      dbInstanceId: id,
      target: instance.dbInstanceName,
      action: "promote",
      details: { dbInstanceType: type, dbInstanceStatus: stringField(instance, "dbInstanceStatus") },
    }),
    () => client.promoteDbInstance(id),
    INSTANCE_GET_HINT(id),
  );
});

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

interface DeleteOptions extends RdsMysqlWriteOptions {
  deleteAutoBackup?: boolean;
}

const deleteCommand = withRdsMysqlWriteOptions(
  new Command("delete")
    .description(
      "DB 인스턴스를 삭제한다. 복구할 수 없다. 삭제 보호가 켜져 있으면 막는다. --yes가 없으면 미리보기만 한다",
    )
    .argument(ID_ARGUMENT, ID_DESCRIPTION)
    .option("--delete-auto-backup", "자동 백업도 함께 삭제한다 (기본은 남긴다)"),
).action(async (dbInstanceId: string, _opts: unknown, cmd: Command) => {
  const opts = cmd.optsWithGlobals<DeleteOptions>();
  const id = parseUuidArgument(dbInstanceId, ID_ARGUMENT);
  const wait = parseWaitOptions(opts);
  const { client } = await resolveRdsMysqlClient(opts);

  const instance = await checkInstanceForWrite(client, id, false);
  if (instance["useDeletionProtection"] === true) {
    fail(
      `삭제 보호가 켜져 있어 삭제하지 않았습니다. 정말 지우려면 nhncloud rds-mysql instance disable-deletion-protection ${id} --yes 로 먼저 끄세요.`,
    );
  }
  const type = stringField(instance, "dbInstanceType");
  const deleteAutoBackup = opts.deleteAutoBackup === true;
  if (type === "MASTER") {
    process.stderr.write("경고: Primary 를 삭제하면 같은 복제 그룹의 Standby 와 읽기 복제본도 모두 함께 삭제됩니다.\n");
  }
  process.stderr.write(
    `경고: 삭제한 DB 인스턴스는 복구할 수 없습니다. 자동 백업은 ${deleteAutoBackup ? "함께 삭제됩니다" : "남습니다"}.\n`,
  );
  await applyRdsMysqlWrite(
    opts,
    wait,
    client,
    rdsMysqlOperationResult({
      operation: "instance-delete",
      dbInstanceId: id,
      target: instance.dbInstanceName,
      action: "delete",
      details: {
        dbInstanceType: type,
        dbInstanceStatus: stringField(instance, "dbInstanceStatus"),
        useDeletionProtection: false,
        deleteAutoBackup,
      },
    }),
    () => client.deleteDbInstance(id, deleteAutoBackup),
    "nhncloud rds-mysql instance list",
  );
});

// ---------------------------------------------------------------------------
// deletion protection
// ---------------------------------------------------------------------------

function deletionProtectionCommand(enable: boolean): Command {
  return withRdsMysqlConfirmOptions(
    new Command(enable ? "enable-deletion-protection" : "disable-deletion-protection")
      .description(
        enable
          ? "DB 인스턴스 삭제 보호를 켠다. --yes가 없으면 미리보기만 한다"
          : "DB 인스턴스 삭제 보호를 끈다. 끈 뒤에는 삭제할 수 있다. --yes가 없으면 미리보기만 한다",
      )
      .argument(ID_ARGUMENT, ID_DESCRIPTION),
  ).action(async (dbInstanceId: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<RdsMysqlWriteOptions>();
    const id = parseUuidArgument(dbInstanceId, ID_ARGUMENT);
    const { client } = await resolveRdsMysqlClient(opts);

    const instance = await checkInstanceForWrite(client, id, false);
    const current = instance["useDeletionProtection"];
    const result = rdsMysqlOperationResult({
      operation: enable ? "instance-enable-deletion-protection" : "instance-disable-deletion-protection",
      dbInstanceId: id,
      target: instance.dbInstanceName,
      action: current === enable ? "unchanged" : "update",
      details: { currentUseDeletionProtection: typeof current === "boolean" ? current : null, newUseDeletionProtection: enable },
    });
    if (current === enable) {
      finishUnchanged(opts, result, `이미 삭제 보호가 ${enable ? "켜져" : "꺼져"} 있어 요청하지 않았습니다.`);
      return;
    }
    await applyRdsMysqlWrite(
      opts,
      { wait: false, timeoutMs: 0 },
      client,
      result,
      async () => {
        await client.setDeletionProtection(id, enable);
        return null;
      },
      INSTANCE_GET_HINT(id),
      async () => (await client.getDbInstance(id))["useDeletionProtection"] === enable,
    );
  });
}

// ---------------------------------------------------------------------------
// network
// ---------------------------------------------------------------------------

const networkCommand = withRdsMysqlOptions(
  new Command("network").description("DB 인스턴스의 네트워크 정보(가용성 영역, 서브넷, 접속 정보)를 조회한다").argument(ID_ARGUMENT, ID_DESCRIPTION),
).action(async (dbInstanceId: string, _opts: unknown, cmd: Command) => {
  const opts = cmd.optsWithGlobals<RdsMysqlCommandOptions>();
  const id = parseUuidArgument(dbInstanceId, ID_ARGUMENT);
  const { client } = await resolveRdsMysqlClient(opts);

  const info = await withRdsMysqlSpinner(`네트워크 정보 조회 중 (${id})...`, () => client.getNetworkInfo(id));
  output(opts, {
    headers: ["field", "value"],
    rows: Object.entries(info).map(([key, value]) => [formatCell(key), formatCell(value)]),
    raw: info,
    ids: (info.endPoints ?? []).map((e) => String(e["domain"] ?? "")).filter((d) => d !== ""),
  });
});

function publicAccessCommand(enable: boolean): Command {
  return withRdsMysqlWriteOptions(
    new Command(enable ? "enable-public-access" : "disable-public-access")
      .description(
        enable
          ? "DB 인스턴스에 외부 접속을 허용한다. --yes가 없으면 미리보기만 한다"
          : "DB 인스턴스의 외부 접속을 막는다. --yes가 없으면 미리보기만 한다",
      )
      .argument(ID_ARGUMENT, ID_DESCRIPTION),
  ).action(async (dbInstanceId: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<RdsMysqlWriteOptions>();
    const id = parseUuidArgument(dbInstanceId, ID_ARGUMENT);
    const wait = parseWaitOptions(opts);
    const { client } = await resolveRdsMysqlClient(opts);

    const instance = await checkInstanceForWrite(client, id, false);
    const network = await withRdsMysqlSpinner(`네트워크 정보 조회 중 (${id})...`, () => client.getNetworkInfo(id));
    // 응답에 현재 외부 접속 여부가 없어 접속 정보 개수만 보인다. 같은 값인지 비교하지 않고 서버에 맡긴다.
    const result = rdsMysqlOperationResult({
      operation: enable ? "instance-enable-public-access" : "instance-disable-public-access",
      dbInstanceId: id,
      target: instance.dbInstanceName,
      action: "update",
      details: {
        usePublicAccess: enable,
        availabilityZone: network.availabilityZone ?? null,
        currentEndPointCount: network.endPoints?.length ?? 0,
      },
    });
    process.stderr.write(
      enable
        ? "경고: 외부 접속을 허용하면 인터넷에서 DB 인스턴스에 닿을 수 있습니다. DB 보안 그룹 규칙과 DB 사용자 host 범위를 먼저 확인하세요.\n"
        : "경고: 외부 접속을 막으면 지금 외부에서 접속하는 클라이언트가 끊깁니다.\n",
    );
    await applyRdsMysqlWrite(opts, wait, client, result, () => client.updateNetworkInfo(id, enable), `nhncloud rds-mysql instance network ${id}`);
  });
}

// ---------------------------------------------------------------------------
// maintenances (조회만)
// ---------------------------------------------------------------------------

interface MaintenanceOptions extends RdsMysqlCommandOptions {
  type?: string;
  status?: string;
  category?: string;
}

const maintenancesCommand = withRdsMysqlOptions(
  new Command("maintenances")
    .description("DB 인스턴스의 유지 관리 목록(파라미터 그룹 적용 대기 등)을 조회한다")
    .argument(ID_ARGUMENT, ID_DESCRIPTION)
    .option("--type <type>", "유지 관리 유형 (예: APPLY_CHANGE_PARAMETER)")
    .option("--status <statuses>", "유지 관리 상태 (예: PENDING, 쉼표로 여러 개)")
    .option("--category <category>", "유지 관리 카테고리 (USER|PROVIDER|AUTO)"),
).action(async (dbInstanceId: string, _opts: unknown, cmd: Command) => {
  const opts = cmd.optsWithGlobals<MaintenanceOptions>();
  const id = parseUuidArgument(dbInstanceId, ID_ARGUMENT);
  const { client } = await resolveRdsMysqlClient(opts);

  const list = await withRdsMysqlSpinner(`유지 관리 목록 조회 중 (${id})...`, () =>
    client.listMaintenances(id, { type: opts.type, statuses: opts.status, category: opts.category }),
  );
  output(opts, {
    headers: ["maintenanceId", "type", "status", "category", "required", "executionType", "deadlineYmdt"],
    rows: list.items.map((m) => [
      formatCell(m.maintenanceId), formatCell(m.type), formatCell(m.status), formatCell(m.category),
      formatCell(m.required), formatCell(m.executionType), formatCell(m.deadlineYmdt),
    ]),
    raw: list.items,
    ids: list.items.map((m) => m.maintenanceId),
  });
  process.stderr.write(
    "안내: 이 명령은 목록만 봅니다. 유지 관리를 실행하거나 예약하는 일은 콘솔에서 합니다 (파라미터 그룹 변경 적용 포함).\n",
  );
});

// ---------------------------------------------------------------------------
// modify
// ---------------------------------------------------------------------------

interface ModifyOptions extends RdsMysqlWriteOptions {
  name?: string;
  candidateName?: string;
  description?: string;
  port?: string;
  flavorId?: string;
  slowQueryAnalysis?: boolean;
  securityGroupId?: string[];
  backup?: boolean;
  onlineFailover?: boolean;
  waitReplicationDelay?: boolean;
  readOnly?: boolean;
}

const modifyCommand = withRdsMysqlWriteOptions(
  new Command("modify")
    .description(
      "DB 인스턴스의 이름, 설명, 포트, 사양, 보안 그룹, 슬로우 쿼리 분석을 바꾼다. 파라미터 그룹은 set-parameter-group 으로 바꾼다. --yes가 없으면 미리보기만 한다",
    )
    .argument(ID_ARGUMENT, ID_DESCRIPTION)
    .option("--name <name>", "Primary 이름 (1~100자)")
    .option("--candidate-name <name>", "Standby 이름 (1~100자, 고가용성만)")
    .option("--description <text>", "설명 (100자 이하, 빈 문자열이면 지운다)")
    .option("--port <port>", "DB 포트 (3306~43306). 재시작이 따른다")
    .option("--flavor-id <id>", "DB 인스턴스 사양 ID (UUID, flavor list 로 조회). 재시작이 따른다")
    .option("--slow-query-analysis", "슬로우 쿼리 분석을 켠다")
    .option("--no-slow-query-analysis", "슬로우 쿼리 분석을 끈다")
    .option("--security-group-id <id>", "DB 보안 그룹 ID (UUID). 여러 번 지정하며 지정한 목록이 현재 목록을 대체한다", collectOption, [] as string[])
    .option("--backup", "변경 전에 현재 시점 백업을 수행한다")
    .option("--online-failover", "재시작이 따르면 장애 조치를 이용한다 (고가용성만)")
    .option("--wait-replication-delay", "복제 지연이 해소될 때까지 기다린다")
    .option("--read-only", "재시작 전에 쓰기 부하를 차단한다"),
).action(async (dbInstanceId: string, _opts: unknown, cmd: Command) => {
  const opts = cmd.optsWithGlobals<ModifyOptions>();
  const id = parseUuidArgument(dbInstanceId, ID_ARGUMENT);
  const wait = parseWaitOptions(opts);

  const changes: Record<string, unknown> = {};
  if (opts.name !== undefined) {
    checkNameLength(opts.name, "--name", 100);
    changes["dbInstanceName"] = opts.name;
  }
  if (opts.candidateName !== undefined) {
    checkNameLength(opts.candidateName, "--candidate-name", 100);
    changes["dbInstanceCandidateName"] = opts.candidateName;
  }
  if (opts.description !== undefined) {
    checkNameLength(opts.description, "--description", 100, 0);
    changes["description"] = opts.description;
  }
  if (opts.port !== undefined) changes["dbPort"] = parsePort(opts.port);
  if (opts.flavorId !== undefined) changes["dbFlavorId"] = parseUuidArgument(opts.flavorId, "--flavor-id");
  if (opts.slowQueryAnalysis !== undefined) changes["useSlowQueryAnalysis"] = opts.slowQueryAnalysis;
  const securityGroups = parseUuidList(opts.securityGroupId, "--security-group-id");
  if (securityGroups !== undefined) changes["dbSecurityGroupIds"] = securityGroups;
  if (Object.keys(changes).length === 0) {
    fail("바꿀 항목을 하나 이상 지정해야 합니다 (--name, --description, --port, --flavor-id, --security-group-id 등).");
  }
  const controls = {
    executeBackup: opts.backup === true,
    useOnlineFailover: opts.onlineFailover === true,
    waitReplicationDelay: opts.waitReplicationDelay === true,
    useReadOnly: opts.readOnly === true,
  };
  const { client } = await resolveRdsMysqlClient(opts);

  const instance = await checkInstanceForWrite(client, id, false);
  const sameAsCurrent = (key: string, value: unknown): boolean => {
    const current = instance[key];
    if (Array.isArray(value)) {
      // 중복 입력이 있어도 집합으로 비교한다.
      if (!Array.isArray(current)) return false;
      const wanted = new Set(value);
      const existing = new Set(current);
      return wanted.size === existing.size && [...wanted].every((v) => existing.has(v));
    }
    return current === value;
  };
  // 요청에는 실제로 달라지는 항목만 싣는다. 모르는 현재 값(Standby 이름)은 비교하지 않고 그대로 보낸다.
  const effective = Object.fromEntries(Object.entries(changes).filter(([key, value]) => !sameAsCurrent(key, value)));
  const details: RdsMysqlDetails = {};
  for (const [key, value] of Object.entries(effective)) {
    const current = instance[key];
    details[key] = `${formatCell(current)} -> ${formatCell(value)}`;
  }
  if (controls.useOnlineFailover) {
    const ha = await withRdsMysqlSpinner(`고가용성 정보 조회 중 (${id})...`, () => client.getHaInfo(id));
    if (!ha.useHighAvailability) fail("--online-failover 는 고가용성 DB 인스턴스에서만 쓸 수 있습니다.");
  }
  const result = rdsMysqlOperationResult({
    operation: "instance-modify",
    dbInstanceId: id,
    target: instance.dbInstanceName,
    action: Object.keys(effective).length === 0 ? "unchanged" : "update",
    details,
  });
  if (Object.keys(effective).length === 0) {
    finishUnchanged(opts, result, "지정한 값이 이미 같아 요청하지 않았습니다.");
    return;
  }
  if ("dbPort" in effective || "dbFlavorId" in effective) {
    process.stderr.write("경고: 포트나 사양을 바꾸면 DB 인스턴스가 재시작될 수 있습니다. 재시작하는 동안 접속할 수 없습니다.\n");
  }
  if ("dbSecurityGroupIds" in effective) {
    process.stderr.write("안내: --security-group-id 로 지정한 목록이 현재 DB 보안 그룹 목록을 대체합니다. 빠진 그룹은 연결이 해제됩니다.\n");
  }
  await applyRdsMysqlWrite(
    opts,
    wait,
    client,
    result,
    () => client.modifyDbInstance(id, { ...effective, ...controls }),
    INSTANCE_GET_HINT(id),
  );
});

// ---------------------------------------------------------------------------
// create / replicate
// ---------------------------------------------------------------------------

interface CreateOptions extends RdsMysqlWriteOptions, BuildOptions {
  name: string;
  description?: string;
  flavorId: string;
  dbVersion: string;
  port: string;
  userName: string;
  passwordFile?: string;
  parameterGroupId: string;
  securityGroupId?: string[];
  userGroupId?: string[];
  highAvailability?: boolean;
  candidateName?: string;
  pingInterval?: string;
  defaultNotification?: boolean;
  deletionProtection?: boolean;
  slowQueryAnalysis?: boolean;
  authPlugin?: string;
  tls?: string;
  subnetId: string;
}

async function ensureExists<T>(
  label: string,
  list: () => Promise<T[]>,
  matches: (item: T) => boolean,
  hint: string,
): Promise<void> {
  const items = await withRdsMysqlSpinner(`${label} 확인 중...`, list);
  if (!items.some(matches)) fail(`${label}에서 찾을 수 없습니다. ${hint}로 확인하세요.`);
}

const createCommand = addBuildOptions(
  withRdsMysqlWriteOptions(
    new Command("create")
      .description(
        "Primary DB 인스턴스를 만든다. 사양, 서브넷, 엔진 버전은 요청 전에 목록으로 확인한다. DB 사용자 비밀번호는 --password-file 이나 표준 입력으로 받는다. --yes가 없으면 미리보기만 한다",
      )
      .requiredOption("--name <name>", "DB 인스턴스 이름 (1~100자)")
      .option("--description <text>", "설명 (100자 이하)")
      .requiredOption("--flavor-id <id>", "DB 인스턴스 사양 ID (UUID, flavor list)")
      .requiredOption("--db-version <version>", "DB 엔진 버전 (db-version list, 예: MYSQL_V8411)")
      .requiredOption("--port <port>", "DB 포트 (3306~43306)")
      .requiredOption("--user-name <name>", "DB 사용자(관리자) 이름 (1~32자)")
      .option("--password-file <path>", "DB 사용자 비밀번호를 읽을 파일. 없으면 표준 입력에서 읽는다")
      .requiredOption("--parameter-group-id <id>", "파라미터 그룹 ID (UUID, 엔진 버전이 같아야 한다)")
      .requiredOption("--subnet-id <id>", "서브넷 ID (UUID, subnet list)")
      .requiredOption("--availability-zone <zone>", "가용성 영역 (availability-zone list)")
      .option("--security-group-id <id>", "DB 보안 그룹 ID (UUID). 여러 번 지정할 수 있다", collectOption, [] as string[])
      .option("--user-group-id <id>", "사용자 그룹 ID (UUID). 여러 번 지정할 수 있다", collectOption, [] as string[])
      .option("--high-availability", "고가용성을 쓴다 (--candidate-name 필요)")
      .option("--candidate-name <name>", "Standby DB 인스턴스 이름 (고가용성에서 필수)")
      .option("--ping-interval <sec>", "고가용성 Ping 간격 (초, 1~600)")
      .option("--default-notification", "기본 알림을 쓴다")
      .option("--deletion-protection", "삭제 보호를 켠 채 만든다")
      .option("--no-slow-query-analysis", "슬로우 쿼리 분석을 끈다 (기본은 켬)")
      .option("--auth-plugin <plugin>", "인증 플러그인 (native|caching-sha2|sha256)")
      .option("--tls <option>", "TLS 옵션 (none|ssl|x509)"),
  ),
).action(async (_opts: unknown, cmd: Command) => {
  const opts = cmd.optsWithGlobals<CreateOptions>();
  const wait = parseWaitOptions(opts);
  checkNameLength(opts.name, "--name", 100);
  if (opts.description !== undefined) checkNameLength(opts.description, "--description", 100, 0);
  checkNameLength(opts.userName, "--user-name", 32);
  const flavorId = parseUuidArgument(opts.flavorId, "--flavor-id");
  const groupId = parseUuidArgument(opts.parameterGroupId, "--parameter-group-id");
  const subnetId = parseUuidArgument(opts.subnetId, "--subnet-id");
  const port = parsePort(opts.port);
  const storage = buildStorage(opts);
  if (storage?.["storageType"] === undefined || storage["storageSize"] === undefined) {
    fail("--storage-type 과 --storage-size 를 지정해야 합니다.");
  }
  const backup = buildBackup(opts);
  if (backup?.["backupPeriod"] === undefined || !Array.isArray(backup["backupSchedules"])) {
    fail("--backup-period 와 --backup-schedule 을 하나 이상 지정해야 합니다 (보관하지 않으려면 --backup-period 0).");
  }
  if (opts.highAvailability === true && opts.candidateName === undefined) fail("--high-availability 는 --candidate-name 이 필요합니다.");
  if (opts.highAvailability !== true && (opts.candidateName !== undefined || opts.pingInterval !== undefined)) {
    fail("--candidate-name, --ping-interval 은 --high-availability 와 함께 씁니다.");
  }
  if (opts.candidateName !== undefined) checkNameLength(opts.candidateName, "--candidate-name", 100);
  const pingInterval = opts.pingInterval === undefined ? undefined : parseIntegerOption(opts.pingInterval, "--ping-interval", { min: 1, max: 600 });
  const authPlugin = parseAuthPluginOption(opts.authPlugin);
  const tls = parseTlsOption(opts.tls);
  const securityGroups = parseUuidList(opts.securityGroupId, "--security-group-id");
  const userGroups = parseUuidList(opts.userGroupId, "--user-group-id");
  // 비밀번호는 입력 검사 단계에서 읽는다. 어떤 출력에도 싣지 않는다.
  const password = readDbUserPassword(opts.passwordFile);
  const { client } = await resolveRdsMysqlClient(opts);

  const hint = (command: string): string => `nhncloud rds-mysql ${command}`;
  await ensureExists("DB 인스턴스 사양", () => client.listDbFlavors(), (f) => f.dbFlavorId === flavorId, hint("flavor list"));
  await ensureExists("서브넷", () => client.listSubnets(), (s) => s.subnetId === subnetId, hint("subnet list"));
  await ensureExists("DB 엔진 버전", () => client.listDbVersions(), (v) => v.dbVersion === opts.dbVersion, hint("db-version list"));
  await ensureExists("스토리지 유형", () => client.listStorageTypes(), (t) => t === storage["storageType"], hint("storage types"));
  const group = await withRdsMysqlSpinner(`파라미터 그룹 조회 중 (${groupId})...`, () => client.getParameterGroup(groupId));
  if (typeof group.dbVersion === "string" && group.dbVersion !== opts.dbVersion) {
    fail(`DB 엔진 버전이 다릅니다 (--db-version ${sanitizeForTerminal(opts.dbVersion)}, 파라미터 그룹 ${sanitizeForTerminal(group.dbVersion)}). 같은 버전의 파라미터 그룹을 고르세요.`);
  }

  const body: Record<string, unknown> = {
    dbInstanceName: opts.name,
    ...(opts.description === undefined ? {} : { description: opts.description }),
    dbFlavorId: flavorId,
    dbVersion: opts.dbVersion,
    dbPort: port,
    dbUserName: opts.userName,
    dbPassword: password,
    parameterGroupId: groupId,
    ...(securityGroups === undefined ? {} : { dbSecurityGroupIds: securityGroups }),
    ...(userGroups === undefined ? {} : { userGroupIds: userGroups }),
    ...(opts.highAvailability === true
      ? { useHighAvailability: true, dbInstanceCandidateName: opts.candidateName, ...(pingInterval === undefined ? {} : { pingInterval }) }
      : {}),
    ...(opts.defaultNotification === true ? { useDefaultNotification: true } : {}),
    ...(opts.deletionProtection === true ? { useDeletionProtection: true } : {}),
    ...(opts.slowQueryAnalysis === false ? { useSlowQueryAnalysis: false } : {}),
    ...(authPlugin === undefined ? {} : { authenticationPlugin: authPlugin }),
    ...(tls === undefined ? {} : { tlsOption: tls }),
    network: { subnetId, ...buildNetwork(opts) },
    storage,
    backup,
  };

  // 미리보기에는 비밀번호를 뺀 요약만 낸다.
  const result = rdsMysqlOperationResult({
    operation: "instance-create",
    target: opts.name,
    action: "create",
    details: {
      dbVersion: opts.dbVersion,
      dbFlavorId: flavorId,
      dbPort: port,
      dbUserName: opts.userName,
      parameterGroupId: groupId,
      subnetId,
      availabilityZone: opts.availabilityZone ?? null,
      usePublicAccess: opts.publicAccess === true,
      storageType: String(storage["storageType"]),
      storageSize: Number(storage["storageSize"]),
      useStorageAutoscale: opts.autoscale === true,
      backupPeriod: Number(backup["backupPeriod"]),
      backupScheduleCount: (backup["backupSchedules"] as unknown[]).length,
      useHighAvailability: opts.highAvailability === true,
      useDeletionProtection: opts.deletionProtection === true,
      securityGroupCount: securityGroups?.length ?? 0,
    },
  });
  process.stderr.write("안내: DB 인스턴스는 만들어지는 동안 비용이 발생하고 생성에 시간이 걸립니다. 진행은 job get 이나 --wait 로 봅니다.\n");
  await applyRdsMysqlWrite(opts, wait, client, result, () => client.createDbInstance(body), "nhncloud rds-mysql instance list");
});

interface ReplicateOptions extends RdsMysqlWriteOptions, BuildOptions {
  name: string;
  description?: string;
  flavorId?: string;
  port?: string;
  parameterGroupId?: string;
  securityGroupId?: string[];
  userGroupId?: string[];
  defaultNotification?: boolean;
  deletionProtection?: boolean;
  slowQueryAnalysis?: boolean;
}

const replicateCommand = addBuildOptions(
  withRdsMysqlWriteOptions(
    new Command("replicate")
      .description(
        "Primary 의 읽기 복제본을 만든다. 지정하지 않은 사양, 스토리지, 백업 설정은 서버 기본값을 따른다. --yes가 없으면 미리보기만 한다",
      )
      .argument(ID_ARGUMENT, "원본 Primary 의 ID (UUID)")
      .requiredOption("--name <name>", "복제본 이름 (1~100자)")
      .requiredOption("--availability-zone <zone>", "가용성 영역 (availability-zone list)")
      .option("--description <text>", "설명 (100자 이하)")
      .option("--flavor-id <id>", "DB 인스턴스 사양 ID (UUID)")
      .option("--port <port>", "DB 포트 (3306~43306)")
      .option("--parameter-group-id <id>", "파라미터 그룹 ID (UUID)")
      .option("--security-group-id <id>", "DB 보안 그룹 ID (UUID). 여러 번 지정할 수 있다", collectOption, [] as string[])
      .option("--user-group-id <id>", "사용자 그룹 ID (UUID). 여러 번 지정할 수 있다", collectOption, [] as string[])
      .option("--default-notification", "기본 알림을 쓴다")
      .option("--deletion-protection", "삭제 보호를 켠 채 만든다")
      .option("--no-slow-query-analysis", "슬로우 쿼리 분석을 끈다 (기본은 켬)"),
  ),
).action(async (dbInstanceId: string, _opts: unknown, cmd: Command) => {
  const opts = cmd.optsWithGlobals<ReplicateOptions>();
  const id = parseUuidArgument(dbInstanceId, ID_ARGUMENT);
  const wait = parseWaitOptions(opts);
  checkNameLength(opts.name, "--name", 100);
  if (opts.description !== undefined) checkNameLength(opts.description, "--description", 100, 0);
  const storage = buildStorage(opts);
  const backup = buildBackup(opts);
  const securityGroups = parseUuidList(opts.securityGroupId, "--security-group-id");
  const userGroups = parseUuidList(opts.userGroupId, "--user-group-id");
  const body: Record<string, unknown> = {
    dbInstanceName: opts.name,
    ...(opts.description === undefined ? {} : { description: opts.description }),
    ...(opts.flavorId === undefined ? {} : { dbFlavorId: parseUuidArgument(opts.flavorId, "--flavor-id") }),
    ...(opts.port === undefined ? {} : { dbPort: parsePort(opts.port) }),
    ...(opts.parameterGroupId === undefined ? {} : { parameterGroupId: parseUuidArgument(opts.parameterGroupId, "--parameter-group-id") }),
    ...(securityGroups === undefined ? {} : { dbSecurityGroupIds: securityGroups }),
    ...(userGroups === undefined ? {} : { userGroupIds: userGroups }),
    ...(opts.defaultNotification === true ? { useDefaultNotification: true } : {}),
    ...(opts.deletionProtection === true ? { useDeletionProtection: true } : {}),
    ...(opts.slowQueryAnalysis === false ? { useSlowQueryAnalysis: false } : {}),
    network: buildNetwork(opts),
    ...(storage === undefined ? {} : { storage }),
    ...(backup === undefined ? {} : { backup }),
  };
  const { client } = await resolveRdsMysqlClient(opts);

  const source = await checkInstanceForWrite(client, id, false);
  const type = stringField(source, "dbInstanceType");
  if (type !== "MASTER") {
    fail(`복제할 수 없는 DB 인스턴스입니다 (dbInstanceType=${sanitizeForTerminal(type ?? "알 수 없음")}). 읽기 복제본은 Primary(MASTER)에서 만듭니다.`);
  }
  const result = rdsMysqlOperationResult({
    operation: "instance-replicate",
    dbInstanceId: id,
    target: opts.name,
    action: "create",
    details: {
      sourceDbInstanceName: source.dbInstanceName,
      availabilityZone: opts.availabilityZone ?? null,
      dbFlavorId: opts.flavorId ?? null,
      dbPort: opts.port === undefined ? null : parsePort(opts.port),
      parameterGroupId: opts.parameterGroupId ?? null,
      usePublicAccess: opts.publicAccess === true,
      storageType: typeof storage?.["storageType"] === "string" ? storage["storageType"] : null,
      storageSize: typeof storage?.["storageSize"] === "number" ? storage["storageSize"] : null,
      useDeletionProtection: opts.deletionProtection === true,
    },
  });
  process.stderr.write("안내: 읽기 복제본은 만들어지는 동안 비용이 발생하고, 원본의 백업 설정과 스토리지 크기에 따라 시간이 걸립니다.\n");
  await applyRdsMysqlWrite(opts, wait, client, result, () => client.replicateDbInstance(id, body), "nhncloud rds-mysql instance list");
});

export function lifecycleCommands(): Command[] {
  return [
    createCommand,
    replicateCommand,
    modifyCommand,
    powerCommand("start"),
    powerCommand("stop"),
    restartCommand,
    promoteCommand,
    deleteCommand,
    deletionProtectionCommand(true),
    deletionProtectionCommand(false),
    networkCommand,
    publicAccessCommand(true),
    publicAccessCommand(false),
    maintenancesCommand,
  ];
}
