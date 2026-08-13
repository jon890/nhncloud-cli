import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { output } from "../../formatters/table.js";
import type { Stage, UpdatedStage } from "../../services/apigateway/types.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { sanitizeForTerminal } from "../../utils/terminal.js";
import { resolveApiGatewayClient } from "./helpers.js";
import { stageCommand, writeStageSwaggerFile } from "./stage.js";

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

const listStages = vi.fn();
const updateStage = vi.fn();
const client = { listStages, updateStage };

function programWith(command: Command): Command {
  return new Command("nhncloud")
    .exitOverride()
    .option("--json")
    .option("--quiet")
    .addCommand(command);
}

const existingStage: Stage = {
  stageId: "stage-1",
  apigwServiceId: "service-1",
  regionCode: "kr1",
  stageName: "prod",
  stageDescription: "기존 설명",
  stageUrl: "https://stage.example.com",
  backendEndpointUrl: "https://backend.example.com",
  resourceUpdatedAt: "2026-08-11T00:00:00Z",
  createdAt: "2026-08-10T00:00:00Z",
  updatedAt: "2026-08-11T00:00:00Z",
  stageCustomUrl: "",
  stageCustomDomainList: [],
  stageAliasDomainList: [],
};

const updatedStage: UpdatedStage = {
  stageId: "stage-1",
  stageName: "prod",
  stageUrl: "https://stage.example.com",
  backendEndpointUrl: "https://updated-backend.example.com",
  updatedAt: "2026-08-11T01:00:00Z",
};

describe("stage update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveApiGatewayClient).mockResolvedValue({ client } as never);
    listStages.mockResolvedValue([existingStage]);
    updateStage.mockResolvedValue(updatedStage);
  });

  it("바꿀 옵션은 있지만 --yes가 없으면 client 생성 전에 거부한다", async () => {
    await expect(programWith(stageCommand).parseAsync([
      "node",
      "nhncloud",
      "stage",
      "update",
      "service-1",
      "stage-1",
      "--description",
      "새 설명",
    ])).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
      message: expect.stringContaining("--yes"),
    });

    expect(resolveApiGatewayClient).not.toHaveBeenCalled();
  });

  it.each([
    ["--yes 없음", []],
    ["--yes 있음", ["--yes"]],
  ])("두 옵션 모두 없으면 %s에도 바꿀 값이 없다고 먼저 거부한다", async (_label, flags) => {
    await expect(programWith(stageCommand).parseAsync([
      "node",
      "nhncloud",
      "stage",
      "update",
      "service-1",
      "stage-1",
      ...flags,
    ])).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
      message: expect.stringContaining("바꿀 값이 없습니다"),
    });

    expect(resolveApiGatewayClient).not.toHaveBeenCalled();
  });

  it("--description만 주면 기존 backendEndpointUrl을 그대로 보낸다", async () => {
    await programWith(stageCommand).parseAsync([
      "node",
      "nhncloud",
      "stage",
      "update",
      "service-1",
      "stage-1",
      "--description",
      "새 설명",
      "--yes",
    ]);

    expect(updateStage).toHaveBeenCalledWith("service-1", "stage-1", {
      backendEndpointUrl: existingStage.backendEndpointUrl,
      stageDescription: "새 설명",
    });
  });

  it("--backend-endpoint-url만 주면 기존 stageDescription을 그대로 보낸다", async () => {
    await programWith(stageCommand).parseAsync([
      "node",
      "nhncloud",
      "stage",
      "update",
      "service-1",
      "stage-1",
      "--backend-endpoint-url",
      "https://new-backend.example.com",
      "--yes",
    ]);

    expect(updateStage).toHaveBeenCalledWith("service-1", "stage-1", {
      backendEndpointUrl: "https://new-backend.example.com",
      stageDescription: existingStage.stageDescription,
    });
  });

  it("빈 --description은 설명을 비우는 값으로 그대로 보낸다", async () => {
    await programWith(stageCommand).parseAsync([
      "node",
      "nhncloud",
      "stage",
      "update",
      "service-1",
      "stage-1",
      "--description",
      "",
      "--yes",
    ]);

    expect(updateStage).toHaveBeenCalledWith("service-1", "stage-1", {
      backendEndpointUrl: existingStage.backendEndpointUrl,
      stageDescription: "",
    });
  });

  it("목록에 stage-id가 없으면 입력 오류로 거부한다", async () => {
    listStages.mockResolvedValue([]);

    await expect(programWith(stageCommand).parseAsync([
      "node",
      "nhncloud",
      "stage",
      "update",
      "service-1",
      "missing-stage",
      "--description",
      "새 설명",
      "--yes",
    ])).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
      message: expect.stringContaining("찾을 수 없습니다"),
    });

    expect(updateStage).not.toHaveBeenCalled();
    expect(stopSpinner).toHaveBeenCalledWith(false);
  });

  it("수정 응답을 기존 출력 계약으로 전달한다", async () => {
    await programWith(stageCommand).parseAsync([
      "node",
      "nhncloud",
      "--quiet",
      "stage",
      "update",
      "service-1",
      "stage-1",
      "--description",
      "새 설명",
      "--yes",
    ]);

    expect(startSpinner).toHaveBeenCalledWith('API Gateway stage "stage-1" 수정 중...');
    expect(stopSpinner).toHaveBeenCalledWith(true);
    expect(output).toHaveBeenCalledWith(
      expect.objectContaining({ quiet: true }),
      {
        headers: ["stageId", "stageName", "stageUrl", "backendEndpointUrl", "updatedAt"],
        rows: [[
          "stage-1",
          "prod",
          "https://stage.example.com",
          "https://updated-backend.example.com",
          "2026-08-11T01:00:00Z",
        ]],
        raw: updatedStage,
        ids: ["stage-1"],
      },
    );
  });
});

const temporaryDirectories: string[] = [];

async function temporaryFilePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "nhncloud-apigateway-swagger-"));
  temporaryDirectories.push(directory);
  const nestedDirectory = join(directory, "nested");
  await mkdir(nestedDirectory);
  return join(nestedDirectory, "swagger.json");
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, {
    recursive: true,
    force: true,
  })));
});

describe("writeStageSwaggerFile", () => {
  it("사용자가 지정한 경로를 그대로 사용해 JSON을 저장하고 --force에서 덮어쓴다", async () => {
    const path = await temporaryFilePath();
    await writeFile(path, "old\n");

    await writeStageSwaggerFile(path, { arbitrary: { value: true } }, true);

    await expect(readFile(path, "utf-8")).resolves.toBe(
      '{\n  "arbitrary": {\n    "value": true\n  }\n}\n',
    );
  });

  it("기존 파일은 --force 없이는 경로와 EEXIST를 포함한 입력 오류로 거부한다", async () => {
    const path = await temporaryFilePath();
    await writeFile(path, "old\n");

    await expect(writeStageSwaggerFile(path, { openapi: "3.0.0" })).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
      message: expect.stringMatching(new RegExp(`${path}.*EEXIST`)),
    });
    await expect(readFile(path, "utf-8")).resolves.toBe("old\n");
  });
});

describe("sanitizeForTerminal", () => {
  it("API 문자열의 ANSI escape와 줄바꿈을 치환한다", () => {
    expect(sanitizeForTerminal("stage\u001b[31m\nnext")).toBe("stage?[31m?next");
  });
});
