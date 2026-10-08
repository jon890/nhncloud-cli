import { describe, expect, it } from "vitest";
import { buildResult, renderMarkdown } from "./deps-report.mjs";

const pkg = { engines: { node: ">=20" }, dependencies: { ky: "^1.14.3" }, devDependencies: {} };
const outdatedRaw = {
  commander: { current: "14.0.3", latest: "15.0.0", wanted: "14.0.3", isDeprecated: false, dependencyType: "dependencies" },
  ora: { current: "9.4.0", latest: "9.4.1", wanted: "9.4.0", isDeprecated: false, dependencyType: "dependencies" },
};
const audit = {
  advisories: {
    2: {
      id: 2,
      module_name: "ky",
      severity: "low",
      github_advisory_id: "GHSA-bbbb",
      title: "a|b",
      url: "https://github.com/advisories/GHSA-bbbb",
      patched_versions: ">=1.14.4",
      findings: [{ version: "1.14.3", dev: false, paths: [".>ky"] }],
    },
  },
  metadata: { vulnerabilities: { info: 0, low: 1, moderate: 0, high: 0, critical: 0 } },
};

describe("renderMarkdown", () => {
  it("낡은 의존성 표와 취약점 표를 낸다", () => {
    const result = buildResult(pkg, outdatedRaw, audit);
    expect(result.summary).toMatchObject({ outdatedInRange: 1, outdatedMajor: 1, runtimeAdvisories: 1, devAdvisories: 0 });
    const md = renderMarkdown(result);
    expect(md).toContain("| `commander` | runtime | 14.0.3 | 15.0.0 | 메이저 |");
    expect(md).toContain("## 취약점");
    expect(md).toContain("a\\|b");
  });

  it("낡은 것도 취약점도 없으면 두 절을 내지 않는다", () => {
    const empty = { advisories: {}, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 } } };
    const md = renderMarkdown(buildResult(pkg, {}, empty));
    expect(md).not.toContain("## 낡은 의존성");
    expect(md).not.toContain("## 취약점");
    expect(md).toContain("등급별 취약점: 없음");
  });
});
