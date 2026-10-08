import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHECK_STEPS, nameOfSpec, parseArgs, runSteps, splitByDepType, trialWorktreePath } from "./trial-update.mjs";

describe("parseArgs", () => {
  it("범위 안 갱신과 지정 패키지를 함께 읽는다", () => {
    expect(parseArgs(["--range", "--pkg", "commander@^15.0.0", "--dev-pkg", "@types/node@^26"])).toEqual({
      range: true,
      keep: false,
      pkgs: ["commander@^15.0.0"],
      devPkgs: ["@types/node@^26"],
      outDir: null,
    });
  });

  it.each([[[]], [["--pkg"]], [["--pkg", "commander"]], [["--unknown"]]])("%j 는 던진다", (argv) => {
    expect(() => parseArgs(argv)).toThrow();
  });
});

describe("nameOfSpec", () => {
  it("scope 가 있는 이름과 없는 이름에서 버전을 뗀다", () => {
    expect(nameOfSpec("@types/node@^26")).toBe("@types/node");
    expect(nameOfSpec("ky@^2.1.0")).toBe("ky");
  });
});

describe("splitByDepType", () => {
  it("devDependencies 이름이면 dev, 아니면 prod 로 나눈다", () => {
    expect(splitByDepType(["ky@^2", "typescript@^7"], new Set(["typescript"]))).toEqual({
      prod: ["ky@^2"],
      dev: ["typescript@^7"],
    });
  });
});

describe("trialWorktreePath", () => {
  it("메인 checkout 의 worktrees/nhncloud-cli 아래 health-check-<suffix> 경로다", () => {
    expect(trialWorktreePath("/repo", "1-2")).toBe(join("/repo", "worktrees", "nhncloud-cli", "health-check-1-2"));
  });
});

describe("CHECK_STEPS", () => {
  it("타입 검사, 테스트, 빌드, 패키지 검증 순서다", () => {
    expect(CHECK_STEPS.map(([name]) => name)).toEqual(["tsc", "test", "build", "verify-package"]);
  });
});

describe("runSteps", () => {
  const steps = [
    { name: "install", kind: "setup" },
    { name: "update", kind: "setup" },
    ...CHECK_STEPS.map(([name]) => ({ name, kind: "check" })),
  ];

  function recorder(outcomes) {
    const called = [];
    const runner = (step) => {
      called.push(step.name);
      return outcomes[step.name] ?? { status: 0, signal: null };
    };
    return { called, runner };
  }

  it("모두 통과하면 모든 단계를 순서대로 부른다", () => {
    const { called, runner } = recorder({});
    const results = runSteps(steps, runner);
    expect(called).toEqual(steps.map((s) => s.name));
    expect(results).toHaveLength(steps.length);
    expect(results.every((r) => r.status === 0 && r.judge === true)).toBe(true);
  });

  it("설치 단계가 실패하면 검사 단계를 부르지 않는다", () => {
    const { called, runner } = recorder({ install: { status: 1, signal: null } });
    const results = runSteps(steps, runner);
    expect(called).toEqual(["install"]);
    expect(results).toEqual([{ name: "install", status: 1, signal: null, judge: true, kind: "setup" }]);
  });

  it("검사 단계 하나가 실패해도 나머지 검사 단계는 모두 부른다", () => {
    const { called, runner } = recorder({ tsc: { status: 1, signal: null } });
    const results = runSteps(steps, runner);
    expect(called).toEqual(steps.map((s) => s.name));
    expect(results.find((r) => r.name === "tsc").status).toBe(1);
  });

  it.each([
    ["signal", { status: null, signal: "SIGINT" }],
    ["status 130", { status: 130, signal: null }],
  ])("중단(%s)이면 그 뒤 단계를 부르지 않는다", (_label, outcome) => {
    const { called, runner } = recorder({ test: outcome });
    const results = runSteps(steps, runner);
    expect(called).toEqual(["install", "update", "tsc", "test"]);
    expect(results.at(-1)).toMatchObject({ name: "test", ...outcome });
  });

  it("judge 를 false 로 준 단계는 결과에 false 로 남는다", () => {
    const { runner } = recorder({});
    expect(runSteps([{ name: "audit", kind: "check", judge: false }], runner)[0].judge).toBe(false);
  });
});
