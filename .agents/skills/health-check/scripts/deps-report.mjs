#!/usr/bin/env node
// pnpm outdated 와 pnpm audit 결과를 읽어 의존성 측정 표를 낸다.
//
// 사용법: node .agents/skills/health-check/scripts/deps-report.mjs [--json]
// 출력: 범위 안 갱신과 메이저 갱신을 나눈 낡은 의존성 표,
// 런타임 경로와 개발 도구 경로를 나눈 취약점 표. --json 이면 같은 내용을 JSON 으로 낸다.
// 종료 코드: 0 낡은 것도 취약점도 없음, 1 하나 이상 있음,
// 2 저장소 root 나 pnpm 을 찾지 못했거나 pnpm 버전이 맞지 않거나 pnpm 출력을 읽지 못함

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  checkPnpmMajor,
  classifyAdvisories,
  classifyOutdated,
  enterRepoRoot,
  parseAuditReport,
  parseJsonOrNull,
  run,
} from "./lib.mjs";

export function buildResult(pkg, outdatedRaw, audit) {
  const outdated = classifyOutdated(outdatedRaw);
  const advisories = classifyAdvisories(audit, pkg);
  return {
    engines: pkg?.engines ?? {},
    outdated,
    advisories,
    summary: {
      outdatedInRange: outdated.filter((o) => o.kind === "in-range").length,
      outdatedMajor: outdated.filter((o) => o.kind === "major").length,
      deprecated: outdated.filter((o) => o.deprecated).length,
      runtimeAdvisories: advisories.filter((a) => a.scope === "runtime").length,
      devAdvisories: advisories.filter((a) => a.scope === "dev").length,
      bySeverity: audit?.metadata?.vulnerabilities ?? {},
    },
  };
}

export function renderMarkdown(result) {
  const { summary, engines, outdated, advisories } = result;
  const severities = Object.entries(summary.bySeverity)
    .filter(([, n]) => n > 0)
    .map(([level, n]) => `${level} ${n}`)
    .join(", ");
  const lines = [
    "# 의존성 측정",
    "",
    `- 낡은 의존성: 범위 안 ${summary.outdatedInRange}건, 메이저 ${summary.outdatedMajor}건, deprecated ${summary.deprecated}건`,
    `- 취약점 경로: 런타임 ${summary.runtimeAdvisories}건, 개발 ${summary.devAdvisories}건`,
    `- 등급별 취약점: ${severities || "없음"}`,
    `- engines.node: ${engines.node ?? "없음"}`,
  ];
  if (outdated.length > 0) {
    lines.push("", "## 낡은 의존성", "", "| 패키지 | 구분 | 현재 | 최신 | 갱신 종류 |", "|---|---|---|---|---|");
    for (const o of outdated) {
      lines.push(`| \`${o.name}\` | ${o.type} | ${o.current} | ${o.latest} | ${o.kind === "major" ? "메이저" : "범위 안"} |`);
    }
  }
  if (advisories.length > 0) {
    lines.push(
      "",
      "## 취약점",
      "",
      "| 경로 | 등급 | 패키지 | 설치 | 수정 | 거쳐 오는 직접 의존성 | 내용 |",
      "|---|---|---|---|---|---|---|",
    );
    for (const a of advisories) {
      const title = String(a.title ?? "").replaceAll("|", "\\|");
      lines.push(
        `| ${a.scope} | ${a.severity} | \`${a.module}\` | ${a.installed} | ${a.patched} | ${a.via.join(", ")} | ${title} |`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

function main() {
  try {
    enterRepoRoot();
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    const version = run("pnpm", ["--version"]);
    if (version.status !== 0) {
      console.error("pnpm 을 실행하지 못했다.");
      return 2;
    }
    const mismatch = checkPnpmMajor(pkg.packageManager, version.stdout);
    if (mismatch) {
      console.error(mismatch);
      return 2;
    }
    const outdated = run("pnpm", ["outdated", "--format", "json"]);
    if (outdated.status !== 0 && outdated.status !== 1) {
      console.error(`pnpm outdated 가 실패했다 (종료 코드 ${outdated.status}).`);
      return 2;
    }
    const outdatedRaw = outdated.stdout.trim() === "" ? {} : parseJsonOrNull(outdated.stdout);
    if (!outdatedRaw || typeof outdatedRaw !== "object") {
      console.error("pnpm outdated 출력을 읽지 못했다.");
      return 2;
    }
    const audit = parseAuditReport(run("pnpm", ["audit", "--json"]).stdout);
    if (!audit) {
      console.error("pnpm audit 출력을 읽지 못했다.");
      return 2;
    }
    const result = buildResult(pkg, outdatedRaw, audit);
    process.stdout.write(process.argv.includes("--json") ? `${JSON.stringify(result, null, 2)}\n` : renderMarkdown(result));
    return result.outdated.length + result.advisories.length > 0 ? 1 : 0;
  } catch (e) {
    console.error(`의존성 측정에 실패했다: ${e instanceof Error ? e.message : String(e)}`);
    return 2;
  }
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exit(main());
}
