import { Command } from "commander";
import { output, printJson, type OutputOptions } from "../../formatters/table.js";
import type {
  DeployHistory,
  LatestDeployResult,
  WrittenStageResource,
} from "../../services/apigateway/types.js";
import { DEPLOY_STATUS_COMPLETE } from "../../services/apigateway/types.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_API_ERROR, EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { sanitizeForTerminal } from "../../utils/terminal.js";
import {
  parsePositiveIntegerOption,
  parseRequiredArgument,
} from "../parse-options.js";
import {
  requireYes,
  resolveApiGatewayClient,
  writtenStageResourceOutput,
} from "./helpers.js";

interface DeployOptions extends OutputOptions {
  region?: string;
  profile?: string;
  description?: string;
  wait?: boolean;
  timeout?: string;
  yes?: boolean;
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

const createCommand = addApiGatewayOptions(
  new Command("create")
    .description("stage 설정을 API Gateway service 에 배포한다")
    .argument("<service-id>", "API Gateway service ID")
    .argument("<stage-id>", "API Gateway stage ID")
    .option("--description <text>", "배포 설명 (최대 200자)")
    .option("--no-wait", "배포 결과를 기다리지 않고 요청만 한다")
    .option("--timeout <sec>", "배포 대기 상한 (초, 기본 300)", "300")
    .option("--yes", "배포를 확인한다"),
).action(async (
  serviceId: string,
  stageId: string,
  _opts: unknown,
  command: Command,
) => {
  const opts = command.optsWithGlobals<DeployOptions>();
  const parsedServiceId = parseRequiredArgument(serviceId, "service-id");
  const parsedStageId = parseRequiredArgument(stageId, "stage-id");
  if (opts.description !== undefined && opts.description.trim().length === 0) {
    throw new NhnCloudCliError(
      "--description 은 비어 있을 수 없습니다.",
      EXIT_PARAM_ERROR,
    );
  }
  if (opts.description !== undefined && [...opts.description].length > 200) {
    throw new NhnCloudCliError(
      "--description 은 최대 200자까지 지정할 수 있습니다.",
      EXIT_PARAM_ERROR,
    );
  }
  const timeoutMs = parsePositiveIntegerOption(opts.timeout ?? "300", "--timeout") * 1000;
  requireYes(opts.yes, "스테이지 배포");

  const displayStageId = sanitizeForTerminal(parsedStageId);
  const { client } = await resolveApiGatewayClient(opts);
  let baselineDeployId: string | null = null;
  let baselineLookupFailed = false;
  let deploy: LatestDeployResult | undefined;

  // 기준 배포 조회는 배포 스피너 밖에서 한다. 실패 안내를 배포 시작 전에 내야
  // 성공·실패·타임아웃 모든 경로에서 사용자가 판정이 약해진 것을 볼 수 있다.
  if (opts.wait) {
    startSpinner("직전 배포 확인 중...");
    try {
      const baseline = await client.getLatestDeploy(parsedServiceId, parsedStageId);
      baselineDeployId = baseline.deployId;
      stopSpinner(true);
    } catch {
      baselineLookupFailed = true;
      stopSpinner(false);
    }
  }
  if (baselineLookupFailed) {
    process.stderr.write("안내: 직전 배포 ID 를 읽지 못해 상태만으로 완료를 판정합니다.\n");
  }

  startSpinner(`API Gateway stage "${displayStageId}" 배포 중...`);
  let deployAccepted = false;
  // 서버가 결과를 알려준 경우다. 이때는 사용자가 원인을 고쳐 다시 배포해야 하므로
  // "재실행하지 말라" 는 안내가 오히려 반대 지시가 된다.
  let deployResultKnown = false;
  try {
    await client.createDeploy(parsedServiceId, parsedStageId, {
      deployDescription: opts.description,
    });
    deployAccepted = true;

    if (opts.wait) {
      deploy = await client.waitForDeploy(parsedServiceId, parsedStageId, {
        timeoutMs,
        baselineDeployId,
      });
      if (deploy.deployStatus !== DEPLOY_STATUS_COMPLETE) {
        deployResultKnown = true;
        throw new NhnCloudCliError(
          `API Gateway stage 배포 실패: deployId=${deploy.deployId}, deployStatus=${deploy.deployStatus}`,
          EXIT_API_ERROR,
        );
      }
    }
  } catch (error) {
    stopSpinner(false);
    if (deployAccepted && !deployResultKnown) {
      process.stderr.write(
        "주의: 배포 요청은 이미 접수됐습니다. 재실행하지 말고 apigateway stage deploy latest 로 결과를 확인하세요.\n",
      );
    }
    throw error;
  }
  stopSpinner(true);

  if (!opts.wait) {
    if (opts.json) {
      printJson({ requested: true });
    } else if (!opts.quiet) {
      process.stderr.write(
        "안내: 배포를 요청했습니다. 결과는 apigateway stage deploy latest 로 확인하세요.\n",
      );
    }
    return;
  }

  if (deploy === undefined) {
    throw new NhnCloudCliError(
      "API Gateway stage 배포 결과를 확인할 수 없습니다.",
      EXIT_API_ERROR,
    );
  }

  output(opts, {
    headers: ["deployId", "deployStatus", "deployedAt", "deployDescription"],
    rows: [[
      sanitizeForTerminal(deploy.deployId),
      sanitizeForTerminal(deploy.deployStatus),
      sanitizeForTerminal(deploy.deployedAt),
      sanitizeForTerminal(deploy.deployDescription),
    ]],
    raw: deploy,
    ids: [sanitizeForTerminal(deploy.deployId)],
  });
});

const rollbackCommand = addApiGatewayOptions(
  new Command("rollback")
    .description("배포 이력으로 stage 설정을 되돌린다")
    .argument("<service-id>", "API Gateway service ID")
    .argument("<stage-id>", "API Gateway stage ID")
    .argument("<deploy-id>", "되돌릴 배포 ID")
    .option("--yes", "되돌리기를 확인한다"),
).action(async (
  serviceId: string,
  stageId: string,
  deployId: string,
  _opts: unknown,
  command: Command,
) => {
  const opts = command.optsWithGlobals<DeployOptions>();
  const parsedServiceId = parseRequiredArgument(serviceId, "service-id");
  const parsedStageId = parseRequiredArgument(stageId, "stage-id");
  const parsedDeployId = parseRequiredArgument(deployId, "deploy-id");
  requireYes(opts.yes, "스테이지 되돌리기");

  const displayStageId = sanitizeForTerminal(parsedStageId);
  const { client } = await resolveApiGatewayClient(opts);

  startSpinner(`API Gateway stage "${displayStageId}" 되돌리는 중...`);
  let resources: WrittenStageResource[];
  try {
    resources = await client.rollbackDeploy(
      parsedServiceId,
      parsedStageId,
      parsedDeployId,
    );
  } catch (error) {
    stopSpinner(false);
    throw error;
  }
  stopSpinner(true);

  output(opts, writtenStageResourceOutput(resources));
  process.stderr.write(
    "안내: 되돌리기는 스테이지 설정만 바꿉니다. 서비스에 적용하려면 apigateway stage deploy create 를 실행하세요.\n",
  );
  // 이 시점엔 이미 되돌린 뒤다. "지웁니다" 같은 사전 경고체를 쓰면 시점이 어긋난다.
  process.stderr.write("완료: 직전까지의 스테이지 설정은 이 배포 이력의 내용으로 대체됐습니다.\n");
});

export const deployCommand = new Command("deploy")
  .description("API Gateway stage 배포 조회와 실행 명령")
  .addCommand(listCommand)
  .addCommand(latestCommand)
  .addCommand(createCommand)
  .addCommand(rollbackCommand);
