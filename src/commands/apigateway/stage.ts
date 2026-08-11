import { writeFile } from "node:fs/promises";
import { Command } from "commander";
import { output, printJson, type OutputOptions } from "../../formatters/table.js";
import type { Stage, StageResource, SwaggerData } from "../../services/apigateway/types.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { parseRequiredArgument } from "../parse-options.js";
import { deployCommand } from "./deploy.js";
import { resolveApiGatewayClient, sanitizeForTerminal } from "./helpers.js";

interface StageOptions extends OutputOptions {
  region?: string;
  appKey?: string;
  profile?: string;
  output?: string;
  force?: boolean;
}

function addApiGatewayOptions(command: Command): Command {
  return command
    .option("--region <region>", "API Gateway region (기본: kr1)", "kr1")
    .option("--app-key <key>", "API Gateway appKey (profile 의 apigateway.appkey 보다 우선)")
    .option("--profile <name>", "사용할 profile 이름");
}

function fileErrorReason(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = error.code;
    if (typeof code === "string") return code;
  }
  return error instanceof Error ? error.message : String(error);
}

/** Swagger 객체를 JSON 파일로 저장하고 모든 파일 시스템 오류를 입력 오류로 정규화한다. */
export async function writeStageSwaggerFile(
  path: string,
  swagger: SwaggerData,
  force?: boolean,
): Promise<void> {
  try {
    await writeFile(path, JSON.stringify(swagger, null, 2) + "\n", {
      encoding: "utf-8",
      flag: force ? "w" : "wx",
    });
  } catch (error) {
    const reason = fileErrorReason(error);
    const guidance = reason === "EEXIST" ? " 덮어쓰려면 --force 를 지정하세요." : "";
    throw new NhnCloudCliError(
      `Swagger 파일 저장 실패: ${JSON.stringify(path)} (${JSON.stringify(reason)}).${guidance}`,
      EXIT_PARAM_ERROR,
    );
  }
}

const listCommand = addApiGatewayOptions(
  new Command("list")
    .description("API Gateway stage 목록을 조회한다 (resourceUpdatedAt은 리소스 반영 시각)")
    .argument("<service-id>", "API Gateway service ID"),
).action(async (serviceId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<StageOptions>();
  const parsedServiceId = parseRequiredArgument(serviceId, "service-id");
  const displayServiceId = sanitizeForTerminal(parsedServiceId);
  const { client } = await resolveApiGatewayClient(opts);

  startSpinner(`API Gateway service "${displayServiceId}" stage 목록 조회 중...`);
  let stages: Stage[];
  try {
    stages = await client.listStages(parsedServiceId);
  } catch (error) {
    stopSpinner(false);
    throw error;
  }
  stopSpinner(true);

  output(opts, {
    headers: ["stageId", "stageName", "stageUrl", "backendEndpointUrl", "resourceUpdatedAt"],
    rows: stages.map((stage) => [
      sanitizeForTerminal(stage.stageId),
      stage.stageName === null ? "-" : sanitizeForTerminal(stage.stageName),
      sanitizeForTerminal(stage.stageUrl),
      sanitizeForTerminal(stage.backendEndpointUrl),
      sanitizeForTerminal(stage.resourceUpdatedAt),
    ]),
    raw: stages,
    ids: stages.map((stage) => sanitizeForTerminal(stage.stageId)),
  });
});

const swaggerCommand = addApiGatewayOptions(
  new Command("swagger")
    .description("API Gateway stage Swagger를 출력하거나 저장한다")
    .argument("<service-id>", "API Gateway service ID")
    .argument("<stage-id>", "API Gateway stage ID")
    .option("--output <file>", "Swagger JSON 저장 경로")
    .option("--force", "기존 파일 덮어쓰기"),
).action(async (
  serviceId: string,
  stageId: string,
  _opts: unknown,
  command: Command,
) => {
  const opts = command.optsWithGlobals<StageOptions>();
  const parsedServiceId = parseRequiredArgument(serviceId, "service-id");
  const parsedStageId = parseRequiredArgument(stageId, "stage-id");
  const displayStageId = sanitizeForTerminal(parsedStageId);
  const { client } = await resolveApiGatewayClient(opts);

  startSpinner(`API Gateway stage "${displayStageId}" Swagger 조회 중...`);
  let swagger: SwaggerData;
  try {
    swagger = await client.getStageSwagger(parsedServiceId, parsedStageId);
  } catch (error) {
    stopSpinner(false);
    throw error;
  }
  stopSpinner(true);

  if (opts.output !== undefined) {
    await writeStageSwaggerFile(opts.output, swagger, opts.force);
    process.stdout.write(sanitizeForTerminal(opts.output) + "\n");
    return;
  }

  printJson(swagger);
});

const resourcesCommand = addApiGatewayOptions(
  new Command("resources")
    .description("배포된 API Gateway stage resource 목록을 조회한다 (전체 필드는 --json)")
    .argument("<service-id>", "API Gateway service ID")
    .argument("<stage-id>", "API Gateway stage ID"),
).action(async (
  serviceId: string,
  stageId: string,
  _opts: unknown,
  command: Command,
) => {
  const opts = command.optsWithGlobals<StageOptions>();
  const parsedServiceId = parseRequiredArgument(serviceId, "service-id");
  const parsedStageId = parseRequiredArgument(stageId, "stage-id");
  const displayStageId = sanitizeForTerminal(parsedStageId);
  const { client } = await resolveApiGatewayClient(opts);

  startSpinner(`API Gateway stage "${displayStageId}" resource 목록 조회 중...`);
  let resources: StageResource[];
  try {
    resources = await client.listStageResources(parsedServiceId, parsedStageId);
  } catch (error) {
    stopSpinner(false);
    throw error;
  }
  stopSpinner(true);

  output(opts, {
    headers: ["stageResourceId", "path", "methodType", "customBackendEndpointUrl", "updatedAt"],
    rows: resources.map((resource) => [
      sanitizeForTerminal(resource.stageResourceId),
      sanitizeForTerminal(resource.path),
      resource.methodType === null ? "-" : sanitizeForTerminal(resource.methodType),
      resource.customBackendEndpointUrl === null
        ? "-"
        : sanitizeForTerminal(resource.customBackendEndpointUrl),
      sanitizeForTerminal(resource.updatedAt),
    ]),
    raw: resources,
    ids: resources.map((resource) => sanitizeForTerminal(resource.stageResourceId)),
  });
});

export const stageCommand = new Command("stage")
  .description("API Gateway stage 조회 명령")
  .addCommand(listCommand)
  .addCommand(swaggerCommand)
  .addCommand(resourcesCommand)
  .addCommand(deployCommand);
