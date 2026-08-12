import { Command } from "commander";
import { output, type OutputOptions } from "../../formatters/table.js";
import type {
  DeployHistory,
  LatestDeployResult,
} from "../../services/apigateway/types.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { sanitizeForTerminal } from "../../utils/terminal.js";
import { parseRequiredArgument } from "../parse-options.js";
import { resolveApiGatewayClient } from "./helpers.js";

interface DeployOptions extends OutputOptions {
  region?: string;
  profile?: string;
}

function addApiGatewayOptions(command: Command): Command {
  return command
    .option("--region <region>", "API Gateway region (기본: kr1)", "kr1")
    .option("--profile <name>", "사용할 profile 이름");
}

const listCommand = addApiGatewayOptions(
  new Command("list")
    .description("API Gateway stage 배포 이력 목록을 조회한다 (전체 필드는 --json)")
    .argument("<service-id>", "API Gateway service ID")
    .argument("<stage-id>", "API Gateway stage ID"),
).action(async (
  serviceId: string,
  stageId: string,
  _opts: unknown,
  command: Command,
) => {
  const opts = command.optsWithGlobals<DeployOptions>();
  const parsedServiceId = parseRequiredArgument(serviceId, "service-id");
  const parsedStageId = parseRequiredArgument(stageId, "stage-id");
  const displayStageId = sanitizeForTerminal(parsedStageId);
  const { client } = await resolveApiGatewayClient(opts);

  startSpinner(`API Gateway stage "${displayStageId}" 배포 이력 조회 중...`);
  let deploys: DeployHistory[];
  try {
    deploys = await client.listDeploys(parsedServiceId, parsedStageId);
  } catch (error) {
    stopSpinner(false);
    throw error;
  }
  stopSpinner(true);

  output(opts, {
    headers: ["deployId", "deployedAt", "isBase", "deployDescription"],
    rows: deploys.map((deploy) => [
      sanitizeForTerminal(deploy.deployId),
      sanitizeForTerminal(deploy.deployedAt),
      String(deploy.isBase),
      sanitizeForTerminal(deploy.deployDescription),
    ]),
    raw: deploys,
    ids: deploys.map((deploy) => sanitizeForTerminal(deploy.deployId)),
  });
});

const latestCommand = addApiGatewayOptions(
  new Command("latest")
    .description("API Gateway stage 최신 배포 결과를 조회한다 (resource 전체는 --json)")
    .argument("<service-id>", "API Gateway service ID")
    .argument("<stage-id>", "API Gateway stage ID"),
).action(async (
  serviceId: string,
  stageId: string,
  _opts: unknown,
  command: Command,
) => {
  const opts = command.optsWithGlobals<DeployOptions>();
  const parsedServiceId = parseRequiredArgument(serviceId, "service-id");
  const parsedStageId = parseRequiredArgument(stageId, "stage-id");
  const displayStageId = sanitizeForTerminal(parsedStageId);
  const { client } = await resolveApiGatewayClient(opts);

  startSpinner(`API Gateway stage "${displayStageId}" 최신 배포 결과 조회 중...`);
  let deploy: LatestDeployResult;
  try {
    deploy = await client.getLatestDeploy(parsedServiceId, parsedStageId);
  } catch (error) {
    stopSpinner(false);
    throw error;
  }
  stopSpinner(true);

  output(opts, {
    headers: ["deployId", "deployStatus", "deployedAt", "isBase", "stageResourceCount"],
    rows: [[
      sanitizeForTerminal(deploy.deployId),
      sanitizeForTerminal(deploy.deployStatus),
      sanitizeForTerminal(deploy.deployedAt),
      String(deploy.isBase),
      String(deploy.stageResourceList.length),
    ]],
    raw: deploy,
    ids: [sanitizeForTerminal(deploy.deployId)],
  });
});

export const deployCommand = new Command("deploy")
  .description("API Gateway stage 배포 이력 조회 명령")
  .addCommand(listCommand)
  .addCommand(latestCommand);
