import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { output } from "../../formatters/table.js";
import type {
  ApiGatewayService,
  Resource,
} from "../../services/apigateway/types.js";
import { startSpinner } from "../../utils/spinner.js";
import { resolveApiGatewayClient } from "./helpers.js";
import { resourceCommand } from "./resource.js";
import { serviceCommand } from "./service.js";

vi.mock("./helpers.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./helpers.js")>();
  return { ...actual, resolveApiGatewayClient: vi.fn() };
});
vi.mock("../../formatters/table.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../formatters/table.js")>();
  return { ...actual, output: vi.fn() };
});
vi.mock("../../utils/spinner.js", () => ({
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
}));

const listServices = vi.fn();
const getService = vi.fn();
const listResources = vi.fn();
const getResourceParameters = vi.fn();
const getResourceResponses = vi.fn();
const client = {
  listServices,
  getService,
  listResources,
  getResourceParameters,
  getResourceResponses,
};

function programWith(command: Command): Command {
  return new Command("nhncloud")
    .exitOverride()
    .option("--json")
    .option("--quiet")
    .addCommand(command);
}

describe("API Gateway 터미널 출력 정제", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveApiGatewayClient).mockResolvedValue({ client } as never);
  });

  it("service get은 spinner·표·quiet 값을 정제하고 JSON raw는 보존한다", async () => {
    const service: ApiGatewayService = {
      apigwServiceId: "svc\u001b[31m\nnext",
      apigwServiceAlias: "alias",
      apigwServiceName: "name\rnext",
      apigwServiceDescription: "description",
      apigwDomain: "domain\u0000.example.com",
      appKey: "app-key",
      regionCode: "kr1\tspoofed",
      serverGroupId: "server-group",
      dedicatedId: null,
      createdAt: "2026-08-11\nspoofed",
      updatedAt: "2026-08-11T00:00:00Z",
      apigwServiceTypeCode: "PUBLIC",
    };
    getService.mockResolvedValue(service);

    await programWith(serviceCommand).parseAsync([
      "node",
      "nhncloud",
      "--json",
      "service",
      "get",
      "input\u001b[31m\nnext",
    ]);

    expect(startSpinner).toHaveBeenCalledWith(
      'API Gateway service "input?[31m?next" 조회 중...',
    );
    expect(output).toHaveBeenCalledWith(
      expect.objectContaining({ json: true }),
      expect.objectContaining({
        rows: [[
          "svc?[31m?next",
          "name?next",
          "domain?.example.com",
          "kr1?spoofed",
          "2026-08-11?spoofed",
        ]],
        raw: service,
        ids: ["svc?[31m?next"],
      }),
    );
  });

  it("resource list은 spinner·표·quiet 값을 정제하고 JSON raw는 보존한다", async () => {
    const resource: Resource = {
      resourceId: "resource\u001b[31m\nnext",
      apigwServiceId: "service-id",
      parentPath: null,
      path: "/users\nspoofed",
      methodType: "GET\rspoofed",
      methodName: "name\tspoofed",
      methodDescription: null,
      createdAt: "2026-08-11T00:00:00Z",
      updatedAt: "2026-08-11\u0000spoofed",
      resourcePluginList: [],
    };
    listResources.mockResolvedValue([resource]);

    await programWith(resourceCommand).parseAsync([
      "node",
      "nhncloud",
      "--quiet",
      "resource",
      "list",
      "service\u001b[31m\nnext",
    ]);

    expect(startSpinner).toHaveBeenCalledWith(
      'API Gateway service "service?[31m?next" resource 목록 조회 중...',
    );
    expect(output).toHaveBeenCalledWith(
      expect.objectContaining({ quiet: true }),
      expect.objectContaining({
        rows: [[
          "resource?[31m?next",
          "/users?spoofed",
          "GET?spoofed",
          "name?spoofed",
          "2026-08-11?spoofed",
        ]],
        raw: [resource],
        ids: ["resource?[31m?next"],
      }),
    );
  });
});
