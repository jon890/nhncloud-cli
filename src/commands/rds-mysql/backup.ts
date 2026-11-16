import { Command } from "commander";
import { output } from "../../formatters/table.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { parseIntegerOption } from "../parse-options.js";
import {
  formatCell,
  parseUuidArgument,
  type RdsMysqlCommandOptions,
  resolveRdsMysqlClient,
  withRdsMysqlOptions,
  withRdsMysqlSpinner,
} from "./helpers.js";

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

export const backupInfoCommand = new Command("backup-info")
  .description("DB 인스턴스 백업 설정 조회 명령")
  .addCommand(infoGetCommand);

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

export const backupCommand = new Command("backup").description("백업 조회 명령").addCommand(listCommand);
