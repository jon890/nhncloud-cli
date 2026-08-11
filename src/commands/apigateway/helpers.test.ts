import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Resource } from "../../services/apigateway/types.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import {
  collectAffectedPaths,
  readPluginConfigFile,
  requireYes,
} from "./helpers.js";

const tempDirectories: string[] = [];

async function makeTempDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "nhncloud-apigateway-"));
  tempDirectories.push(path);
  return path;
}

function resource(resourceId: string, path: string): Resource {
  return {
    resourceId,
    apigwServiceId: "service-1",
    parentPath: null,
    path,
    methodType: null,
    methodName: null,
    methodDescription: null,
    createdAt: "2026-08-01T00:00:00+09:00",
    updatedAt: "2026-08-02T00:00:00+09:00",
    resourcePluginList: [],
  };
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("requireYes", () => {
  it("--yes가 있을 때 true를 반환한다", () => {
    expect(requireYes(true, "플러그인 설정")).toBe(true);
  });

  it("--yes가 없으면 EXIT_PARAM_ERROR로 거부한다", () => {
    expect(() => requireYes(undefined, "플러그인 설정")).toThrow("--yes");
    expect(() => requireYes(false, "플러그인 설정")).toThrow(
      expect.objectContaining({ exitCode: EXIT_PARAM_ERROR }),
    );
  });
});

describe("readPluginConfigFile", () => {
  it("일반 파일의 JSON을 unknown 값으로 반환한다", async () => {
    const directory = await makeTempDirectory();
    const path = join(directory, "plugins.json");
    const config = { pathPluginList: [{ pluginType: "CORS" }] };
    await writeFile(path, JSON.stringify(config), "utf-8");

    await expect(readPluginConfigFile(path)).resolves.toEqual(config);
  });

  it("없는 경로는 ENOENT와 EXIT_PARAM_ERROR를 보존한다", async () => {
    const directory = await makeTempDirectory();
    const path = join(directory, "missing.json");

    await expect(readPluginConfigFile(path)).rejects.toMatchObject({
      message: expect.stringContaining("ENOENT"),
      exitCode: EXIT_PARAM_ERROR,
    });
  });

  it("디렉터리는 EISDIR와 EXIT_PARAM_ERROR로 거부한다", async () => {
    const directory = await makeTempDirectory();
    const path = join(directory, "plugins");
    await mkdir(path);

    await expect(readPluginConfigFile(path)).rejects.toMatchObject({
      message: expect.stringContaining("EISDIR"),
      exitCode: EXIT_PARAM_ERROR,
    });
  });

  it("1,000,000 바이트를 초과한 파일은 읽기 전에 크기와 한도를 알려 거부한다", async () => {
    const directory = await makeTempDirectory();
    const path = join(directory, "large.json");
    await writeFile(path, "x".repeat(1_000_001), "utf-8");

    await expect(readPluginConfigFile(path)).rejects.toMatchObject({
      message: expect.stringContaining(
        "플러그인 설정 파일이 너무 큽니다 (1000001 바이트). 허용 상한은 1000000 바이트입니다.",
      ),
      exitCode: EXIT_PARAM_ERROR,
    });
  });

  it("JSON 파싱 실패 메시지에 인용된 경로를 포함한다", async () => {
    const directory = await makeTempDirectory();
    const path = join(directory, "broken config.json");
    await writeFile(path, "{", "utf-8");

    await expect(readPluginConfigFile(path)).rejects.toMatchObject({
      message: expect.stringContaining(JSON.stringify(path)),
      exitCode: EXIT_PARAM_ERROR,
    });
  });

  it("JSON 파싱 실패 상세의 ANSI escape와 제어 문자를 치환한다", async () => {
    const directory = await makeTempDirectory();
    const path = join(directory, "unsafe.json");
    await writeFile(path, "not-\u001b[31m-json", "utf-8");

    const error = await readPluginConfigFile(path).catch((caught: unknown) => caught);

    expect(error).toMatchObject({ exitCode: EXIT_PARAM_ERROR });
    expect((error as Error).message).not.toContain("\u001b");
    expect((error as Error).message).toContain("not-?[31m-json");
  });
});

describe("collectAffectedPaths", () => {
  const resources = [
    resource("root", "/"),
    resource("private", "/private"),
    resource("private-child", "/private/users"),
    resource("private-sibling", "/private2"),
    resource("public", "/public"),
  ];

  it("루트 경로는 전체 resource를 반환한다", () => {
    expect(collectAffectedPaths(resources, "/")).toEqual(resources);
  });

  it("정확히 일치하는 대상과 구분자 뒤 하위 경로를 포함한다", () => {
    expect(collectAffectedPaths(resources, "/private").map((item) => item.resourceId)).toEqual([
      "private",
      "private-child",
    ]);
  });

  it("접두사가 같아도 형제 경로인 /private2는 포함하지 않는다", () => {
    expect(collectAffectedPaths(resources, "/private")).not.toContainEqual(
      expect.objectContaining({ path: "/private2" }),
    );
  });
});
