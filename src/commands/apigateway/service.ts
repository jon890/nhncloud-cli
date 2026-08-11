import { Command } from "commander";
import { output, type OutputOptions } from "../../formatters/table.js";
import type { ApiGatewayService } from "../../services/apigateway/types.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { parseRequiredArgument } from "../parse-options.js";
import { resolveApiGatewayClient, sanitizeForTerminal } from "./helpers.js";

interface ServiceOptions extends OutputOptions {
  region?: string;
  profile?: string;
}

const listCommand = new Command("list")
  .description("API Gateway service 목록을 조회한다 (전체 필드는 --json)")
  .option("--region <region>", "API Gateway region (기본: kr1)", "kr1")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, command: Command) => {
    const opts = command.optsWithGlobals<ServiceOptions>();
    const { client } = await resolveApiGatewayClient(opts);

    startSpinner("API Gateway service 목록 조회 중...");
    let services: ApiGatewayService[];
    try {
      services = await client.listServices();
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    output(opts, {
      headers: [
        "apigwServiceId",
        "apigwServiceName",
        "apigwDomain",
        "regionCode",
        "createdAt",
      ],
      rows: services.map((service) => [
        sanitizeForTerminal(service.apigwServiceId),
        sanitizeForTerminal(service.apigwServiceName),
        sanitizeForTerminal(service.apigwDomain),
        sanitizeForTerminal(service.regionCode),
        sanitizeForTerminal(service.createdAt),
      ]),
      raw: services,
      ids: services.map((service) => sanitizeForTerminal(service.apigwServiceId)),
    });
  });

const getCommand = new Command("get")
  .description("API Gateway service 한 건을 조회한다 (전체 필드는 --json)")
  .argument("<service-id>", "API Gateway service ID")
  .option("--region <region>", "API Gateway region (기본: kr1)", "kr1")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (serviceId: string, _opts: unknown, command: Command) => {
    const opts = command.optsWithGlobals<ServiceOptions>();
    const parsedServiceId = parseRequiredArgument(serviceId, "service-id");
    const displayServiceId = sanitizeForTerminal(parsedServiceId);
    const { client } = await resolveApiGatewayClient(opts);

    startSpinner(`API Gateway service "${displayServiceId}" 조회 중...`);
    let service: ApiGatewayService;
    try {
      service = await client.getService(parsedServiceId);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    output(opts, {
      headers: [
        "apigwServiceId",
        "apigwServiceName",
        "apigwDomain",
        "regionCode",
        "createdAt",
      ],
      rows: [[
        sanitizeForTerminal(service.apigwServiceId),
        sanitizeForTerminal(service.apigwServiceName),
        sanitizeForTerminal(service.apigwDomain),
        sanitizeForTerminal(service.regionCode),
        sanitizeForTerminal(service.createdAt),
      ]],
      raw: service,
      ids: [sanitizeForTerminal(service.apigwServiceId)],
    });
  });

export const serviceCommand = new Command("service")
  .description("API Gateway service 조회 명령")
  .addCommand(listCommand)
  .addCommand(getCommand);
