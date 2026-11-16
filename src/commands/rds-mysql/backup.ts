import { Command } from "commander";
import { output } from "../../formatters/table.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { parseIntegerOption } from "../parse-options.js";
import {
  applyRdsMysqlWrite,
  checkInstanceForWrite,
  formatCell,
  outputRdsMysqlWriteResult,
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
import { addBackupOptions, type BuildOptions, buildBackup, checkNameLength } from "./instance-build.js";
import {
  addObjectStorageOptions,
  type ObjectStorageOptions,
  objectStorageBody,
  objectStorageDetails,
  parseObjectStorageTarget,
  readObjectStoragePassword,
} from "./object-storage.js";
import { addRestoreOptions, buildRestoreBody, RESTORE_COST_NOTICE, type RestoreBuildOptions } from "./restore.js";

const infoGetCommand = withRdsMysqlOptions(
  new Command("get")
    .description("DB 인스턴스의 백업 설정(보관 기간, 스케줄 등)을 조회한다")
    .argument("<db-instance-id>", "DB 인스턴스 ID (UUID)"),
).action(async (dbInstanceId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<RdsMysqlCommandOptions>();
  const id = parseUuidArgument(dbInstanceId, "<db-instance-id>");
  const { client } = await resolveRdsMysqlClient(opts);

  const info = await withRdsMysqlSpinner(`백업 정보 조회 중 (${id})...`, () => client.getBackupInfo(id));
  output(opts, {
    headers: ["field", "value"],
    rows: Object.entries(info).map(([key, value]) => [formatCell(key), formatCell(value)]),
    raw: info,
    ids: info.backupPeriod === null || info.backupPeriod === undefined ? [] : [String(info.backupPeriod)],
  });
});

interface InfoUpdateOptions extends RdsMysqlWriteOptions, BuildOptions {}

const infoUpdateCommand = addBackupOptions(
  withRdsMysqlWriteOptions(
    new Command("update")
      .description("DB 인스턴스의 백업 설정(보관 기간, 재시도, 스케줄 등)을 바꾼다. 지정한 항목만 바꾼다. --yes가 없으면 미리보기만 한다")
      .argument("<db-instance-id>", "DB 인스턴스 ID (UUID)")
      .option("--backup-lock", "백업에 테이블 잠금을 쓴다"),
  ),
).action(async (dbInstanceId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<InfoUpdateOptions>();
  const id = parseUuidArgument(dbInstanceId, "<db-instance-id>");
  const wait = parseWaitOptions(opts);
  const changes: Record<string, unknown> = { ...(buildBackup(opts) ?? {}) };
  if (opts.backupLock === true) changes["useBackupLock"] = true;
  if (Object.keys(changes).length === 0) {
    fail("바꿀 항목을 하나 이상 지정해야 합니다 (--backup-period, --backup-schedule 등).");
  }
  const { client } = await resolveRdsMysqlClient(opts);

  const instance = await checkInstanceForWrite(client, id, false);
  const current = await withRdsMysqlSpinner(`백업 정보 조회 중 (${id})...`, () => client.getBackupInfo(id));
  // 스케줄은 현재 값과 형식이 같은지 알 수 없어 지정하면 그대로 보낸다. 나머지 값이 모두 같으면 요청하지 않는다.
  const effective = Object.fromEntries(
    Object.entries(changes).filter(([key, value]) => key === "backupSchedules" || current[key] !== value),
  );
  const details: RdsMysqlDetails = {};
  for (const [key, value] of Object.entries(effective)) {
    details[key] = key === "backupSchedules" ? formatCell(value) : `${formatCell(current[key])} -> ${formatCell(value)}`;
  }
  const result = rdsMysqlOperationResult({
    operation: "backup-info-update",
    dbInstanceId: id,
    target: instance.dbInstanceName,
    action: Object.keys(effective).length === 0 ? "unchanged" : "update",
    details,
  });
  if (Object.keys(effective).length === 0) {
    outputRdsMysqlWriteResult(opts, result);
    process.stderr.write("지정한 값이 이미 같아 요청하지 않았습니다.\n");
    return;
  }
  if ("backupPeriod" in effective) {
    process.stderr.write("경고: 보관 기간을 줄이면 새 기간을 넘긴 자동 백업이 삭제되어 시점 복원 범위가 줄 수 있습니다.\n");
  }
  await applyRdsMysqlWrite(opts, wait, client, result, () => client.updateBackupInfo(id, effective), `nhncloud rds-mysql backup-info get ${id}`);
});

export const backupInfoCommand = new Command("backup-info")
  .description("DB 인스턴스 백업 설정 조회·변경 명령")
  .addCommand(infoGetCommand)
  .addCommand(infoUpdateCommand);

interface BackupListOptions extends RdsMysqlCommandOptions {
  instance?: string;
  type?: string;
  dbVersion?: string;
  page?: string;
  size?: string;
}

const BACKUP_TYPES: Readonly<Record<string, string>> = { auto: "AUTO", manual: "MANUAL" };

const listCommand = withRdsMysqlOptions(
  new Command("list")
    .description("백업 목록을 조회한다")
    .option("--instance <db-instance-id>", "원본 DB 인스턴스 ID (UUID)")
    .option("--type <type>", "백업 유형 (auto|manual)")
    .option("--db-version <version>", "DB 엔진 버전 (예: MYSQL_V8411)")
    .option("--page <n>", "페이지 (기본 1)")
    .option("--size <n>", "페이지 크기 (1~100, 기본 20)"),
).action(async (_opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<BackupListOptions>();
  const dbInstanceId = opts.instance === undefined ? undefined : parseUuidArgument(opts.instance, "--instance");
  let backupType: string | undefined;
  if (opts.type !== undefined) {
    backupType = Object.hasOwn(BACKUP_TYPES, opts.type) ? BACKUP_TYPES[opts.type] : undefined;
    if (backupType === undefined) {
      throw new NhnCloudCliError(`--type은 auto, manual 중 하나여야 합니다 (입력: ${JSON.stringify(opts.type)}).`, EXIT_PARAM_ERROR);
    }
  }
  const page = opts.page === undefined ? undefined : parseIntegerOption(opts.page, "--page", { min: 1 });
  const size = opts.size === undefined ? undefined : parseIntegerOption(opts.size, "--size", { min: 1, max: 100 });
  const { client } = await resolveRdsMysqlClient(opts);

  const list = await withRdsMysqlSpinner("백업 목록 조회 중...", () =>
    client.listBackups({ backupType, dbInstanceId, dbVersion: opts.dbVersion, page, size }),
  );
  output(opts, {
    headers: ["backupId", "backupName", "backupStatus", "backupType", "backupSize", "dbInstanceId", "createdYmdt"],
    rows: list.items.map((b) => [
      formatCell(b.backupId),
      formatCell(b.backupName),
      formatCell(b.backupStatus),
      formatCell(b.backupType),
      formatCell(b.backupSize),
      formatCell(b.dbInstanceId),
      formatCell(b.createdYmdt),
    ]),
    raw: list.items,
    ids: list.items.map((b) => b.backupId),
  });
  if (list.totalCounts !== null && list.totalCounts > list.items.length) {
    process.stderr.write(
      `안내: 전체 ${list.totalCounts}개 중 ${list.items.length}개를 보였습니다. --page, --size 로 이어서 조회합니다.\n`,
    );
  }
});

const BACKUP_ID = "<backup-id>";
const BACKUP_ID_DESCRIPTION = "백업 ID (UUID)";
const BACKUP_LIST_HINT = "nhncloud rds-mysql backup list";

function fail(message: string): never {
  throw new NhnCloudCliError(message, EXIT_PARAM_ERROR);
}

const getCommand = withRdsMysqlOptions(
  new Command("get").description("백업 하나의 상세를 조회한다").argument(BACKUP_ID, BACKUP_ID_DESCRIPTION),
).action(async (backupId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<RdsMysqlCommandOptions>();
  const id = parseUuidArgument(backupId, BACKUP_ID);
  const { client } = await resolveRdsMysqlClient(opts);

  const backup = await withRdsMysqlSpinner(`백업 조회 중 (${id})...`, () => client.getBackup(id));
  output(opts, {
    headers: ["field", "value"],
    rows: Object.entries(backup).map(([key, value]) => [formatCell(key), formatCell(value)]),
    raw: backup,
    ids: [id],
  });
});

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

const BACKUP_METHODS: Readonly<Record<string, string>> = { full: "FULL", incremental: "INCREMENTAL", snapshot: "SNAPSHOT" };

interface CreateBackupOptions extends RdsMysqlWriteOptions {
  name: string;
  method: string;
  instance?: string;
  baseBackup?: string;
}

const createCommand = withRdsMysqlWriteOptions(
  new Command("create")
    .description(
      "수동 백업을 만든다. full, snapshot 은 --instance 로, incremental 은 --base-backup 으로 지정한다. --yes가 없으면 미리보기만 한다",
    )
    .requiredOption("--name <name>", "백업 이름 (1~100자)")
    .requiredOption("--method <method>", "백업 방식 (full|incremental|snapshot)")
    .option("--instance <db-instance-id>", "백업할 DB 인스턴스 ID (UUID, full·snapshot)")
    .option("--base-backup <backup-id>", "증분 백업의 기준 백업 ID (UUID, incremental)"),
).action(async (_opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<CreateBackupOptions>();
  const wait = parseWaitOptions(opts);
  checkNameLength(opts.name, "--name", 100);
  const method = Object.hasOwn(BACKUP_METHODS, opts.method) ? BACKUP_METHODS[opts.method] : undefined;
  if (method === undefined) fail(`--method 는 full, incremental, snapshot 중 하나여야 합니다 (입력: ${JSON.stringify(opts.method)}).`);
  const incremental = method === "INCREMENTAL";
  if (incremental && (opts.baseBackup === undefined || opts.instance !== undefined)) {
    fail("incremental 은 --base-backup 만 지정합니다 (--instance 는 쓰지 않습니다).");
  }
  if (!incremental && (opts.instance === undefined || opts.baseBackup !== undefined)) {
    fail(`${opts.method} 는 --instance 만 지정합니다 (--base-backup 은 쓰지 않습니다).`);
  }
  const instanceId = opts.instance === undefined ? undefined : parseUuidArgument(opts.instance, "--instance");
  const baseBackupId = opts.baseBackup === undefined ? undefined : parseUuidArgument(opts.baseBackup, "--base-backup");
  const { client } = await resolveRdsMysqlClient(opts);

  let source: string;
  if (instanceId !== undefined) {
    const instance = await checkInstanceForWrite(client, instanceId, false);
    source = instance.dbInstanceName;
  } else {
    const base = await withRdsMysqlSpinner(`기준 백업 조회 중 (${baseBackupId})...`, () => client.getBackup(baseBackupId as string));
    source = formatCell(base["backupName"]);
  }
  process.stderr.write(
    "경고: 백업하는 동안 DB 인스턴스 부하가 늘 수 있고, 수동 백업은 직접 지울 때까지 보관되어 백업 스토리지 비용이 계속 듭니다.\n",
  );
  await applyRdsMysqlWrite(
    opts,
    wait,
    client,
    rdsMysqlOperationResult({
      operation: "backup-create",
      ...(instanceId === undefined ? {} : { dbInstanceId: instanceId }),
      target: opts.name,
      action: "create",
      details: { backupMethodType: method, source, baseBackupId: baseBackupId ?? null },
    }),
    () =>
      client.createBackup({
        backupName: opts.name,
        backupMethodType: method,
        ...(instanceId === undefined ? {} : { dbInstanceId: instanceId }),
        ...(baseBackupId === undefined ? {} : { baseBackupId }),
      }),
    BACKUP_LIST_HINT,
  );
});

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

const deleteCommand = withRdsMysqlWriteOptions(
  new Command("delete")
    .description("백업을 삭제한다. 복구할 수 없다. --yes가 없으면 미리보기만 한다")
    .argument(BACKUP_ID, BACKUP_ID_DESCRIPTION),
).action(async (backupId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<RdsMysqlWriteOptions>();
  const id = parseUuidArgument(backupId, BACKUP_ID);
  const wait = parseWaitOptions(opts);
  const { client } = await resolveRdsMysqlClient(opts);

  const backup = await withRdsMysqlSpinner(`백업 조회 중 (${id})...`, () => client.getBackup(id));
  process.stderr.write(
    "경고: 삭제한 백업은 복구할 수 없고, 이 백업을 기준으로 한 시점 복원이나 증분 백업을 쓸 수 없게 될 수 있습니다.\n",
  );
  await applyRdsMysqlWrite(
    opts,
    wait,
    client,
    rdsMysqlOperationResult({
      operation: "backup-delete",
      target: id,
      action: "delete",
      details: {
        backupName: typeof backup["backupName"] === "string" ? backup["backupName"] : null,
        backupStatus: typeof backup["backupStatus"] === "string" ? backup["backupStatus"] : null,
        backupType: typeof backup["backupType"] === "string" ? backup["backupType"] : null,
      },
    }),
    () => client.deleteBackup(id),
    BACKUP_LIST_HINT,
  );
});

// ---------------------------------------------------------------------------
// export
// ---------------------------------------------------------------------------

interface ExportBackupOptions extends RdsMysqlWriteOptions, ObjectStorageOptions {}

const exportCommand = addObjectStorageOptions(
  withRdsMysqlWriteOptions(
    new Command("export")
      .description(
        "백업을 오브젝트 스토리지로 내보낸다. API 비밀번호는 --password-file 이나 표준 입력으로 받는다. --yes가 없으면 미리보기만 한다",
      )
      .argument(BACKUP_ID, BACKUP_ID_DESCRIPTION),
  ),
).action(async (backupId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<ExportBackupOptions>();
  const id = parseUuidArgument(backupId, BACKUP_ID);
  const wait = parseWaitOptions(opts);
  const target = parseObjectStorageTarget(opts);
  const password = readObjectStoragePassword(opts.passwordFile);
  const { client } = await resolveRdsMysqlClient(opts);

  const backup = await withRdsMysqlSpinner(`백업 조회 중 (${id})...`, () => client.getBackup(id));
  process.stderr.write("안내: 내보낸 파일은 오브젝트 스토리지 사용량으로 비용이 듭니다. 같은 경로에 파일이 있으면 덮어쓸 수 있으니 경로를 확인하세요.\n");
  await applyRdsMysqlWrite(
    opts,
    wait,
    client,
    rdsMysqlOperationResult({
      operation: "backup-export",
      target: id,
      action: "export",
      details: {
        backupName: typeof backup["backupName"] === "string" ? backup["backupName"] : null,
        ...objectStorageDetails(target),
      },
    }),
    () => client.exportBackup(id, objectStorageBody(target, password)),
    `nhncloud rds-mysql backup get ${id}`,
  );
});

// ---------------------------------------------------------------------------
// restore
// ---------------------------------------------------------------------------

const restoreCommand = addRestoreOptions(
  withRdsMysqlWriteOptions(
    new Command("restore")
      .description(
        "백업으로 새 DB 인스턴스를 만든다. 지정하지 않은 사양, 네트워크, 스토리지, 백업 설정은 원본 값을 따른다. --yes가 없으면 미리보기만 한다",
      )
      .argument(BACKUP_ID, BACKUP_ID_DESCRIPTION),
  ),
  false,
).action(async (backupId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<RdsMysqlWriteOptions & RestoreBuildOptions>();
  const id = parseUuidArgument(backupId, BACKUP_ID);
  const wait = parseWaitOptions(opts);
  const built = buildRestoreBody(opts);
  const { client } = await resolveRdsMysqlClient(opts);

  const backup = await withRdsMysqlSpinner(`백업 조회 중 (${id})...`, () => client.getBackup(id));
  const status = backup["backupStatus"];
  if (typeof status === "string" && status !== "COMPLETED") {
    process.stderr.write(`경고: 백업 상태가 COMPLETED 가 아닙니다 (backupStatus=${formatCell(status)}). 서버가 거절할 수 있습니다.\n`);
  }
  process.stderr.write(`${RESTORE_COST_NOTICE}\n`);
  await applyRdsMysqlWrite(
    opts,
    wait,
    client,
    rdsMysqlOperationResult({
      operation: "backup-restore",
      target: opts.name,
      action: "create",
      details: {
        backupId: id,
        backupName: typeof backup["backupName"] === "string" ? backup["backupName"] : null,
        ...built.details,
      },
    }),
    () => client.restoreBackup(id, built.body),
    "nhncloud rds-mysql instance list",
  );
});

export const backupCommand = new Command("backup")
  .description("백업 조회, 생성, 삭제, 내보내기, 백업으로 복원 명령")
  .addCommand(listCommand)
  .addCommand(getCommand)
  .addCommand(createCommand)
  .addCommand(deleteCommand)
  .addCommand(exportCommand)
  .addCommand(restoreCommand);
