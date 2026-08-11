import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { output } from "../../formatters/table.js";
import type { Resource } from "../../services/apigateway/types.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { resolveApiGatewayClient } from "./helpers.js";
import { resourceCommand } from "./resource.js";

vi.mock("./helpers.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./helpers.js")>();
  return { ...actual, resolveApiGatewayClient: vi.fn() };
});
vi.mock("../../formatters/table.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../formatters/table.js")>();
  return { ...actual, output: vi.fn(actual.output) };
});
vi.mock("../../utils/spinner.js", () => ({
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
}));

const listResources = vi.fn();
const setPathPlugins = vi.fn();
const setMethodPlugins = vi.fn();
const client = { listResources, setPathPlugins, setMethodPlugins };

function programWith(command: Command): Command {
  return new Command("nhncloud")
    .exitOverride()
    .option("--json")
    .option("--quiet")
    .addCommand(command);
}

function resource(overrides: Partial<Resource> = {}): Resource {
  return {
    resourceId: "resource-1",
    apigwServiceId: "service-1",
    parentPath: null,
    path: "/users",
    methodType: "GET",
    methodName: "get-users",
    methodDescription: "기존 설명",
    createdAt: "2026-08-11T00:00:00Z",
    updatedAt: "2026-08-11T00:00:00Z",
    resourcePluginList: [],
    ...overrides,
  };
}

let tempDirectory: string;
let stdout = "";
let stderr = "";

async function configFile(name: string, value: unknown): Promise<string> {
  const path = join(tempDirectory, name);
  await writeFile(path, JSON.stringify(value), "utf-8");
  return path;
}

async function run(args: string[]): Promise<void> {
  await programWith(resourceCommand).parseAsync(["node", "nhncloud", ...args]);
}

describe("API Gateway resource 플러그인 설정", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    tempDirectory = await mkdtemp(join(tmpdir(), "nhncloud-apigateway-resource-"));
    stdout = "";
    stderr = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stdout += String(chunk);
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stderr += String(chunk);
      return true;
    });
    vi.mocked(resolveApiGatewayClient).mockResolvedValue({ client } as never);
    listResources.mockResolvedValue([resource()]);
    setPathPlugins.mockResolvedValue([]);
    setMethodPlugins.mockResolvedValue([]);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tempDirectory, { recursive: true, force: true });
  });

  it("--yes 없이 쓰기 명령을 호출하면 client 생성 전에 거부한다", async () => {
    const path = await configFile("path.json", {
      pathPluginList: [{ pluginType: "CORS", pluginConfigJson: {} }],
    });

    await expect(
      run(["resource", "set-path-plugin", "service-1", "resource-1", "--config-file", path]),
    ).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
    expect(resolveApiGatewayClient).not.toHaveBeenCalled();
    expect(startSpinner).not.toHaveBeenCalled();
  });

  it("--dry-run은 --yes 없이 통과하고 쓰기 메서드를 호출하지 않는다", async () => {
    const path = await configFile("path.json", {
      pathPluginList: [{ pluginType: "CORS", pluginConfigJson: {} }],
    });

    await run([
      "resource",
      "set-path-plugin",
      "service-1",
      "resource-1",
      "--config-file",
      path,
      "--dry-run",
    ]);

    expect(listResources).toHaveBeenCalledWith("service-1");
    expect(setPathPlugins).not.toHaveBeenCalled();
    expect(startSpinner).toHaveBeenCalledWith(
      'API Gateway resource "resource-1" 경로 플러그인 설정 중...',
    );
    expect(stopSpinner).toHaveBeenCalledWith(true);
  });

  it("경로 플러그인 변경 API 실패 시 spinner를 실패로 종료한다", async () => {
    const path = await configFile("path.json", {
      pathPluginList: [{ pluginType: "SET_RESPONSE_HEADER", pluginConfigJson: {} }],
    });
    setPathPlugins.mockRejectedValue(new Error("write failed"));

    await expect(run([
      "resource",
      "set-path-plugin",
      "service-1",
      "resource-1",
      "--config-file",
      path,
      "--yes",
    ])).rejects.toThrow("write failed");

    expect(stopSpinner).toHaveBeenCalledWith(false);
  });

  it("경로 명령에서 메서드 전용 HTTP 타입을 거부한다", async () => {
    const path = await configFile("path.json", {
      pathPluginList: [{ pluginType: "HTTP", pluginConfigJson: {} }],
    });

    await expect(
      run([
        "resource",
        "set-path-plugin",
        "service-1",
        "resource-1",
        "--config-file",
        path,
        "--yes",
      ]),
    ).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
  });

  it("메서드 명령에서 applyChildPath 필드를 거부한다", async () => {
    const path = await configFile("method.json", {
      methodPluginList: [{ pluginType: "HTTP", pluginConfigJson: {}, applyChildPath: true }],
    });

    await expect(
      run([
        "resource",
        "set-method-plugin",
        "service-1",
        "resource-1",
        "--config-file",
        path,
        "--yes",
      ]),
    ).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
  });

  it("delete 없이 pluginConfigJson이 빠진 항목을 거부한다", async () => {
    const path = await configFile("path.json", {
      pathPluginList: [{ pluginType: "SET_REQUEST_HEADER" }],
    });

    await expect(
      run([
        "resource",
        "set-path-plugin",
        "service-1",
        "resource-1",
        "--config-file",
        path,
        "--yes",
      ]),
    ).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
      message: expect.stringContaining("pluginConfigJson이 필요합니다"),
    });
  });

  it("pluginConfigJson 값이 객체가 아니면 타입 불일치 메시지로 거부한다", async () => {
    const path = await configFile("path.json", {
      pathPluginList: [{ pluginType: "SET_REQUEST_HEADER", pluginConfigJson: "invalid" }],
    });

    await expect(
      run([
        "resource",
        "set-path-plugin",
        "service-1",
        "resource-1",
        "--config-file",
        path,
        "--yes",
      ]),
    ).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
      message: expect.stringContaining("pluginConfigJson은 JSON 객체여야 합니다"),
    });
  });

  it("methodType이 null인 경로에 메서드 명령을 쓰면 거부한다", async () => {
    const path = await configFile("method.json", {
      methodPluginList: [{ pluginType: "HTTP", pluginConfigJson: {} }],
    });
    listResources.mockResolvedValue([resource({ methodType: null, methodName: null })]);

    await expect(
      run([
        "resource",
        "set-method-plugin",
        "service-1",
        "resource-1",
        "--config-file",
        path,
        "--yes",
      ]),
    ).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
    expect(setMethodPlugins).not.toHaveBeenCalled();
    expect(stopSpinner).toHaveBeenCalledWith(false);
  });

  it("파일에 methodName이 없으면 기존 이름과 설명을 실어 보낸다", async () => {
    const path = await configFile("method.json", {
      methodPluginList: [{ pluginType: "HTTP", pluginConfigJson: { url: "https://example.com" } }],
    });

    await run([
      "resource",
      "set-method-plugin",
      "service-1",
      "resource-1",
      "--config-file",
      path,
      "--yes",
    ]);

    expect(setMethodPlugins).toHaveBeenCalledWith("service-1", "resource-1", {
      methodName: "get-users",
      methodDescription: "기존 설명",
      methodPluginList: [
        { pluginType: "HTTP", pluginConfigJson: { url: "https://example.com" } },
      ],
    });
    expect(startSpinner).toHaveBeenCalledWith(
      'API Gateway resource "resource-1" 메서드 플러그인 설정 중...',
    );
    expect(stopSpinner).toHaveBeenCalledWith(true);
  });

  it("메서드 플러그인 변경 API 실패 시 spinner를 실패로 종료한다", async () => {
    const path = await configFile("method.json", {
      methodPluginList: [{ pluginType: "HTTP", pluginConfigJson: {} }],
    });
    setMethodPlugins.mockRejectedValue(new Error("write failed"));

    await expect(run([
      "resource",
      "set-method-plugin",
      "service-1",
      "resource-1",
      "--config-file",
      path,
      "--yes",
    ])).rejects.toThrow("write failed");

    expect(stopSpinner).toHaveBeenCalledWith(false);
  });

  it("없는 --config-file 경로를 EXIT_PARAM_ERROR로 거부한다", async () => {
    await expect(
      run([
        "resource",
        "set-path-plugin",
        "service-1",
        "resource-1",
        "--config-file",
        join(tempDirectory, "missing.json"),
        "--yes",
      ]),
    ).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
    expect(startSpinner).not.toHaveBeenCalled();
  });

  it("목록에 없는 resource-id를 EXIT_PARAM_ERROR로 거부한다", async () => {
    const path = await configFile("path.json", {
      pathPluginList: [{ pluginType: "CORS", pluginConfigJson: {} }],
    });

    await expect(
      run([
        "resource",
        "set-path-plugin",
        "service-1",
        "missing-resource",
        "--config-file",
        path,
        "--dry-run",
      ]),
    ).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });
    expect(stopSpinner).toHaveBeenCalledWith(false);
  });

  it("applyChildPath dry-run은 하위 경로까지 출력한다", async () => {
    const path = await configFile("path.json", {
      pathPluginList: [
        { pluginType: "ADD_REQUEST_QUERY_PARAMETER", pluginConfigJson: {}, applyChildPath: true },
      ],
    });
    listResources.mockResolvedValue([
      resource(),
      resource({ resourceId: "resource-2", path: "/users/detail", methodType: null }),
      resource({ resourceId: "resource-3", path: "/other" }),
    ]);

    await run([
      "resource",
      "set-path-plugin",
      "service-1",
      "resource-1",
      "--config-file",
      path,
      "--dry-run",
    ]);

    expect(output).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        rows: expect.arrayContaining([
          expect.arrayContaining(["resource-1"]),
          expect.arrayContaining(["resource-2"]),
        ]),
        ids: ["resource-1", "resource-2"],
      }),
    );
    expect(stderr).toContain("추정값");
  });

  it("--dry-run --json은 영향 범위 객체를 stdout에 출력한다", async () => {
    const plugins = [
      { pluginType: "ADD_REQUEST_QUERY_PARAMETER", pluginConfigJson: {}, applyChildPath: true },
    ];
    const path = await configFile("path.json", { pathPluginList: plugins });
    listResources.mockResolvedValue([
      resource(),
      resource({ resourceId: "resource-2", path: "/users/detail" }),
    ]);

    await run([
      "--json",
      "resource",
      "set-path-plugin",
      "service-1",
      "resource-1",
      "--config-file",
      path,
      "--dry-run",
    ]);

    expect(JSON.parse(stdout)).toMatchObject({
      targetPath: "/users",
      applyChildPath: true,
      plugins,
      affected: [{ resourceId: "resource-1" }, { resourceId: "resource-2" }],
    });
  });

  it("--dry-run --quiet은 영향 resource ID만 stdout에 출력한다", async () => {
    const path = await configFile("path.json", {
      pathPluginList: [
        { pluginType: "ADD_REQUEST_QUERY_PARAMETER", pluginConfigJson: {}, applyChildPath: true },
      ],
    });
    listResources.mockResolvedValue([
      resource(),
      resource({ resourceId: "resource-2", path: "/users/detail" }),
    ]);

    await run([
      "--quiet",
      "resource",
      "set-path-plugin",
      "service-1",
      "resource-1",
      "--config-file",
      path,
      "--dry-run",
    ]);

    expect(stdout).toBe("resource-1\nresource-2\n");
    expect(stdout).not.toContain("resourceId");
    expect(stdout).not.toContain("추정");
  });

  it("applyChildPath가 false인 경로 dry-run은 확정 범위라 추정 경고를 내지 않는다", async () => {
    const path = await configFile("path.json", {
      pathPluginList: [{ pluginType: "SET_RESPONSE_HEADER", pluginConfigJson: {} }],
    });

    await run([
      "--json",
      "resource",
      "set-path-plugin",
      "service-1",
      "resource-1",
      "--config-file",
      path,
      "--dry-run",
    ]);

    expect(stderr).not.toContain("추정값");
    expect(stdout).not.toContain("추정값");
  });

  it("메서드 dry-run은 대상 1건만 출력하고 추정 경고를 내지 않는다", async () => {
    const path = await configFile("method.json", {
      methodPluginList: [{ pluginType: "MOCK", pluginConfigJson: {} }],
    });

    await run([
      "--json",
      "resource",
      "set-method-plugin",
      "service-1",
      "resource-1",
      "--config-file",
      path,
      "--dry-run",
    ]);

    expect(JSON.parse(stdout)).toMatchObject({
      target: { resourceId: "resource-1" },
      methodName: "get-users",
      methodDescription: "기존 설명",
      plugins: [{ pluginType: "MOCK", pluginConfigJson: {} }],
    });
    expect(stderr).not.toContain("추정값");
    expect(setMethodPlugins).not.toHaveBeenCalled();
  });

  it("되돌릴 수 없는 CORS와 하위 삭제 부작용을 쓰기 호출 전에 경고한다", async () => {
    const path = await configFile("path.json", {
      pathPluginList: [
        { pluginType: "CORS", pluginConfigJson: {} },
        { pluginType: "SET_RESPONSE_HEADER", applyChildPath: true, delete: true },
      ],
    });
    setPathPlugins.mockImplementation(async () => {
      expect(stderr).toContain("기존 OPTIONS를 삭제·대체");
      expect(stderr).toContain("하위 전체에서 해당 플러그인이 삭제");
      return [];
    });

    await run([
      "resource",
      "set-path-plugin",
      "service-1",
      "resource-1",
      "--config-file",
      path,
      "--yes",
    ]);

    expect(setPathPlugins).toHaveBeenCalledOnce();
    expect(startSpinner).toHaveBeenCalledWith(
      'API Gateway resource "resource-1" 경로 플러그인 설정 중...',
    );
    expect(stopSpinner).toHaveBeenCalledWith(true);
  });
});
