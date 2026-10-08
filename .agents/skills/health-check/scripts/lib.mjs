// health-check 스크립트가 함께 쓰는 공용 helper.

import { spawnSync } from "node:child_process";
import { dirname } from "node:path";

export function run(cmd, args = [], opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });
  return {
    status: r.status ?? -1,
    signal: r.signal ?? null,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    error: r.error,
  };
}

export function repoRoot(cwd = process.cwd()) {
  const r = run("git", ["rev-parse", "--show-toplevel"], { cwd });
  return r.status === 0 && r.stdout.trim() ? r.stdout.trim() : null;
}

export function mainCheckoutRoot(cwd = process.cwd()) {
  const r = run("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd });
  return r.status === 0 && r.stdout.trim() ? dirname(r.stdout.trim()) : null;
}

export function enterRepoRoot() {
  const root = repoRoot();
  if (!root) {
    console.error("git 저장소 안에서 실행한다.");
    process.exit(2);
  }
  process.chdir(root);
  return root;
}

export function parseJsonOrNull(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function majorOf(version) {
  const m = /^\D*(\d+)/.exec(String(version ?? ""));
  return m ? Number(m[1]) : null;
}

export function checkPnpmMajor(packageManager, pnpmVersion) {
  if (typeof packageManager !== "string" || !packageManager.startsWith("pnpm@")) {
    return `package.json 의 packageManager 가 pnpm@ 로 시작하지 않는다: ${packageManager}`;
  }
  const want = majorOf(packageManager.slice("pnpm@".length));
  const have = majorOf(pnpmVersion);
  if (want === null || have === null || want !== have) {
    return `pnpm 메이저 버전이 맞지 않는다: packageManager ${packageManager}, 설치된 pnpm ${String(pnpmVersion).trim()}`;
  }
  return null;
}

export function parseAuditReport(text) {
  const data = parseJsonOrNull(text);
  if (!data || typeof data !== "object" || "error" in data) return null;
  const vulns = data.metadata?.vulnerabilities;
  if (!vulns || typeof vulns !== "object") return null;
  return data;
}

const SEVERITY_ORDER = ["critical", "high", "moderate", "low", "info"];

function severityRank(severity) {
  const i = SEVERITY_ORDER.indexOf(severity);
  return i === -1 ? SEVERITY_ORDER.length : i;
}

export function classifyAdvisories(audit, pkg) {
  const declared = new Set([...Object.keys(pkg?.dependencies ?? {}), ...Object.keys(pkg?.devDependencies ?? {})]);
  const list = Object.values(audit?.advisories ?? {}).map((adv) => {
    const findings = adv.findings ?? [];
    const installed = [...new Set(findings.map((f) => f.version))].join(", ");
    const via = [];
    for (const f of findings) {
      for (const p of f.paths ?? []) {
        const second = p.split(">")[1];
        if (second && !via.includes(second)) via.push(second);
      }
    }
    return {
      id: adv.github_advisory_id ?? String(adv.id),
      module: adv.module_name,
      severity: adv.severity,
      title: adv.title,
      installed,
      patched: adv.patched_versions,
      scope: findings.some((f) => f.dev === false) ? "runtime" : "dev",
      via,
      direct: declared.has(adv.module_name),
      url: adv.url,
    };
  });
  return list.sort(
    (a, b) =>
      Number(b.scope === "runtime") - Number(a.scope === "runtime") ||
      severityRank(a.severity) - severityRank(b.severity) ||
      String(a.module).localeCompare(String(b.module)),
  );
}

export function classifyOutdated(raw) {
  return Object.entries(raw ?? {}).map(([name, info]) => {
    const cur = majorOf(info.current);
    const lat = majorOf(info.latest);
    return {
      name,
      type: info.dependencyType === "devDependencies" ? "dev" : "runtime",
      current: info.current,
      wanted: info.wanted,
      latest: info.latest,
      deprecated: Boolean(info.isDeprecated),
      kind: cur !== null && lat !== null && lat > cur ? "major" : "in-range",
    };
  });
}
