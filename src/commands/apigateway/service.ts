import { Command } from "commander";
import { output, type OutputOptions } from "../../formatters/table.js";
import type { ApiGatewayService } from "../../services/apigateway/types.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { resolveApiGatewayClient } from "./helpers.js";

interface ServiceOptions extends OutputOptions {
  region?: string;
  appKey?: string;
  profile?: string;
}

const listCommand = new Command("list")
  .description("API Gateway service 목록을 조회한다 (전체 필드는 --json)")
  .option("--region <region>", "API Gateway region (기본: kr1)", "kr1")
  .option("--app-key <key>", "API Gateway appKey (profile 의 apigateway.appkey 보다 우선)")
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
        service.apigwServiceId,
        service.apigwServiceName,
        service.apigwDomain,
        service.regionCode,
        service.createdAt,
      ]),
      raw: services,
      ids: services.map((service) => service.apigwServiceId),
    });
  });

const getCommand = new Command("get")
  .description("API Gateway service 한 건을 조회한다 (전체 필드는 --json)")
  .argument("<service-id>", "API Gateway service ID")
  .option("--region <region>", "API Gateway region (기본: kr1)", "kr1")
  .option("--app-key <key>", "API Gateway appKey (profile 의 apigateway.appkey 보다 우선)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (serviceId: string, _opts: unknown, command: Command) => {
    const opts = command.optsWithGlobals<ServiceOptions>();
    const trimmedServiceId = serviceId.trim();
    if (!trimmedServiceId) {
      throw new NhnCloudCliError("service-id 인수가 비어있습니다.", EXIT_PARAM_ERROR);
    }
    const { client } = await resolveApiGatewayClient(opts);

    startSpinner(`API Gateway service "${trimmedServiceId}" 조회 중...`);
    let service: ApiGatewayService;
    try {
      service = await client.getService(trimmedServiceId);
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
        service.apigwServiceId,
        service.apigwServiceName,
        service.apigwDomain,
        service.regionCode,
        service.createdAt,
      ]],
      raw: service,
      ids: [service.apigwServiceId],
    });
  });

export const serviceCommand = new Command("service")
  .description("API Gateway service 조회 명령")
  .addCommand(listCommand)
  .addCommand(getCommand);
