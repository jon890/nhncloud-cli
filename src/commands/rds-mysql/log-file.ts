import { constants, existsSync } from "node:fs";
import { open } from "node:fs/promises";
import { Command } from "commander";
import { output, printJson } from "../../formatters/table.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { sanitizeForTerminal, sanitizeMultilineForTerminal } from "../../utils/terminal.js";
import { collectOption } from "../parse-options.js";
import { formatBytes } from "./binlog.js";
import {
  applyRdsMysqlWrite,
  checkInstanceForWrite,
  formatCell,
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
import {
  addObjectStorageOptions,
  type ObjectStorageOptions,
  objectStorageBody,
  objectStorageDetails,
  parseObjectStorageTarget,
  readObjectStoragePassword,
} from "./object-storage.js";

const ID_ARGUMENT = "<db-instance-id>";
const ID_DESCRIPTION = "DB 인스턴스 ID (UUID)";

const LOG_FILE_TYPES: Readonly<Record<string, string>> = {
  error: "ERROR",
  binlog: "BINLOG",
  general: "GENERAL",
  "slow-query": "SLOW_QUERY",
  audit: "AUDIT",
  backup: "BACKUP",
};
const TYPE_NAMES = Object.keys(LOG_FILE_TYPES).join("|");

/** 로그 내용 보기 API 가 한 번에 돌려주는 최대 바이트 수다. */
const MAX_CONTENT_BYTES = 65533;

function parseLogFileType(value: string): string {
  const mapped = Object.hasOwn(LOG_FILE_TYPES, value) ? LOG_FILE_TYPES[value] : undefined;
  if (mapped === undefined) {
    throw new NhnCloudCliError(`--type 은 ${TYPE_NAMES} 중 하나여야 합니다 (입력: ${JSON.stringify(value)}).`, EXIT_PARAM_ERROR);
  }
  return mapped;
}

interface ListOptions extends RdsMysqlCommandOptions {
  type?: string[];
}

const listCommand = withRdsMysqlOptions(
  new Command("list")
    .description("DB 인스턴스의 로그 파일 목록을 조회한다")
    .argument(ID_ARGUMENT, ID_DESCRIPTION)
    .option("--type <type>", `로그 유형 (${TYPE_NAMES}). 여러 번 지정할 수 있다`, collectOption, [] as string[]),
).action(async (dbInstanceId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<ListOptions>();
  const id = parseUuidArgument(dbInstanceId, ID_ARGUMENT);
  const types = [...new Set(opts.type ?? [])].map(parseLogFileType);
  const { client } = await resolveRdsMysqlClient(opts);

  const files = await withRdsMysqlSpinner(`로그 파일 목록 조회 중 (${id})...`, () =>
    client.listLogFiles(id, types.length === 0 ? undefined : types),
  );
  output(opts, {
    headers: ["logFileName", "logFileType", "logFileSize", "createdYmdt"],
    rows: files.map((f) => [
      formatCell(f.logFileName),
      formatCell(f.logFileType),
      typeof f.logFileSize === "number" ? formatBytes(f.logFileSize) : "-",
      formatCell(f.createdYmdt),
    ]),
    raw: files,
    ids: files.map((f) => f.logFileName),
  });
});

interface GetOptions extends RdsMysqlCommandOptions {
  type: string;
  outputFile?: string;
}

const getCommand = withRdsMysqlOptions(
  new Command("get")
    .description(
      `로그 파일 내용을 내려받는다. 한 번에 최대 ${MAX_CONTENT_BYTES} 바이트까지 받는다. 기본은 표준 출력이고 --output-file 이면 파일로 쓴다(이미 있으면 쓰지 않는다)`,
    )
    .argument(ID_ARGUMENT, ID_DESCRIPTION)
    .argument("<log-file-name>", "로그 파일 이름 (log-file list)")
    .requiredOption("--type <type>", `로그 유형 (${TYPE_NAMES})`)
    .option("--output-file <path>", "내용을 저장할 파일 경로"),
).action(async (dbInstanceId: string, logFileName: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<GetOptions>();
  const id = parseUuidArgument(dbInstanceId, ID_ARGUMENT);
  const type = parseLogFileType(opts.type);
  if (logFileName.trim() === "") {
    throw new NhnCloudCliError("<log-file-name> 인수가 비어있습니다.", EXIT_PARAM_ERROR);
  }
  if (opts.outputFile !== undefined && existsSync(opts.outputFile)) {
    throw new NhnCloudCliError(`--output-file 경로에 이미 파일이 있습니다. 덮어쓰지 않습니다: ${opts.outputFile}`, EXIT_PARAM_ERROR);
  }
  const { client } = await resolveRdsMysqlClient(opts);

  const content = await withRdsMysqlSpinner(`로그 파일 내용 조회 중 (${id})...`, () => client.getLogFileContent(id, logFileName, type));
  const truncated = Buffer.byteLength(content, "utf8") >= MAX_CONTENT_BYTES;
  if (truncated) {
    process.stderr.write(
      `안내: 내용이 ${MAX_CONTENT_BYTES} 바이트 한도에 닿아 뒷부분이 잘렸을 수 있습니다. 전체가 필요하면 log-file export 로 오브젝트 스토리지에 내보내세요.\n`,
    );
  }
  if (opts.outputFile !== undefined) {
    // 같은 이름 파일이 생겼으면 덮어쓰지 않고 실패한다. 로그에는 민감한 값이 있을 수 있어 소유자만 읽게 한다.
    const handle = await open(opts.outputFile, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    try {
      await handle.writeFile(content, "utf8");
    } finally {
      await handle.close();
    }
    process.stderr.write(`저장했습니다: ${sanitizeForTerminal(opts.outputFile)}\n`);
    return;
  }
  if (opts.json === true) {
    printJson({ dbInstanceId: id, logFileName, logFileType: type, truncated, content });
    return;
  }
  process.stdout.write(sanitizeMultilineForTerminal(content.endsWith("\n") ? content : `${content}\n`));
});

interface ExportOptions extends RdsMysqlWriteOptions, ObjectStorageOptions {
  file?: string[];
}

const exportCommand = addObjectStorageOptions(
  withRdsMysqlWriteOptions(
    new Command("export")
      .description(
        "로그 파일을 오브젝트 스토리지로 내보낸다. API 비밀번호는 --password-file 이나 표준 입력으로 받는다. --yes가 없으면 미리보기만 한다",
      )
      .argument(ID_ARGUMENT, ID_DESCRIPTION)
      .requiredOption("--file <name>", "내보낼 로그 파일 이름 (log-file list). 여러 번 지정할 수 있다", collectOption, [] as string[]),
  ),
).action(async (dbInstanceId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<ExportOptions>();
  const id = parseUuidArgument(dbInstanceId, ID_ARGUMENT);
  const wait = parseWaitOptions(opts);
  const names = [...new Set(opts.file ?? [])];
  if (names.some((name) => name.trim() === "")) {
    throw new NhnCloudCliError("--file 이 비어 있습니다.", EXIT_PARAM_ERROR);
  }
  const target = parseObjectStorageTarget(opts);
  const password = readObjectStoragePassword(opts.passwordFile);
  const { client } = await resolveRdsMysqlClient(opts);

  const instance = await checkInstanceForWrite(client, id, false);
  await applyRdsMysqlWrite(
    opts,
    wait,
    client,
    rdsMysqlOperationResult({
      operation: "log-file-export",
      dbInstanceId: id,
      target: instance.dbInstanceName,
      action: "export",
      details: { logFileNames: names, ...objectStorageDetails(target) },
    }),
    () => client.exportLogFiles(id, { logFileNames: names, ...objectStorageBody(target, password) }),
    `nhncloud rds-mysql log-file list ${id}`,
  );
});

export const logFileCommand = new Command("log-file")
  .description("로그 파일 목록 조회, 내용 내려받기, 오브젝트 스토리지로 내보내기 명령")
  .addCommand(listCommand)
  .addCommand(getCommand)
  .addCommand(exportCommand);
