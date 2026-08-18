import { writeFile } from "node:fs/promises";
import { Command } from "commander";
import { output, printJson, type OutputOptions } from "../../formatters/table.js";
import type {
  Stage,
  StageResource,
  SwaggerData,
  UpdatedStage,
  WrittenStageResource,
} from "../../services/apigateway/types.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { sanitizeForTerminal } from "../../utils/terminal.js";
import { parseRequiredArgument } from "../parse-options.js";
import { deployCommand } from "./deploy.js";
import {
  requireYes,
  resolveApiGatewayClient,
  writtenStageResourceOutput,
} from "./helpers.js";

interface StageOptions extends OutputOptions {
  region?: string;
  profile?: string;
  output?: string;
  force?: boolean;
  backendEndpointUrl?: string;
  description?: string;
  yes?: boolean;
}

function addApiGatewayOptions(command: Command): Command {
  return command
    .option("--region <region>", "API Gateway region (기본: kr1)", "kr1")
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

const updateCommand = addApiGatewayOptions(
  new Command("update")
    .description("API Gateway stage의 backend endpoint URL과 설명을 수정한다")
    .argument("<service-id>", "API Gateway service ID")
    .argument("<stage-id>", "API Gateway stage ID")
    .option("--backend-endpoint-url <url>", "변경할 backend endpoint URL")
    .option("--description <text>", "변경할 stage 설명")
    .option("--yes", "스테이지 수정을 확인한다"),
).action(async (
  serviceId: string,
  stageId: string,
  _opts: unknown,
  command: Command,
) => {
  const opts = command.optsWithGlobals<StageOptions>();
  const parsedServiceId = parseRequiredArgument(serviceId, "service-id");
  const parsedStageId = parseRequiredArgument(stageId, "stage-id");

  if (opts.backendEndpointUrl === undefined && opts.description === undefined) {
    throw new NhnCloudCliError(
      "스테이지 수정에서 바꿀 값이 없습니다. --backend-endpoint-url 또는 --description을 지정하세요.",
      EXIT_PARAM_ERROR,
    );
  }
  requireYes(opts.yes, "스테이지 수정");

  const displayStageId = sanitizeForTerminal(parsedStageId);
  const { client } = await resolveApiGatewayClient(opts);

  startSpinner(`API Gateway stage "${displayStageId}" 수정 중...`);
  let updatedStage: UpdatedStage;
  try {
    const stages = await client.listStages(parsedServiceId);
    const existingStage = stages.find((stage) => stage.stageId === parsedStageId);
    if (existingStage === undefined) {
      throw new NhnCloudCliError(
        `API Gateway stage "${displayStageId}"를 찾을 수 없습니다.`,
        EXIT_PARAM_ERROR,
      );
    }

    updatedStage = await client.updateStage(parsedServiceId, parsedStageId, {
      backendEndpointUrl: opts.backendEndpointUrl ?? existingStage.backendEndpointUrl,
      stageDescription: opts.description ?? existingStage.stageDescription,
    });
  } catch (error) {
    stopSpinner(false);
    throw error;
  }
  stopSpinner(true);

  output(opts, {
    headers: ["stageId", "stageName", "stageUrl", "backendEndpointUrl", "updatedAt"],
    rows: [[
      sanitizeForTerminal(updatedStage.stageId),
      updatedStage.stageName === null ? "-" : sanitizeForTerminal(updatedStage.stageName),
      sanitizeForTerminal(updatedStage.stageUrl),
      sanitizeForTerminal(updatedStage.backendEndpointUrl),
      sanitizeForTerminal(updatedStage.updatedAt),
    ]],
    raw: updatedStage,
    ids: [sanitizeForTerminal(updatedStage.stageId)],
  });
  process.stderr.write("안내: 스테이지 변경 후 실제 트래픽 반영 상태를 확인하세요.\n");
});

const importResourcesCommand = addApiGatewayOptions(
  new Command("import-resources")
    .description("API Gateway service 의 리소스를 stage 로 가져온다")
    .argument("<service-id>", "API Gateway service ID")
    .argument("<stage-id>", "API Gateway stage ID")
    .option("--yes", "스테이지 반영을 확인한다"),
).action(async (
  serviceId: string,
  stageId: string,
  _opts: unknown,
  command: Command,
) => {
  const opts = command.optsWithGlobals<StageOptions>();
  const parsedServiceId = parseRequiredArgument(serviceId, "service-id");
  const parsedStageId = parseRequiredArgument(stageId, "stage-id");
  requireYes(opts.yes, "스테이지 반영");

  const displayStageId = sanitizeForTerminal(parsedStageId);
  const { client } = await resolveApiGatewayClient(opts);

  startSpinner(`API Gateway stage "${displayStageId}" 리소스 반영 중...`);
  let resources: WrittenStageResource[];
  try {
    resources = await client.importStageResources(parsedServiceId, parsedStageId);
  } catch (error) {
    stopSpinner(false);
    throw error;
  }
  stopSpinner(true);

  output(opts, writtenStageResourceOutput(resources));
  process.stderr.write(
    "안내: 반영은 스테이지 설정만 바꿉니다. 서비스에 적용하려면 apigateway stage deploy create 를 실행하세요.\n",
  );
});

export const stageCommand = new Command("stage")
  .description("API Gateway stage 조회 및 변경 명령")
  .addCommand(listCommand)
  .addCommand(swaggerCommand)
  .addCommand(resourcesCommand)
  .addCommand(updateCommand)
  .addCommand(importResourcesCommand)
  .addCommand(deployCommand);
