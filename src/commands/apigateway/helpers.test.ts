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

  it("JSON 파싱 실패 메시지에 인용된 경로를 포함한다", async () => {
    const directory = await makeTempDirectory();
    const path = join(directory, "broken config.json");
    await writeFile(path, "{", "utf-8");

    await expect(readPluginConfigFile(path)).rejects.toMatchObject({
      message: expect.stringContaining(JSON.stringify(path)),
      exitCode: EXIT_PARAM_ERROR,
    });
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
