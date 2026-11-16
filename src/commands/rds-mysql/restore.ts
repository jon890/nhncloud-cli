import { Command } from "commander";
import { output } from "../../formatters/table.js";
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
  parseUuidArgument,
  parseWaitOptions,
  type RdsMysqlCommandOptions,
  type RdsMysqlDetails,
  type RdsMysqlWriteOptions,
  rdsMysqlOperationResult,
  resolveRdsMysqlClient,
  withRdsMysqlOptions,
  withRdsMysqlSpinner,
  withRdsMysqlWriteOptions,
} from "./helpers.js";
import {
  addObjectStorageOptions,
  type ObjectStorageOptions,
  objectStorageBody,
  objectStorageDetails,
  parseObjectStorageTarget,
  readObjectStoragePassword,
} from "./object-storage.js";

function fail(message: string): never {
  throw new NhnCloudCliError(message, EXIT_PARAM_ERROR);
}

/** 복원은 새 DB 인스턴스를 만든다. 생성과 같은 옵션 중 원본 값을 바꿀 항목만 선택으로 받는다. */
export interface RestoreBuildOptions extends BuildOptions {
  name: string;
  description?: string;
  flavorId?: string;
  port?: string;
  parameterGroupId?: string;
  securityGroupId?: string[];
  userGroupId?: string[];
  subnetId?: string;
  highAvailability?: boolean;
  candidateName?: string;
  pingInterval?: string;
  defaultNotification?: boolean;
  deletionProtection?: boolean;
  slowQueryAnalysis?: boolean;
}

/** 복원 명령 공통 옵션을 붙인다. 지정하지 않은 값은 서버가 원본 값으로 채운다. */
export function addRestoreOptions(command: Command, required: boolean): Command {
  const subnet = "서브넷 ID (UUID, subnet list)";
  const zone = "가용성 영역 (availability-zone list)";
  const flavor = "DB 인스턴스 사양 ID (UUID, flavor list)";
  const group = "파라미터 그룹 ID (UUID)";
  const port = "DB 포트 (3306~43306)";
  const add = (flags: string, description: string): void => {
    if (required) command.requiredOption(flags, description);
    else command.option(flags, description);
  };
  command.requiredOption("--name <name>", "새 DB 인스턴스 이름 (1~100자)").option("--description <text>", "설명 (100자 이하)");
  add("--flavor-id <id>", flavor);
  add("--port <port>", port);
  add("--parameter-group-id <id>", group);
  add("--subnet-id <id>", subnet);
  add("--availability-zone <zone>", zone);
  return addBuildOptions(command)
    .option("--security-group-id <id>", "DB 보안 그룹 ID (UUID). 여러 번 지정할 수 있다", collectOption, [] as string[])
    .option("--user-group-id <id>", "사용자 그룹 ID (UUID). 여러 번 지정할 수 있다", collectOption, [] as string[])
    .option("--high-availability", "고가용성을 쓴다 (--candidate-name 필요)")
    .option("--candidate-name <name>", "Standby DB 인스턴스 이름 (고가용성에서 필수)")
    .option("--ping-interval <sec>", "고가용성 Ping 간격 (초, 1~600)")
    .option("--default-notification", "기본 알림을 쓴다")
    .option("--deletion-protection", "삭제 보호를 켠 채 만든다")
    .option("--no-slow-query-analysis", "슬로우 쿼리 분석을 끈다 (기본은 켬)");
}

export interface RestoreBuilt {
  body: Record<string, unknown>;
  details: RdsMysqlDetails;
}

/** 공통 옵션으로 요청 본문 일부와 미리보기 값을 만든다. 입력 검사는 요청 전에 끝낸다. */
export function buildRestoreBody(opts: RestoreBuildOptions): RestoreBuilt {
  checkNameLength(opts.name, "--name", 100);
  if (opts.description !== undefined) checkNameLength(opts.description, "--description", 100, 0);
  if (opts.highAvailability === true && opts.candidateName === undefined) fail("--high-availability 는 --candidate-name 이 필요합니다.");
  if (opts.highAvailability !== true && (opts.candidateName !== undefined || opts.pingInterval !== undefined)) {
    fail("--candidate-name, --ping-interval 은 --high-availability 와 함께 씁니다.");
  }
  if (opts.candidateName !== undefined) checkNameLength(opts.candidateName, "--candidate-name", 100);
  const pingInterval = opts.pingInterval === undefined ? undefined : parseIntegerOption(opts.pingInterval, "--ping-interval", { min: 1, max: 600 });
  const storage = buildStorage(opts);
  const backup = buildBackup(opts);
  const securityGroups = parseUuidList(opts.securityGroupId, "--security-group-id");
  const userGroups = parseUuidList(opts.userGroupId, "--user-group-id");
  const flavorId = opts.flavorId === undefined ? undefined : parseUuidArgument(opts.flavorId, "--flavor-id");
  const groupId = opts.parameterGroupId === undefined ? undefined : parseUuidArgument(opts.parameterGroupId, "--parameter-group-id");
  const subnetId = opts.subnetId === undefined ? undefined : parseUuidArgument(opts.subnetId, "--subnet-id");
  const port = opts.port === undefined ? undefined : parsePort(opts.port);
  const networkExtra = buildNetwork(opts);
  const network = {
    ...(subnetId === undefined ? {} : { subnetId }),
    ...Object.fromEntries(Object.entries(networkExtra).filter(([, value]) => value !== undefined)),
  };

  const body: Record<string, unknown> = {
    dbInstanceName: opts.name,
    ...(opts.description === undefined ? {} : { description: opts.description }),
    ...(flavorId === undefined ? {} : { dbFlavorId: flavorId }),
    ...(port === undefined ? {} : { dbPort: port }),
    ...(groupId === undefined ? {} : { parameterGroupId: groupId }),
    ...(securityGroups === undefined ? {} : { dbSecurityGroupIds: securityGroups }),
    ...(userGroups === undefined ? {} : { userGroupIds: userGroups }),
    ...(opts.highAvailability === true
      ? { useHighAvailability: true, dbInstanceCandidateName: opts.candidateName, ...(pingInterval === undefined ? {} : { pingInterval }) }
      : {}),
    ...(opts.defaultNotification === true ? { useDefaultNotification: true } : {}),
    ...(opts.deletionProtection === true ? { useDeletionProtection: true } : {}),
    ...(opts.slowQueryAnalysis === false ? { useSlowQueryAnalysis: false } : {}),
    ...(Object.keys(network).length === 0 ? {} : { network }),
    ...(storage === undefined ? {} : { storage }),
    ...(backup === undefined ? {} : { backup }),
  };
  const details: RdsMysqlDetails = {
    dbFlavorId: flavorId ?? "원본과 같음",
    dbPort: port ?? "원본과 같음",
    parameterGroupId: groupId ?? "원본과 같음",
    subnetId: subnetId ?? "원본과 같음",
    availabilityZone: opts.availabilityZone ?? "서버가 고름",
    usePublicAccess: opts.publicAccess === true,
    storageType: typeof storage?.["storageType"] === "string" ? storage["storageType"] : "원본과 같음",
    storageSize: typeof storage?.["storageSize"] === "number" ? storage["storageSize"] : "원본과 같음",
    useHighAvailability: opts.highAvailability === true,
    useDeletionProtection: opts.deletionProtection === true,
  };
  return { body, details };
}

export const RESTORE_COST_NOTICE =
  "안내: 복원은 원본을 바꾸지 않고 새 DB 인스턴스를 만듭니다. 만들어지는 동안 비용이 발생하고 데이터 크기에 따라 시간이 걸립니다. 진행은 job get 이나 --wait 로 봅니다.";

const INSTANCE_LIST_HINT = "nhncloud rds-mysql instance list";
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

function parseRestoreTime(value: string): number {
  const time = ISO_WITH_OFFSET.test(value) ? Date.parse(value) : Number.NaN;
  if (Number.isNaN(time)) {
    fail(`--time 은 시간대가 있는 ISO 8601 형식이어야 합니다 (예: 2026-01-31T09:00:00+09:00, 입력: ${JSON.stringify(value)}).`);
  }
  return time;
}

// ---------------------------------------------------------------------------
// info
// ---------------------------------------------------------------------------

const infoCommand = withRdsMysqlOptions(
  new Command("info")
    .description("DB 인스턴스의 복원 가능한 시간 범위와 복원에 쓸 수 있는 백업을 조회한다")
    .argument("<db-instance-id>", "원본 DB 인스턴스 ID (UUID)"),
).action(async (dbInstanceId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<RdsMysqlCommandOptions>();
  const id = parseUuidArgument(dbInstanceId, "<db-instance-id>");
  const { client } = await resolveRdsMysqlClient(opts);

  const info = await withRdsMysqlSpinner(`복원 정보 조회 중 (${id})...`, () => client.getRestorationInfo(id));
  const backups = info.restorableBackups ?? [];
  const rows = [
    ["oldestRestorableYmdt", formatCell(info.oldestRestorableYmdt)],
    ["latestRestorableYmdt", formatCell(info.latestRestorableYmdt)],
    ["restorableBackupCount", String(backups.length)],
  ];
  for (const [index, entry] of backups.entries()) {
    const backup = entry["backup"];
    const source = typeof backup === "object" && backup !== null ? (backup as Record<string, unknown>) : entry;
    rows.push([`restorableBackups.${index + 1}`, formatCell(`${formatCell(source["backupId"])} ${formatCell(source["backupName"])} ${formatCell(source["createdYmdt"])}`)]);
  }
  const ids = backups
    .map((entry) => {
      const backup = entry["backup"];
      const source = typeof backup === "object" && backup !== null ? (backup as Record<string, unknown>) : entry;
      return source["backupId"];
    })
    .filter((value): value is string => typeof value === "string");
  output(opts, { headers: ["field", "value"], rows, raw: info, ids });
});

// ---------------------------------------------------------------------------
// point-in-time
// ---------------------------------------------------------------------------

interface PointInTimeOptions extends RdsMysqlWriteOptions, RestoreBuildOptions {
  time?: string;
  backupId?: string;
  binlogFile?: string;
  binlogPosition?: string;
}

const pointInTimeCommand = addRestoreOptions(
  withRdsMysqlWriteOptions(
    new Command("point-in-time")
      .description(
        "원본 DB 인스턴스를 시점이나 바이너리 로그 위치로 되돌린 새 DB 인스턴스를 만든다. 원본은 바뀌지 않는다. --yes가 없으면 미리보기만 한다",
      )
      .argument("<db-instance-id>", "원본 DB 인스턴스 ID (UUID)")
      .option("--time <iso>", "복원할 시점 (시간대가 있는 ISO 8601, 예: 2026-01-31T09:00:00+09:00). 없으면 복원 가능한 가장 최근 시점")
      .option("--backup-id <id>", "바이너리 로그 복원에 쓸 백업 ID (UUID, --binlog-file 과 함께)")
      .option("--binlog-file <name>", "바이너리 로그 파일 이름 (바이너리 로그 복원)")
      .option("--binlog-position <n>", "바이너리 로그 위치 (바이너리 로그 복원)"),
  ),
  false,
).action(async (dbInstanceId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<PointInTimeOptions>();
  const id = parseUuidArgument(dbInstanceId, "<db-instance-id>");
  const wait = parseWaitOptions(opts);
  const binlog = opts.binlogFile !== undefined || opts.binlogPosition !== undefined || opts.backupId !== undefined;
  let restore: Record<string, unknown>;
  let requestedTime: number | null = null;
  if (binlog) {
    if (opts.time !== undefined) fail("--time 은 --backup-id, --binlog-file, --binlog-position 과 함께 쓸 수 없습니다.");
    if (opts.backupId === undefined || opts.binlogFile === undefined || opts.binlogPosition === undefined) {
      fail("바이너리 로그 복원은 --backup-id, --binlog-file, --binlog-position 을 모두 지정해야 합니다.");
    }
    restore = {
      restoreType: "BINLOG",
      backupId: parseUuidArgument(opts.backupId, "--backup-id"),
      binLog: {
        binLogFileName: opts.binlogFile,
        binLogPosition: parseIntegerOption(opts.binlogPosition, "--binlog-position", { min: 0 }),
      },
    };
  } else {
    restore = { restoreType: "TIMESTAMP" };
    if (opts.time !== undefined) {
      requestedTime = parseRestoreTime(opts.time);
      restore["restoreYmdt"] = opts.time;
    }
  }
  const built = buildRestoreBody(opts);
  const { client } = await resolveRdsMysqlClient(opts);

  const source = await checkInstanceForWrite(client, id, false);
  if (requestedTime !== null) {
    const info = await withRdsMysqlSpinner(`복원 정보 조회 중 (${id})...`, () => client.getRestorationInfo(id));
    const oldest = typeof info.oldestRestorableYmdt === "string" ? Date.parse(info.oldestRestorableYmdt) : Number.NaN;
    const latest = typeof info.latestRestorableYmdt === "string" ? Date.parse(info.latestRestorableYmdt) : Number.NaN;
    if ((!Number.isNaN(latest) && requestedTime > latest) || (!Number.isNaN(oldest) && requestedTime < oldest)) {
      fail(
        `--time 이 복원 가능한 범위 밖입니다 (범위: ${sanitizeForTerminal(formatCell(info.oldestRestorableYmdt))} ~ ${sanitizeForTerminal(formatCell(info.latestRestorableYmdt))}). restore info 로 범위를 확인하세요.`,
      );
    }
  }
  process.stderr.write(`${RESTORE_COST_NOTICE}\n`);
  await applyRdsMysqlWrite(
    opts,
    wait,
    client,
    rdsMysqlOperationResult({
      operation: "restore-point-in-time",
      dbInstanceId: id,
      target: opts.name,
      action: "create",
      details: {
        sourceDbInstanceName: source.dbInstanceName,
        restoreType: String(restore["restoreType"]),
        restoreYmdt: opts.time ?? "복원 가능한 가장 최근 시점",
        ...built.details,
      },
    }),
    () => client.restoreDbInstance(id, { ...built.body, restore }),
    INSTANCE_LIST_HINT,
  );
});

// ---------------------------------------------------------------------------
// from-object-storage
// ---------------------------------------------------------------------------

interface FromObjectStorageOptions extends RdsMysqlWriteOptions, RestoreBuildOptions, ObjectStorageOptions {
  dbVersion: string;
}

const fromObjectStorageCommand = addObjectStorageOptions(
  addRestoreOptions(
    withRdsMysqlWriteOptions(
      new Command("from-object-storage")
        .description(
          "오브젝트 스토리지에 있는 백업으로 새 DB 인스턴스를 만든다. 원본 DB 인스턴스 없이 쓰므로 사양, 서브넷, 파라미터 그룹, 스토리지, 백업 설정을 모두 지정한다. API 비밀번호는 --password-file 이나 표준 입력으로 받는다. --yes가 없으면 미리보기만 한다",
        )
        .requiredOption("--db-version <version>", "DB 엔진 버전 (db-version list, 예: MYSQL_V8411)"),
    ),
    true,
  ),
).action(async (_opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<FromObjectStorageOptions>();
  const wait = parseWaitOptions(opts);
  const built = buildRestoreBody(opts);
  const storage = built.body["storage"] as Record<string, unknown> | undefined;
  if (storage?.["storageType"] === undefined || storage["storageSize"] === undefined) fail("--storage-type 과 --storage-size 를 지정해야 합니다.");
  const backup = built.body["backup"] as Record<string, unknown> | undefined;
  if (backup?.["backupPeriod"] === undefined || !Array.isArray(backup["backupSchedules"])) {
    fail("--backup-period 와 --backup-schedule 을 하나 이상 지정해야 합니다 (보관하지 않으려면 --backup-period 0).");
  }
  const target = parseObjectStorageTarget(opts);
  // 비밀번호는 입력 검사 단계에서 읽는다. 어떤 출력에도 싣지 않는다.
  const password = readObjectStoragePassword(opts.passwordFile);
  const { client } = await resolveRdsMysqlClient(opts);

  const body = { ...built.body, dbVersion: opts.dbVersion, restore: objectStorageBody(target, password) };
  process.stderr.write(`${RESTORE_COST_NOTICE}\n`);
  await applyRdsMysqlWrite(
    opts,
    wait,
    client,
    rdsMysqlOperationResult({
      operation: "restore-from-object-storage",
      target: opts.name,
      action: "create",
      details: { dbVersion: opts.dbVersion, ...built.details, ...objectStorageDetails(target) },
    }),
    () => client.restoreFromObjectStorage(body),
    INSTANCE_LIST_HINT,
  );
});

export const restoreCommand = new Command("restore")
  .description("복원 정보 조회, 시점 복원, 오브젝트 스토리지에서 복원 명령 (백업으로 복원은 backup restore)")
  .addCommand(infoCommand)
  .addCommand(pointInTimeCommand)
  .addCommand(fromObjectStorageCommand);
