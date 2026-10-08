import { describe, expect, it } from "vitest";
import { checkPnpmMajor, classifyAdvisories, classifyOutdated, parseAuditReport } from "./lib.mjs";

describe("classifyOutdated", () => {
  it("메이저 갱신과 범위 안 갱신, 런타임과 개발 구분을 나눈다", () => {
    const raw = {
      commander: { current: "14.0.3", latest: "15.0.0", wanted: "14.0.3", isDeprecated: false, dependencyType: "dependencies" },
      ora: { current: "9.4.0", latest: "9.4.1", wanted: "9.4.0", isDeprecated: false, dependencyType: "dependencies" },
      typescript: { current: "6.0.3", latest: "7.0.2", wanted: "6.0.3", isDeprecated: false, dependencyType: "devDependencies" },
    };
    const byName = Object.fromEntries(classifyOutdated(raw).map((o) => [o.name, o]));
    expect(byName.commander).toMatchObject({ kind: "major", type: "runtime" });
    expect(byName.ora).toMatchObject({ kind: "in-range", type: "runtime" });
    expect(byName.typescript).toMatchObject({ kind: "major", type: "dev" });
  });

  it("낡은 것이 없으면 빈 배열이다", () => {
    expect(classifyOutdated({})).toEqual([]);
  });
});

describe("classifyAdvisories", () => {
  const pkg = { dependencies: { ky: "^1.14.3" }, devDependencies: { vitest: "^4.1.5" } };
  const audit = {
    advisories: {
      1: {
        id: 1,
        module_name: "vite",
        severity: "high",
        github_advisory_id: "GHSA-aaaa",
        title: "vite 취약점",
        url: "https://github.com/advisories/GHSA-aaaa",
        patched_versions: ">=8.0.15",
        findings: [{ version: "8.0.14", dev: true, paths: [".>vitest>vite", ".>vitest>@vitest/mocker>vite"] }],
      },
      2: {
        id: 2,
        module_name: "ky",
        severity: "low",
        github_advisory_id: "GHSA-bbbb",
        title: "ky 취약점",
        url: "https://github.com/advisories/GHSA-bbbb",
        patched_versions: ">=1.14.4",
        findings: [{ version: "1.14.3", dev: false, paths: [".>ky"] }],
      },
    },
  };

  it("런타임 경로를 먼저 두고 거쳐 오는 직접 의존성을 낸다", () => {
    const [first, second] = classifyAdvisories(audit, pkg);
    expect(first).toMatchObject({ module: "ky", scope: "runtime", direct: true, via: ["ky"], id: "GHSA-bbbb" });
    expect(second).toMatchObject({ module: "vite", scope: "dev", direct: false, via: ["vitest"], installed: "8.0.14" });
  });
});

describe("parseAuditReport", () => {
  it("정상 객체만 돌려주고 오류 객체와 JSON 이 아닌 입력은 null 이다", () => {
    const ok = { advisories: {}, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 } } };
    expect(parseAuditReport(JSON.stringify(ok))).toEqual(ok);
    expect(parseAuditReport(JSON.stringify({ error: {} }))).toBeNull();
    expect(parseAuditReport("not json")).toBeNull();
  });
});

describe("checkPnpmMajor", () => {
  it("메이저가 같으면 null, 다르거나 packageManager 가 없으면 이유를 돌려준다", () => {
    expect(checkPnpmMajor("pnpm@11.18.0", "11.2.0")).toBeNull();
    expect(typeof checkPnpmMajor("pnpm@11.18.0", "10.0.0")).toBe("string");
    expect(typeof checkPnpmMajor(undefined, "11.0.0")).toBe("string");
  });
});
