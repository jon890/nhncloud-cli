import { Command } from "commander";
import { output, type OutputOptions } from "../../formatters/table.js";
import { parseRequiredArgument } from "../parse-options.js";
import type {
  MethodPluginUpdateBody,
  PathPluginInput,
  PluginInput,
  Resource,
  ResourceParameters,
  ResourceResponses,
  UpdatedResource,
} from "../../services/apigateway/types.js";
import {
  METHOD_PLUGIN_TYPES,
  PATH_PLUGIN_TYPES,
} from "../../services/apigateway/types.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import {
  collectAffectedPaths,
  readPluginConfigFile,
  requireYes,
  resolveApiGatewayClient,
  sanitizeForTerminal,
} from "./helpers.js";

interface ResourceOptions extends OutputOptions {
  region?: string;
  profile?: string;
  configFile?: string;
  dryRun?: boolean;
  yes?: boolean;
}

function addApiGatewayOptions(command: Command): Command {
  return command
    .option("--region <region>", "API Gateway region (기본: kr1)", "kr1")
    .option("--profile <name>", "사용할 profile 이름");
}

function displayUnknown(value: unknown): string {
  const serialized = JSON.stringify(value);
  return serialized ?? String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function configError(message: string): never {
  throw new NhnCloudCliError(message, EXIT_PARAM_ERROR);
}

function parsePluginInput(
  value: unknown,
  allowedTypes: readonly string[],
  label: string,
  rejectApplyChildPath: boolean,
): PathPluginInput {
  if (!isRecord(value)) {
    return configError(`${label} 항목은 JSON 객체여야 합니다.`);
  }
  if (typeof value["pluginType"] !== "string" || !allowedTypes.includes(value["pluginType"])) {
    return configError(`${label}의 pluginType이 허용된 타입이 아닙니다.`);
  }
  if (rejectApplyChildPath && "applyChildPath" in value) {
    return configError(`${label}에는 applyChildPath를 사용할 수 없습니다.`);
  }
  if ("delete" in value && typeof value["delete"] !== "boolean") {
    return configError(`${label}의 delete는 boolean이어야 합니다.`);
  }
  if ("applyChildPath" in value && typeof value["applyChildPath"] !== "boolean") {
    return configError(`${label}의 applyChildPath는 boolean이어야 합니다.`);
  }
  if (value["delete"] !== true && value["pluginConfigJson"] === undefined) {
    return configError(`${label}에서 delete가 true가 아니면 pluginConfigJson이 필요합니다.`);
  }
  if (
    value["pluginConfigJson"] !== undefined &&
    !isRecord(value["pluginConfigJson"])
  ) {
    return configError(`${label}의 pluginConfigJson은 JSON 객체여야 합니다.`);
  }

  return {
    pluginType: value["pluginType"],
    ...(isRecord(value["pluginConfigJson"])
      ? { pluginConfigJson: value["pluginConfigJson"] }
      : {}),
    ...(typeof value["delete"] === "boolean" ? { delete: value["delete"] } : {}),
    ...(typeof value["applyChildPath"] === "boolean"
      ? { applyChildPath: value["applyChildPath"] }
      : {}),
  };
}

function parsePathPluginConfig(value: unknown): PathPluginInput[] {
  if (
    !isRecord(value) ||
    !Array.isArray(value["pathPluginList"]) ||
    value["pathPluginList"].length === 0
  ) {
    return configError("설정 파일의 pathPluginList는 비어 있지 않은 배열이어야 합니다.");
  }
  return value["pathPluginList"].map((item, index) =>
    parsePluginInput(item, PATH_PLUGIN_TYPES, `pathPluginList[${index}]`, false)
  );
}

interface MethodPluginConfig {
  methodName?: string;
  methodDescription?: string;
  methodPluginList: PluginInput[];
}

function parseMethodPluginConfig(value: unknown): MethodPluginConfig {
  if (
    !isRecord(value) ||
    !Array.isArray(value["methodPluginList"]) ||
    value["methodPluginList"].length === 0
  ) {
    return configError("설정 파일의 methodPluginList는 비어 있지 않은 배열이어야 합니다.");
  }
  if (value["methodName"] !== undefined && typeof value["methodName"] !== "string") {
    return configError("methodName은 문자열이어야 합니다.");
  }
  if (
    value["methodDescription"] !== undefined &&
    typeof value["methodDescription"] !== "string"
  ) {
    return configError("methodDescription은 문자열이어야 합니다.");
  }

  return {
    methodName: value["methodName"],
    methodDescription: value["methodDescription"],
    methodPluginList: value["methodPluginList"].map((item, index) =>
      parsePluginInput(item, METHOD_PLUGIN_TYPES, `methodPluginList[${index}]`, true)
    ),
  };
}

function updatedResourceOutput(opts: ResourceOptions, resources: UpdatedResource[]): void {
  output(opts, {
    headers: ["resourceId", "path", "methodType"],
    rows: resources.map((resource) => [
      sanitizeForTerminal(resource.resourceId),
      sanitizeForTerminal(resource.path),
      resource.methodType == null ? "-" : sanitizeForTerminal(resource.methodType),
    ]),
    raw: resources,
    ids: resources.map((resource) => sanitizeForTerminal(resource.resourceId)),
  });
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

const setPathPluginCommand = addApiGatewayOptions(
  new Command("set-path-plugin")
    .description("API Gateway resource 경로 플러그인을 설정한다")
    .argument("<service-id>", "API Gateway service ID")
    .argument("<resource-id>", "API Gateway resource ID")
    .requiredOption("--config-file <path>", "플러그인 설정 JSON 파일")
    .option("--dry-run", "쓰기 없이 예상 영향 범위를 출력한다")
    .option("--yes", "리소스 경로 플러그인 설정을 확인한다"),
).action(async (
  serviceId: string,
  resourceId: string,
  _opts: unknown,
  command: Command,
) => {
  const opts = command.optsWithGlobals<ResourceOptions>();
  const parsedServiceId = parseRequiredArgument(serviceId, "service-id");
  const parsedResourceId = parseRequiredArgument(resourceId, "resource-id");
  // Commander requiredOption이 action 진입 전에 configFile을 보장한다.
  const plugins = parsePathPluginConfig(await readPluginConfigFile(opts.configFile!));

  if (plugins.some((plugin) => plugin.pluginType === "CORS")) {
    process.stderr.write(
      "경고: CORS 플러그인은 하위에 OPTIONS 메서드를 자동 생성하며 기존 OPTIONS를 삭제·대체합니다.\n",
    );
  }
  if (plugins.some((plugin) => plugin.applyChildPath === true && plugin.delete === true)) {
    process.stderr.write(
      "경고: applyChildPath와 delete가 함께 true이면 하위 전체에서 해당 플러그인이 삭제됩니다.\n",
    );
  }

  if (!opts.dryRun) requireYes(opts.yes, "리소스 경로 플러그인 설정");

  const { client } = await resolveApiGatewayClient(opts);
  const displayResourceId = sanitizeForTerminal(parsedResourceId);
  const spinnerAction = opts.dryRun
    ? "경로 플러그인 영향 범위 확인"
    : "경로 플러그인 설정";
  startSpinner(`API Gateway resource "${displayResourceId}" ${spinnerAction} 중...`);
  let target: Resource;
  let applyChildPath: boolean;
  let affected: Resource[];
  let updatedResources: UpdatedResource[] = [];
  try {
    const resources = await client.listResources(parsedServiceId);
    const matchedResource = resources.find(
      (resource) => resource.resourceId === parsedResourceId,
    );
    if (matchedResource === undefined) {
      throw new NhnCloudCliError(
        `API Gateway resource "${displayResourceId}"를 찾을 수 없습니다.`,
        EXIT_PARAM_ERROR,
      );
    }
    target = matchedResource;

    applyChildPath = plugins.some((plugin) => plugin.applyChildPath === true);
    affected = applyChildPath ? collectAffectedPaths(resources, target.path) : [target];

    if (!opts.dryRun) {
      updatedResources = await client.setPathPlugins(
        parsedServiceId,
        parsedResourceId,
        plugins,
      );
    }
  } catch (error) {
    stopSpinner(false);
    throw error;
  }
  stopSpinner(true);

  if (opts.dryRun) {
    const appliedPluginTypes = plugins.map((plugin) => plugin.pluginType).join(",");
    output(opts, {
      headers: ["resourceId", "path", "methodType", "appliedPluginTypes"],
      rows: affected.map((resource) => [
        sanitizeForTerminal(resource.resourceId),
        sanitizeForTerminal(resource.path),
        resource.methodType === null ? "-" : sanitizeForTerminal(resource.methodType),
        appliedPluginTypes,
      ]),
      raw: { targetPath: target.path, applyChildPath, plugins, affected },
      ids: affected.map((resource) => sanitizeForTerminal(resource.resourceId)),
    });
    if (applyChildPath) {
      process.stderr.write(
        "경고: dry-run 영향 범위는 path 접두 비교로 계산한 추정값이며 서버 판정과 다를 수 있습니다.\n",
      );
    }
    return;
  }

  updatedResourceOutput(opts, updatedResources);
});

const setMethodPluginCommand = addApiGatewayOptions(
  new Command("set-method-plugin")
    .description("API Gateway resource 메서드 플러그인을 설정한다")
    .argument("<service-id>", "API Gateway service ID")
    .argument("<resource-id>", "API Gateway resource ID")
    .requiredOption("--config-file <path>", "플러그인 설정 JSON 파일")
    .option("--dry-run", "쓰기 없이 예상 변경 내용을 출력한다")
    .option("--yes", "리소스 메서드 플러그인 설정을 확인한다"),
).action(async (
  serviceId: string,
  resourceId: string,
  _opts: unknown,
  command: Command,
) => {
  const opts = command.optsWithGlobals<ResourceOptions>();
  const parsedServiceId = parseRequiredArgument(serviceId, "service-id");
  const parsedResourceId = parseRequiredArgument(resourceId, "resource-id");
  // Commander requiredOption이 action 진입 전에 configFile을 보장한다.
  const config = parseMethodPluginConfig(await readPluginConfigFile(opts.configFile!));

  if (!opts.dryRun) requireYes(opts.yes, "리소스 메서드 플러그인 설정");

  const { client } = await resolveApiGatewayClient(opts);
  const displayResourceId = sanitizeForTerminal(parsedResourceId);
  const spinnerAction = opts.dryRun
    ? "메서드 플러그인 영향 범위 확인"
    : "메서드 플러그인 설정";
  startSpinner(`API Gateway resource "${displayResourceId}" ${spinnerAction} 중...`);
  let target: Resource;
  let methodName: string;
  let methodDescription: string | undefined;
  let updatedResources: UpdatedResource[] = [];
  try {
    const resources = await client.listResources(parsedServiceId);
    const matchedResource = resources.find(
      (resource) => resource.resourceId === parsedResourceId,
    );
    if (matchedResource === undefined) {
      throw new NhnCloudCliError(
        `API Gateway resource "${displayResourceId}"를 찾을 수 없습니다.`,
        EXIT_PARAM_ERROR,
      );
    }
    target = matchedResource;
    if (target.methodType === null) {
      throw new NhnCloudCliError(
        "대상 resource는 메서드가 아닌 경로입니다. set-path-plugin을 사용하세요.",
        EXIT_PARAM_ERROR,
      );
    }

    const resolvedMethodName = config.methodName ?? target.methodName;
    if (resolvedMethodName === null) {
      throw new NhnCloudCliError(
        "기존 methodName이 없습니다. 설정 파일에 methodName을 넣으세요.",
        EXIT_PARAM_ERROR,
      );
    }
    methodName = resolvedMethodName;
    methodDescription = config.methodDescription ?? target.methodDescription ?? undefined;

    if (!opts.dryRun) {
      const body: MethodPluginUpdateBody = {
        methodName,
        ...(methodDescription === undefined ? {} : { methodDescription }),
        methodPluginList: config.methodPluginList,
      };
      updatedResources = await client.setMethodPlugins(
        parsedServiceId,
        parsedResourceId,
        body,
      );
    }
  } catch (error) {
    stopSpinner(false);
    throw error;
  }
  stopSpinner(true);

  if (opts.dryRun) {
    const appliedPluginTypes = config.methodPluginList
      .map((plugin) => plugin.pluginType)
      .join(",");
    output(opts, {
      headers: [
        "resourceId",
        "path",
        "methodType",
        "methodName",
        "appliedPluginTypes",
      ],
      rows: [[
        sanitizeForTerminal(target.resourceId),
        sanitizeForTerminal(target.path),
        sanitizeForTerminal(target.methodType),
        sanitizeForTerminal(methodName),
        appliedPluginTypes,
      ]],
      raw: {
        target,
        methodName,
        methodDescription,
        plugins: config.methodPluginList,
      },
      ids: [sanitizeForTerminal(target.resourceId)],
    });
    return;
  }

  updatedResourceOutput(opts, updatedResources);
});

export const resourceCommand = new Command("resource")
  .description("API Gateway resource 조회 및 변경 명령")
  .addCommand(listCommand)
  .addCommand(parametersCommand)
  .addCommand(responsesCommand)
  .addCommand(setPathPluginCommand)
  .addCommand(setMethodPluginCommand);
