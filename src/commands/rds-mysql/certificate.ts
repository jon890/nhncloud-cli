import { Command } from "commander";
import { output } from "../../formatters/table.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
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

const CERTIFICATE_TYPES: Readonly<Record<string, string>> = { ca: "CA_FILE", cert: "CERT_FILE", key: "KEY_FILE" };

const listCommand = withRdsMysqlOptions(
  new Command("list").description("DB 인스턴스의 CA·SSL 인증서 파일 목록을 조회한다").argument(ID_ARGUMENT, ID_DESCRIPTION),
).action(async (dbInstanceId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<RdsMysqlCommandOptions>();
  const id = parseUuidArgument(dbInstanceId, ID_ARGUMENT);
  const { client } = await resolveRdsMysqlClient(opts);

  const files = await withRdsMysqlSpinner(`인증서 목록 조회 중 (${id})...`, () => client.listCertificates(id));
  output(opts, {
    headers: ["fileName", "certificateType", "fileSize", "createdYmdt"],
    rows: files.map((f) => [
      formatCell(f.fileName),
      formatCell(f.certificateType),
      typeof f.fileSize === "number" ? formatBytes(f.fileSize) : "-",
      formatCell(f.createdYmdt),
    ]),
    raw: files,
    ids: files.map((f) => f.fileName),
  });
});

interface ExportOptions extends RdsMysqlWriteOptions, ObjectStorageOptions {
  type?: string[];
}

const exportCommand = addObjectStorageOptions(
  withRdsMysqlWriteOptions(
    new Command("export")
      .description(
        "인증서 파일을 오브젝트 스토리지로 내보낸다. API 비밀번호는 --password-file 이나 표준 입력으로 받는다. --yes가 없으면 미리보기만 한다",
      )
      .argument(ID_ARGUMENT, ID_DESCRIPTION)
      .requiredOption("--type <type>", "내보낼 파일 유형 (ca|cert|key). 여러 번 지정할 수 있다", collectOption, [] as string[]),
  ),
).action(async (dbInstanceId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<ExportOptions>();
  const id = parseUuidArgument(dbInstanceId, ID_ARGUMENT);
  const wait = parseWaitOptions(opts);
  const types = [...new Set(opts.type ?? [])].map((value) => {
    const mapped = Object.hasOwn(CERTIFICATE_TYPES, value) ? CERTIFICATE_TYPES[value] : undefined;
    if (mapped === undefined) {
      throw new NhnCloudCliError(`--type 은 ca, cert, key 중 하나여야 합니다 (입력: ${JSON.stringify(value)}).`, EXIT_PARAM_ERROR);
    }
    return mapped;
  });
  const target = parseObjectStorageTarget(opts);
  const password = readObjectStoragePassword(opts.passwordFile);
  const { client } = await resolveRdsMysqlClient(opts);

  const instance = await checkInstanceForWrite(client, id, false);
  if (types.includes("KEY_FILE")) {
    process.stderr.write("경고: 개인키(key) 파일을 내보냅니다. 대상 컨테이너의 접근 권한을 확인하세요.\n");
  }
  await applyRdsMysqlWrite(
    opts,
    wait,
    client,
    rdsMysqlOperationResult({
      operation: "certificate-export",
      dbInstanceId: id,
      target: instance.dbInstanceName,
      action: "export",
      details: { certificateTypes: types, ...objectStorageDetails(target) },
    }),
    () => client.exportCertificates(id, { certificateTypes: types, ...objectStorageBody(target, password) }),
    `nhncloud rds-mysql certificate list ${id}`,
  );
});

export const certificateCommand = new Command("certificate")
  .description("CA·SSL 인증서 파일 조회와 오브젝트 스토리지로 내보내기 명령")
  .addCommand(listCommand)
  .addCommand(exportCommand);
