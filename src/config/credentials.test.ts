import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const home = vi.hoisted(() => ({ dir: "" }));
vi.mock("node:os", async (orig) => {
  const actual = await orig<typeof import("node:os")>();
  return { ...actual, homedir: () => home.dir };
});

// SUT 는 정적 import 금지 — home.dir set 후 동적 로드해야 CONFIG_PATH 가 temp dir 로 굳는다.
let credentials: typeof import("./credentials.js");
let configPath: string;

beforeAll(async () => {
  home.dir = await mkdtemp(path.join(tmpdir(), "ncc-config-"));
  await mkdir(path.join(home.dir, ".nhncloud"), { recursive: true });
  configPath = path.join(home.dir, ".nhncloud", "config.json");
  credentials = await import("./credentials.js");
});
afterAll(async () => {
  await rm(home.dir, { recursive: true, force: true });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(configPath, { force: true });
});

async function writeConfig(value: unknown): Promise<void> {
  await writeFile(configPath, JSON.stringify(value), "utf-8");
}

/** stderr 를 가로채 경고 출력만 모은다. */
function captureStderr(): { chunks: string[] } {
  const chunks: string[] = [];
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    chunks.push(String(chunk));
    return true;
  });
  return { chunks };
}

describe("warnLegacyDeployTargets", () => {
  it("deploy.targets 에 항목이 있으면 stderr 로 경고하고 계속 진행한다", async () => {
    await writeConfig({
      version: 1,
      deploy: { targets: { legacyTarget: { appKey: "<appkey>", artifactId: "1" } } },
    });
    const { chunks } = captureStderr();

    await expect(credentials.warnLegacyDeployTargets()).resolves.toBeUndefined();

    expect(chunks.join("")).toMatch(/deploy\.targets 는 더 이상 사용되지 않습니다/);
    expect(chunks.join("")).toMatch(/configure --deploy-appkey/);
    expect(chunks.join("")).toMatch(/--artifact-id/);
  });

  it("경고에 target 이름을 담지 않는다", async () => {
    await writeConfig({ version: 1, deploy: { targets: { legacyTarget: {} } } });
    const { chunks } = captureStderr();

    await credentials.warnLegacyDeployTargets();

    expect(chunks.join("")).not.toContain("legacyTarget");
  });

  it.each([
    ["deploy 블록 자체가 없으면", { version: 1 }],
    ["targets 가 없으면", { version: 1, deploy: {} }],
    ["targets 가 비어 있으면", { version: 1, deploy: { targets: {} } }],
    ["deploy 가 객체가 아니면", { version: 1, deploy: "legacy" }],
    ["targets 가 객체가 아니면", { version: 1, deploy: { targets: "legacy" } }],
    ["최상위가 객체가 아니면", ["legacy"]],
  ])("%s 경고하지 않는다", async (_label, config) => {
    await writeConfig(config);
    const { chunks } = captureStderr();

    await credentials.warnLegacyDeployTargets();

    expect(chunks).toEqual([]);
  });

  it("config.json 이 없으면 조용히 지나간다", async () => {
    const { chunks } = captureStderr();

    await expect(credentials.warnLegacyDeployTargets()).resolves.toBeUndefined();

    expect(chunks).toEqual([]);
  });

  it("--quiet 에서도 경고를 낸다 (마이그레이션 안내를 CI 가 삼키지 않게)", async () => {
    await writeConfig({ version: 1, deploy: { targets: { legacyTarget: {} } } });
    const { setQuiet } = await import("../utils/spinner.js");
    const { chunks } = captureStderr();

    setQuiet(true);
    try {
      await credentials.warnLegacyDeployTargets();
    } finally {
      setQuiet(false);
    }

    expect(chunks.join("")).toMatch(/deploy\.targets 는 더 이상 사용되지 않습니다/);
  });

  it("config.json 을 자동으로 고치지 않는다", async () => {
    const original = JSON.stringify({ version: 1, deploy: { targets: { legacyTarget: {} } } });
    await writeFile(configPath, original, "utf-8");
    captureStderr();

    await credentials.warnLegacyDeployTargets();

    const { readFile } = await import("node:fs/promises");
    await expect(readFile(configPath, "utf-8")).resolves.toBe(original);
  });
});
