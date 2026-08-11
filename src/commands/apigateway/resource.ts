import { Command } from "commander";
import { output, type OutputOptions } from "../../formatters/table.js";
import { parseRequiredArgument } from "../parse-options.js";
import type {
  Resource,
  ResourceParameters,
  ResourceResponses,
} from "../../services/apigateway/types.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { resolveApiGatewayClient, sanitizeForTerminal } from "./helpers.js";

interface ResourceOptions extends OutputOptions {
  region?: string;
  appKey?: string;
  profile?: string;
}

function addApiGatewayOptions(command: Command): Command {
  return command
    .option("--region <region>", "API Gateway region (기본: kr1)", "kr1")
    .option("--app-key <key>", "API Gateway appKey (profile 의 apigateway.appkey 보다 우선)")
    .option("--profile <name>", "사용할 profile 이름");
}

function displayUnknown(value: unknown): string {
  const serialized = JSON.stringify(value);
  return serialized ?? String(value);
}

const listCommand = addApiGatewayOptions(
  new Command("list")
    .description("API Gateway resource 목록을 조회한다 (전체 필드는 --json)")
    .argument("<service-id>", "API Gateway service ID"),
).action(async (serviceId: string, _opts: unknown, command: Command) => {
  const opts = command.optsWithGlobals<ResourceOptions>();
  const parsedServiceId = parseRequiredArgument(serviceId, "service-id");
  const displayServiceId = sanitizeForTerminal(parsedServiceId);
  const { client } = await resolveApiGatewayClient(opts);

  startSpinner(`API Gateway service "${displayServiceId}" resource 목록 조회 중...`);
  let resources: Resource[];
  try {
    resources = await client.listResources(parsedServiceId);
  } catch (err) {
    stopSpinner(false);
    throw err;
  }
  stopSpinner(true);

  output(opts, {
    headers: ["resourceId", "path", "methodType", "methodName", "updatedAt"],
    rows: resources.map((resource) => [
      sanitizeForTerminal(resource.resourceId),
      sanitizeForTerminal(resource.path),
      resource.methodType === null ? "-" : sanitizeForTerminal(resource.methodType),
      resource.methodName === null ? "-" : sanitizeForTerminal(resource.methodName),
      sanitizeForTerminal(resource.updatedAt),
    ]),
    raw: resources,
    ids: resources.map((resource) => sanitizeForTerminal(resource.resourceId)),
  });
});

const parametersCommand = addApiGatewayOptions(
  new Command("parameters")
    .description("API Gateway resource 요청 parameter를 조회한다 (전체 필드는 --json)")
    .argument("<service-id>", "API Gateway service ID")
    .argument("<resource-id>", "API Gateway resource ID"),
).action(async (
  serviceId: string,
  resourceId: string,
  _opts: unknown,
  command: Command,
) => {
  const opts = command.optsWithGlobals<ResourceOptions>();
  const parsedServiceId = parseRequiredArgument(serviceId, "service-id");
  const parsedResourceId = parseRequiredArgument(resourceId, "resource-id");
  const displayResourceId = sanitizeForTerminal(parsedResourceId);
  const { client } = await resolveApiGatewayClient(opts);

  startSpinner(`API Gateway resource "${displayResourceId}" parameter 조회 중...`);
  let parameters: ResourceParameters;
  try {
    parameters = await client.getResourceParameters(parsedServiceId, parsedResourceId);
  } catch (err) {
    stopSpinner(false);
    throw err;
  }
  stopSpinner(true);

  output(opts, {
    headers: ["type", "count"],
    rows: [
      ["queryString", String(parameters.queryStringList.length)],
      ["header", String(parameters.headerList.length)],
      ["formData", String(parameters.formDataList.length)],
      ["contentType", String(parameters.contentTypeList.length)],
    ],
    raw: parameters,
    ids: [],
  });
});

const responsesCommand = addApiGatewayOptions(
  new Command("responses")
    .description("API Gateway resource 응답 정의를 조회한다 (전체 필드는 --json)")
    .argument("<service-id>", "API Gateway service ID")
    .argument("<resource-id>", "API Gateway resource ID"),
).action(async (
  serviceId: string,
  resourceId: string,
  _opts: unknown,
  command: Command,
) => {
  const opts = command.optsWithGlobals<ResourceOptions>();
  const parsedServiceId = parseRequiredArgument(serviceId, "service-id");
  const parsedResourceId = parseRequiredArgument(resourceId, "resource-id");
  const displayResourceId = sanitizeForTerminal(parsedResourceId);
  const { client } = await resolveApiGatewayClient(opts);

  startSpinner(`API Gateway resource "${displayResourceId}" 응답 정의 조회 중...`);
  let responses: ResourceResponses;
  try {
    responses = await client.getResourceResponses(parsedServiceId, parsedResourceId);
  } catch (err) {
    stopSpinner(false);
    throw err;
  }
  stopSpinner(true);

  output(opts, {
    headers: ["response"],
    rows: responses.responseList.map((response) => [
      sanitizeForTerminal(displayUnknown(response)),
    ]),
    raw: responses,
    ids: [],
  });
});

export const resourceCommand = new Command("resource")
  .description("API Gateway resource 조회 명령")
  .addCommand(listCommand)
  .addCommand(parametersCommand)
  .addCommand(responsesCommand);
