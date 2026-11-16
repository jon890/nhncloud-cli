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
  type RdsMysqlWriteOptions,
  rdsMysqlOperationResult,
  resolveRdsMysqlClient,
  withRdsMysqlOptions,
  withRdsMysqlSpinner,
  withRdsMysqlWriteOptions,
} from "./helpers.js";
import { storageTypesCommand } from "./lookup.js";

/** 자동 확장을 쓰지 않을 때 요청이 받는 스토리지 크기 상한(GB)이다. */
const MAX_STORAGE_SIZE_GB = 2048;

const getCommand = withRdsMysqlOptions(
  new Command("get")
    .description("데이터 스토리지 정보를 조회한다")
    .argument("<db-instance-id>", "DB 인스턴스 ID (UUID)"),
).action(async (dbInstanceId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<RdsMysqlCommandOptions>();
  const id = parseUuidArgument(dbInstanceId, "<db-instance-id>");
  const { client } = await resolveRdsMysqlClient(opts);

  const info = await withRdsMysqlSpinner(`스토리지 정보 조회 중 (${id})...`, () => client.getStorageInfo(id));
  output(opts, {
    headers: ["field", "value"],
    rows: Object.entries(info).map(([key, value]) => [formatCell(key), formatCell(value)]),
    raw: info,
    ids: [String(info.storageSize)],
  });
});

interface ExpandOptions extends RdsMysqlWriteOptions {
  size: string;
}

const expandCommand = withRdsMysqlWriteOptions(
  new Command("expand")
    .description(
      `데이터 스토리지를 늘린다. 줄일 수 없다. --yes가 없으면 미리보기만 한다`,
    )
    .argument("<db-instance-id>", "DB 인스턴스 ID (UUID)")
    .requiredOption("--size <gb>", `늘린 뒤 크기 (GB, 현재보다 커야 하고 ${MAX_STORAGE_SIZE_GB} 이하)`),
).action(async (dbInstanceId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<ExpandOptions>();
  const id = parseUuidArgument(dbInstanceId, "<db-instance-id>");
  const newSize = parseIntegerOption(opts.size, "--size", { min: 1, max: MAX_STORAGE_SIZE_GB });
  const wait = parseWaitOptions(opts);
  const { client } = await resolveRdsMysqlClient(opts);

  await checkInstanceForWrite(client, id, false);
  const info = await withRdsMysqlSpinner(`스토리지 정보 조회 중 (${id})...`, () => client.getStorageInfo(id));
  if (newSize < info.storageSize) {
    throw new NhnCloudCliError(
      `스토리지는 줄일 수 없습니다 (현재 ${info.storageSize}GB, 요청 ${newSize}GB). 현재보다 큰 값을 지정하세요.`,
      EXIT_PARAM_ERROR,
    );
  }
  const autoscale = info.storageAutoscale;
  const autoscaleOn = autoscale?.useStorageAutoscale === true;
  const result = rdsMysqlOperationResult({
    operation: "storage-expand",
    dbInstanceId: id,
    target: id,
    action: newSize === info.storageSize ? "unchanged" : "expand",
    details: {
      storageType: info.storageType ?? null,
      currentSizeGb: info.storageSize,
      newSizeGb: newSize,
      storageAutoscale: autoscaleOn,
    },
  });
  if (newSize === info.storageSize) {
    outputRdsMysqlWriteResult(opts, result);
    process.stderr.write(`스토리지가 이미 ${newSize}GB라 요청하지 않았습니다.\n`);
    return;
  }

  // 자동 확장을 쓰고 있으면 현재 설정을 그대로 함께 보내 끄지 않는다. 생략 시 처리가 문서에 없다.
  const body: { storageSize: number; storageAutoscale?: Record<string, unknown> } = { storageSize: newSize };
  if (autoscaleOn) {
    const { threshold, maxStorageSize, cooldownTime } = autoscale ?? {};
    if (typeof threshold !== "number" || typeof maxStorageSize !== "number" || typeof cooldownTime !== "number") {
      throw new NhnCloudCliError(
        "자동 확장 설정을 읽지 못해 요청하지 않았습니다. nhncloud rds-mysql storage get으로 응답을 확인하세요.",
        EXIT_PARAM_ERROR,
      );
    }
    body.storageAutoscale = { useStorageAutoscale: true, threshold, maxStorageSize, cooldownTime };
  }

  await applyRdsMysqlWrite(
    opts,
    wait,
    client,
    result,
    () => client.updateStorageInfo(id, body),
    `nhncloud rds-mysql storage get ${id}`,
  );
});

export const storageCommand = new Command("storage")
  .description("데이터 스토리지 조회, 유형 조회, 확장 명령")
  .addCommand(getCommand)
  .addCommand(storageTypesCommand)
  .addCommand(expandCommand);
