import { Command } from "commander";
import { output } from "../../formatters/table.js";
import type { RdsMysqlBinLog } from "../../services/rds-mysql/types.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { sanitizeForTerminal } from "../../utils/terminal.js";
import {
  applyRdsMysqlWrite,
  checkInstanceForWrite,
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

/** 파일 이름 끝의 번호(mysql-bin.000010 의 10)다. 번호가 없으면 null 이다. */
function sequenceOf(name: string): number | null {
  const match = /\.(\d+)$/.exec(name);
  return match === null ? null : Number(match[1]);
}

/** 번호가 있으면 번호로, 없으면 이름으로 오름차순 정렬한다. 서버가 준 순서를 믿지 않는다. */
export function sortBinLogs(logs: RdsMysqlBinLog[]): RdsMysqlBinLog[] {
  return [...logs].sort((a, b) => {
    const left = sequenceOf(a.binLogFileName);
    const right = sequenceOf(b.binLogFileName);
    if (left !== null && right !== null && left !== right) return left - right;
    return a.binLogFileName.localeCompare(b.binLogFileName);
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unit = -1;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

interface ListOptions extends RdsMysqlCommandOptions {
  deletable?: boolean;
}

const listCommand = withRdsMysqlOptions(
  new Command("list")
    .description("바이너리 로그 파일 목록을 조회한다")
    .argument("<db-instance-id>", "DB 인스턴스 ID (UUID)")
    .option("--deletable", "삭제할 수 있는 파일만 보인다 (가장 최근 파일 제외)"),
).action(async (dbInstanceId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<ListOptions>();
  const id = parseUuidArgument(dbInstanceId, "<db-instance-id>");
  const { client } = await resolveRdsMysqlClient(opts);

  const logs = sortBinLogs(
    await withRdsMysqlSpinner(`바이너리 로그 조회 중 (${id})...`, () => client.listBinLogs(id, opts.deletable === true)),
  );
  output(opts, {
    headers: ["binLogFileName", "binLogFileSize", "createdYmdt"],
    rows: logs.map((l) => [formatCell(l.binLogFileName), formatCell(l.binLogFileSize), formatCell(l.createdYmdt)]),
    raw: logs,
    ids: logs.map((l) => l.binLogFileName),
  });
  const total = logs.reduce((sum, l) => sum + l.binLogFileSize, 0);
  process.stderr.write(`바이너리 로그 ${logs.length}개, 합계 ${formatBytes(total)}\n`);
});

interface PurgeOptions extends RdsMysqlWriteOptions {
  before: string;
}

const purgeCommand = withRdsMysqlConfirmOptions(
  new Command("purge")
    .description(
      "지정한 파일 직전까지 바이너리 로그를 지운다. 지운 파일은 되돌릴 수 없고 특정 시점 복원이 안 될 수 있다. --yes가 없으면 미리보기만 한다",
    )
    .argument("<db-instance-id>", "DB 인스턴스 ID (UUID)")
    .requiredOption("--before <file>", "이 파일은 남기고 이 파일 직전까지 지운다 (예: mysql-bin.000010)"),
).action(async (dbInstanceId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<PurgeOptions>();
  const id = parseUuidArgument(dbInstanceId, "<db-instance-id>");
  if (opts.before.trim() === "" || opts.before !== opts.before.trim()) {
    throw new NhnCloudCliError("--before는 앞뒤 공백 없는 파일 이름이어야 합니다.", EXIT_PARAM_ERROR);
  }
  const { client } = await resolveRdsMysqlClient(opts);

  await checkInstanceForWrite(client, id, false);
  const logs = sortBinLogs(await withRdsMysqlSpinner(`바이너리 로그 조회 중 (${id})...`, () => client.listBinLogs(id, false)));
  const index = logs.findIndex((l) => l.binLogFileName === opts.before);
  if (index < 0) {
    throw new NhnCloudCliError(
      `바이너리 로그 파일을 찾을 수 없습니다: ${JSON.stringify(opts.before)}. nhncloud rds-mysql binlog list ${id}로 파일 이름을 확인하세요.`,
      EXIT_PARAM_ERROR,
    );
  }
  const doomed = logs.slice(0, index);
  const bytes = doomed.reduce((sum, l) => sum + l.binLogFileSize, 0);
  const result = rdsMysqlOperationResult({
    operation: "binlog-purge",
    dbInstanceId: id,
    target: opts.before,
    action: doomed.length === 0 ? "unchanged" : "purge",
    details: {
      deleteFileCount: doomed.length,
      deleteBytes: bytes,
      deleteSize: formatBytes(bytes),
      firstDeleted: doomed[0]?.binLogFileName ?? null,
      lastDeleted: doomed[doomed.length - 1]?.binLogFileName ?? null,
      keepFileCount: logs.length - doomed.length,
      keepFrom: opts.before,
    },
  });

  if (doomed.length === 0) {
    outputRdsMysqlWriteResult(opts, result);
    process.stderr.write(`${sanitizeForTerminal(opts.before)}가 가장 오래된 파일이라 지울 파일이 없어 요청하지 않았습니다.\n`);
    return;
  }
  process.stderr.write(
    "경고: 지운 바이너리 로그는 되돌릴 수 없고, 특정 시점 복원(바이너리 로그 기반)이 안 될 수 있습니다. 복제(Read Replica, Standby)가 아직 읽지 않은 파일을 지우면 복제가 중단될 수 있습니다.\n",
  );

  await applyRdsMysqlWrite(
    opts,
    { wait: false, timeoutMs: 0 },
    client,
    result,
    async () => {
      await client.purgeBinLogs(id, opts.before);
      return null;
    },
    `nhncloud rds-mysql binlog list ${id}`,
  );
});

export const binlogCommand = new Command("binlog")
  .description("바이너리 로그 조회와 삭제 명령")
  .addCommand(listCommand)
  .addCommand(purgeCommand);
