import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";
import { createSkillManagerContext, readPackageVersion, resolveSkillDataRoot } from "./context.js";

let packageRoot: string;

beforeEach(() => {
  packageRoot = mkdtempSync(path.join(tmpdir(), "nhncloud-skill-context-"));
});

afterEach(() => {
  rmSync(packageRoot, { recursive: true, force: true });
});

describe("resolveSkillDataRoot", () => {
  it("절대 XDG_DATA_HOME 아래의 nhncloud-cli 경로를 사용한다", () => {
    expect(resolveSkillDataRoot("/home/tester", "/var/lib/tester")).toBe(
      path.join("/var/lib/tester", "nhncloud-cli"),
    );
  });

  it("XDG_DATA_HOME이 없거나 상대 경로면 사용자 홈의 기본 경로를 사용한다", () => {
    const expected = path.join("/home/tester", ".local", "share", "nhncloud-cli");
    expect(resolveSkillDataRoot("/home/tester")).toBe(expected);
    expect(resolveSkillDataRoot("/home/tester", "relative/data")).toBe(expected);
  });
});

describe("createSkillManagerContext", () => {
  it("소스 실행 위치에서도 패키지 루트와 버전을 해석한다", () => {
    const previousXdgDataHome = process.env.XDG_DATA_HOME;
    process.env.XDG_DATA_HOME = packageRoot;
    try {
      const context = createSkillManagerContext();
      const expectedPackageRoot = path.resolve(__dirname, "../..");

      expect(context.packageRoot).toBe(expectedPackageRoot);
      expect(context.currentVersion).toBe(readPackageVersion(expectedPackageRoot));
      expect(context.dataRoot).toBe(path.join(packageRoot, "nhncloud-cli"));
    } finally {
      if (previousXdgDataHome === undefined) {
        delete process.env.XDG_DATA_HOME;
      } else {
        process.env.XDG_DATA_HOME = previousXdgDataHome;
      }
    }
  });
});

describe("readPackageVersion", () => {
  it("검증된 package name과 version을 읽는다", () => {
    writeFileSync(
      path.join(packageRoot, "package.json"),
      JSON.stringify({ name: "@bifos/nhncloud-cli", version: "1.2.3" }),
    );

    expect(readPackageVersion(packageRoot)).toBe("1.2.3");
  });

  it.each([
    [{ version: "1.2.3" }, "name 누락"],
    [{ name: "@bifos/nhncloud-cli" }, "version 누락"],
    [{ name: "@bifos/nhncloud-cli", version: 123 }, "version 타입 오류"],
    [{ name: "another-package", version: "1.2.3" }, "package name 오류"],
  ])("잘못된 package metadata를 거부한다: %s", (metadata, _description) => {
    writeFileSync(path.join(packageRoot, "package.json"), JSON.stringify(metadata));

    expect(() => readPackageVersion(packageRoot)).toThrowError(
      expect.objectContaining({ exitCode: EXIT_PARAM_ERROR }),
    );
  });

  it("읽을 수 없는 package.json을 매개변수 오류로 변환한다", () => {
    mkdirSync(path.join(packageRoot, "package.json"));

    expect(() => readPackageVersion(packageRoot)).toThrowError(
      expect.objectContaining({ exitCode: EXIT_PARAM_ERROR }),
    );
  });
});
