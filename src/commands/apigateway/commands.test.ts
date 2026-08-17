import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { output } from "../../formatters/table.js";
import type {
  ApiGatewayService,
  LatestDeployResult,
  Resource,
  WrittenStageResource,
} from "../../services/apigateway/types.js";
import {
  DEPLOY_STATUS_COMPLETE,
  DEPLOY_STATUS_FAILURE,
} from "../../services/apigateway/types.js";
import { EXIT_API_ERROR, EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { startSpinner } from "../../utils/spinner.js";
import { deployCommand } from "./deploy.js";
import { resolveApiGatewayClient } from "./helpers.js";
import { resourceCommand } from "./resource.js";
import { serviceCommand } from "./service.js";
import { stageCommand } from "./stage.js";

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
const getLatestDeploy = vi.fn();
const createDeploy = vi.fn();
const waitForDeploy = vi.fn();
const rollbackDeploy = vi.fn();
const client = {
  listServices,
  getService,
  listResources,
  getResourceParameters,
  getResourceResponses,
  getLatestDeploy,
  createDeploy,
  waitForDeploy,
  rollbackDeploy,
};

function programWith(command: Command): Command {
  return new Command("nhncloud")
    .exitOverride()
    .option("--json")
    .option("--quiet")
    .addCommand(command);
}

function collectAppKeyOptionPaths(command: Command, parentPath = ""): string[] {
  const path = [parentPath, command.name()].filter(Boolean).join(" ");
  const ownPaths = command.options.some((option) => option.long === "--app-key")
    ? [path]
    : [];
  return ownPaths.concat(
    command.commands.flatMap((child) => collectAppKeyOptionPaths(child, path)),
  );
}

async function captureStdout(run: () => Promise<unknown>): Promise<string> {
  const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  try {
    await run();
    return write.mock.calls.map(([value]) => String(value)).join("");
  } finally {
    write.mockRestore();
  }
}

const completedDeploy: LatestDeployResult = {
  deployId: "deploy-new",
  stageId: "stage-1",
  deployedAt: "2026-08-18T01:00:00Z",
  rollbackAt: null,
  deployDescription: "release",
  isBase: false,
  deployStatus: DEPLOY_STATUS_COMPLETE,
  stageResourceList: [],
};

const rollbackResources: WrittenStageResource[] = [{
  stageResourceId: "stage-resource-1",
  path: "/users",
  methodType: "GET",
  methodName: "getUsers",
  stageResourcePluginList: [],
}];

describe("API Gateway 명령 옵션", () => {
  it("모든 하위 명령에서 --app-key를 노출하지 않는다", () => {
    const commands = [serviceCommand, resourceCommand, stageCommand, deployCommand];

    expect(commands.flatMap((command) => collectAppKeyOptionPaths(command))).toEqual([]);
  });
});

describe("deploy create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveApiGatewayClient).mockResolvedValue({ client } as never);
    getLatestDeploy.mockResolvedValue({ ...completedDeploy, deployId: "deploy-old" });
    createDeploy.mockResolvedValue(undefined);
    waitForDeploy.mockResolvedValue(completedDeploy);
  });

  it("--yes가 없으면 client 생성과 API 호출 전에 거부한다", async () => {
    await expect(programWith(deployCommand).parseAsync([
      "node",
      "nhncloud",
      "deploy",
      "create",
      "service-1",
      "stage-1",
    ])).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
      message: expect.stringContaining("--yes"),
    });

    expect(resolveApiGatewayClient).not.toHaveBeenCalled();
    expect(createDeploy).not.toHaveBeenCalled();
  });

  it("--description이 200자를 넘으면 API 호출 전에 거부한다", async () => {
    await expect(programWith(deployCommand).parseAsync([
      "node",
      "nhncloud",
      "deploy",
      "create",
      "service-1",
      "stage-1",
      "--description",
      "가".repeat(201),
      "--yes",
    ])).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
      message: expect.stringContaining("200자"),
    });

    expect(resolveApiGatewayClient).not.toHaveBeenCalled();
    expect(createDeploy).not.toHaveBeenCalled();
  });

  it("COMPLETE 배포를 0으로 끝내고 기준 ID와 timeout을 대기에 전달한다", async () => {
    await programWith(deployCommand).parseAsync([
      "node",
      "nhncloud",
      "deploy",
      "create",
      "service-1",
      "stage-1",
      "--description",
      "release",
      "--timeout",
      "12",
      "--yes",
    ]);

    expect(createDeploy).toHaveBeenCalledWith("service-1", "stage-1", {
      deployDescription: "release",
    });
    expect(waitForDeploy).toHaveBeenCalledWith("service-1", "stage-1", {
      timeoutMs: 12_000,
      baselineDeployId: "deploy-old",
    });
    expect(output).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        raw: completedDeploy,
        ids: ["deploy-new"],
      }),
    );
  });

  it("FAILURE 배포는 ID와 상태를 담은 API 오류로 끝낸다", async () => {
    waitForDeploy.mockResolvedValue({
      ...completedDeploy,
      deployStatus: DEPLOY_STATUS_FAILURE,
    });

    await expect(programWith(deployCommand).parseAsync([
      "node",
      "nhncloud",
      "deploy",
      "create",
      "service-1",
      "stage-1",
      "--yes",
    ])).rejects.toMatchObject({
      exitCode: EXIT_API_ERROR,
      message: expect.stringMatching(/deploy-new.*FAILURE/),
    });

    expect(createDeploy).toHaveBeenCalledOnce();
    expect(output).not.toHaveBeenCalled();
  });

  it("직전 배포 조회가 실패해도 baselineDeployId null로 배포한다", async () => {
    getLatestDeploy.mockRejectedValue(new Error("temporary 5xx"));

    await programWith(deployCommand).parseAsync([
      "node",
      "nhncloud",
      "deploy",
      "create",
      "service-1",
      "stage-1",
      "--yes",
    ]);

    expect(createDeploy).toHaveBeenCalledOnce();
    expect(waitForDeploy).toHaveBeenCalledWith("service-1", "stage-1", {
      timeoutMs: 300_000,
      baselineDeployId: null,
    });
  });

  it("--quiet 대기 경로는 deployId 한 줄만 stdout에 쓴다", async () => {
    const actualFormatters = await vi.importActual<
      typeof import("../../formatters/table.js")
    >("../../formatters/table.js");
    vi.mocked(output).mockImplementationOnce(actualFormatters.output);

    const stdout = await captureStdout(() => programWith(deployCommand).parseAsync([
      "node",
      "nhncloud",
      "--quiet",
      "deploy",
      "create",
      "service-1",
      "stage-1",
      "--yes",
    ]));

    expect(stdout).toBe("deploy-new\n");
  });

  it.each([
    ["0", []],
    ["abc", []],
    ["0", ["--no-wait"]],
    ["abc", ["--no-wait"]],
  ])("--timeout %s %j는 createDeploy 전에 입력 오류로 끝낸다", async (timeout, flags) => {
    await expect(programWith(deployCommand).parseAsync([
      "node",
      "nhncloud",
      "deploy",
      "create",
      "service-1",
      "stage-1",
      "--timeout",
      timeout,
      ...flags,
      "--yes",
    ])).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });

    expect(resolveApiGatewayClient).not.toHaveBeenCalled();
    expect(createDeploy).not.toHaveBeenCalled();
  });

  it("--no-wait이면 대기를 호출하지 않는다", async () => {
    await programWith(deployCommand).parseAsync([
      "node",
      "nhncloud",
      "deploy",
      "create",
      "service-1",
      "stage-1",
      "--no-wait",
      "--yes",
    ]);

    expect(createDeploy).toHaveBeenCalledOnce();
    expect(getLatestDeploy).not.toHaveBeenCalled();
    expect(waitForDeploy).not.toHaveBeenCalled();
  });

  it("--json --no-wait는 요청 접수 객체만 stdout에 쓴다", async () => {
    const stdout = await captureStdout(() => programWith(deployCommand).parseAsync([
      "node",
      "nhncloud",
      "--json",
      "deploy",
      "create",
      "service-1",
      "stage-1",
      "--no-wait",
      "--yes",
    ]));

    expect(JSON.parse(stdout)).toEqual({ requested: true });
    expect(waitForDeploy).not.toHaveBeenCalled();
  });

  it("--quiet --no-wait는 stdout이 비어 있다", async () => {
    const stdout = await captureStdout(() => programWith(deployCommand).parseAsync([
      "node",
      "nhncloud",
      "--quiet",
      "deploy",
      "create",
      "service-1",
      "stage-1",
      "--no-wait",
      "--yes",
    ]));

    expect(stdout).toBe("");
    expect(waitForDeploy).not.toHaveBeenCalled();
  });
});

describe("deploy rollback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveApiGatewayClient).mockResolvedValue({ client } as never);
    rollbackDeploy.mockResolvedValue(rollbackResources);
  });

  it("--yes가 없으면 client 생성과 API 호출 전에 거부한다", async () => {
    await expect(programWith(deployCommand).parseAsync([
      "node",
      "nhncloud",
      "deploy",
      "rollback",
      "service-1",
      "stage-1",
      "deploy-1",
    ])).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
      message: expect.stringContaining("--yes"),
    });

    expect(resolveApiGatewayClient).not.toHaveBeenCalled();
    expect(rollbackDeploy).not.toHaveBeenCalled();
  });

  it("되돌린 stage resource를 ID와 함께 출력한다", async () => {
    await programWith(deployCommand).parseAsync([
      "node",
      "nhncloud",
      "deploy",
      "rollback",
      "service-1",
      "stage-1",
      "deploy-1",
      "--yes",
    ]);

    expect(rollbackDeploy).toHaveBeenCalledWith("service-1", "stage-1", "deploy-1");
    expect(output).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        raw: rollbackResources,
        ids: ["stage-resource-1"],
      }),
    );
  });
});

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
