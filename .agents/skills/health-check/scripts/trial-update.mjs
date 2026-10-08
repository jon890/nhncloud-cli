#!/usr/bin/env node
// 의존성 갱신을 임시 worktree 에서 설치하고 저장소 검사를 돌려 결과 표와 patch 를 남긴다.
//
// 사용법:
//   node .agents/skills/health-check/scripts/trial-update.mjs --range
//   node .agents/skills/health-check/scripts/trial-update.mjs --pkg NAME@SPEC
//   node .agents/skills/health-check/scripts/trial-update.mjs --range --dev-pkg NAME@SPEC --keep
//
// 옵션:
//   --range            범위 안 갱신(pnpm update)을 시험한다
//   --pkg NAME@SPEC    지정한 패키지를 그 버전으로 올린다. devDependencies 에 있는 이름이면 -D 로 올린다. 반복할 수 있다
//   --dev-pkg NAME@SPEC 지정한 패키지를 devDependencies 로 올린다. 반복할 수 있다
//   --out DIR          로그와 changes.patch 를 둘 디렉터리. 없으면 임시 디렉터리를 만든다
//   --keep             시험이 끝나도 임시 worktree 를 지우지 않는다
//
// worktree 는 메인 checkout 의 worktrees/nhncloud-cli/health-check-<시각>-<pid> 에 HEAD 커밋으로 만든다.
// 커밋하지 않은 변경은 시험에 들어가지 않는다. 작업 중인 checkout 의 package.json 과 lockfile 은 바뀌지 않는다.
// 종료 코드: 0 갱신과 검사가 모두 통과, 1 하나 이상 실패나 중단,
// 2 인자 오류, pnpm 버전 불일치, worktree 생성 실패

import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkPnpmMajor,
  classifyAdvisories,
  enterRepoRoot,
  mainCheckoutRoot,
  parseAuditReport,
  parseJsonOrNull,
  run,
} from "./lib.mjs";

const SPEC_PATTERN = /^(@[^/]+\/)?[^@]+@.+$/;

export const CHECK_STEPS = [
  ["tsc", ["exec", "tsc", "--noEmit"]],
  ["test", ["test"]],
  ["build", ["run", "build"]],
  ["verify-package", ["run", "verify:package"]],
];

export function parseArgs(argv) {
  const result = { range: false, keep: false, pkgs: [], devPkgs: [], outDir: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--range") {
      result.range = true;
    } else if (arg === "--keep") {
      result.keep = true;
    } else if (arg === "--pkg" || arg === "--dev-pkg" || arg === "--out") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`${arg} 에 값이 없다.`);
      }
      i++;
      if (arg === "--out") {
        result.outDir = value;
        continue;
      }
      if (!SPEC_PATTERN.test(value)) {
        throw new Error(`${arg} 값은 NAME@SPEC 형식이어야 한다: ${value}`);
      }
      (arg === "--pkg" ? result.pkgs : result.devPkgs).push(value);
    } else {
      throw new Error(`모르는 인자다: ${arg}`);
    }
  }
  if (!result.range && result.pkgs.length === 0 && result.devPkgs.length === 0) {
    throw new Error("--range, --pkg, --dev-pkg 가운데 하나 이상을 준다.");
  }
  return result;
}

export function nameOfSpec(spec) {
  return spec.slice(0, spec.lastIndexOf("@"));
}

export function splitByDepType(pkgs, devNames) {
  const prod = [];
  const dev = [];
  for (const spec of pkgs) (devNames.has(nameOfSpec(spec)) ? dev : prod).push(spec);
  return { prod, dev };
}

export function trialWorktreePath(mainRoot, suffix) {
  return join(mainRoot, "worktrees", "nhncloud-cli", `health-check-${suffix}`);
}

function isInterrupted(outcome) {
  return outcome.signal != null || outcome.status >= 128;
}

export function runSteps(steps, runner) {
  const results = [];
  for (const step of steps) {
    const outcome = runner(step);
    const judge = step.judge ?? true;
    results.push({ ...outcome, name: step.name, status: outcome.status, signal: outcome.signal ?? null, judge, kind: step.kind });
    if (isInterrupted(outcome)) break;
    if (step.kind === "setup" && outcome.status !== 0) break;
  }
  return results;
}

function describeTargets(opts) {
  const parts = [];
  if (opts.range) parts.push("범위 안 갱신");
  if (opts.pkgs.length > 0) parts.push(`--pkg ${opts.pkgs.join(", ")}`);
  if (opts.devPkgs.length > 0) parts.push(`--dev-pkg ${opts.devPkgs.join(", ")}`);
  return parts.join(", ");
}

function statusCell(r) {
  if (isInterrupted(r)) return `${r.signal ?? r.status} (중단)`;
  if (!r.judge) return `${r.status} (보고만)`;
  return `${r.status} (${r.status === 0 ? "통과" : "실패"})`;
}

function renderReport({ opts, outDir, patchPath, steps, results, advisories, pkgDiff }) {
  const lines = [
    "# 갱신 시험",
    "",
    `- 대상: ${describeTargets(opts)}`,
    `- 로그: ${outDir}`,
    `- patch: ${patchPath}`,
    "",
    "| 단계 | 종료 코드 | 로그 |",
    "|---|---|---|",
  ];
  for (const step of steps) {
    const r = results.find((x) => x.name === step.name);
    lines.push(r ? `| ${r.name} | ${statusCell(r)} | ${r.log ?? ""} |` : `| ${step.name} | (실행 안 함) | |`);
  }
  lines.push("");
  if (advisories === null) {
    lines.push("- 갱신 후 취약점: 읽지 못함");
  } else if (advisories.length === 0) {
    lines.push("- 갱신 후 취약점: 없음");
  } else {
    lines.push("## 갱신 후 남은 advisory", "", "| 패키지 | 등급 | 거쳐 오는 직접 의존성 |", "|---|---|---|");
    for (const a of advisories) lines.push(`| \`${a.module}\` | ${a.severity} | ${a.via.join(", ")} |`);
  }
  lines.push("", "## package.json 의 바뀐 의존성", "", "```diff", ...(pkgDiff.length > 0 ? pkgDiff : ["(바뀐 줄 없음)"]), "```");
  return `${lines.join("\n")}\n`;
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    return 2;
  }

  enterRepoRoot();
  const pkg = parseJsonOrNull(readFileSync("package.json", "utf8"));
  const version = run("pnpm", ["--version"]);
  if (version.status !== 0) {
    console.error("pnpm 을 실행하지 못했다.");
    return 2;
  }
  const mismatch = checkPnpmMajor(pkg?.packageManager, version.stdout);
  if (mismatch) {
    console.error(mismatch);
    return 2;
  }

  const mainRoot = mainCheckoutRoot();
  if (!mainRoot) {
    console.error("메인 checkout 위치를 찾지 못했다.");
    return 2;
  }
  const wt = trialWorktreePath(mainRoot, `${Date.now()}-${process.pid}`);
  if (existsSync(wt)) {
    console.error(`임시 worktree 경로가 이미 있다: ${wt}`);
    return 2;
  }
  mkdirSync(dirname(wt), { recursive: true });

  const outDir = opts.outDir ? resolve(opts.outDir) : mkdtempSync(join(tmpdir(), "health-check-"));
  mkdirSync(outDir, { recursive: true });

  const added = run("git", ["worktree", "add", "--detach", wt, "HEAD"]);
  if (added.status !== 0) {
    console.error(`임시 worktree 를 만들지 못했다: ${wt}`);
    console.error(added.stderr.trim());
    return 2;
  }
  console.error(`임시 worktree: ${wt}`);
  console.error(`중간에 멈춰 남으면 지우는 명령: git worktree remove --force "${wt}"`);
  try {
    // 처리기가 없으면 Ctrl+C 에 node 가 곧바로 죽어 아래 finally 의 worktree 정리가 돌지 않는다.
    // main 은 spawnSync 로만 돌아 이벤트 루프가 돌지 않으므로 처리기 본문은 실행되지 않는다.
    // 중단 판정은 같은 신호를 받은 자식 프로세스의 signal 과 종료 코드로 한다.
    process.on("SIGINT", () => {});
    process.on("SIGTERM", () => {});

    const runner = (step) => {
      const r = run(step.cmd, step.args, { cwd: wt });
      const log = join(outDir, `${step.name}.log`);
      writeFileSync(log, `$ ${step.cmd} ${step.args.join(" ")}\n\n[stdout]\n${r.stdout}\n[stderr]\n${r.stderr}${r.error ? `\n[error]\n${r.error.message}\n` : ""}`);
      return { status: r.status, signal: r.signal, log, stdout: r.stdout };
    };

    const wtPkg = parseJsonOrNull(readFileSync(join(wt, "package.json"), "utf8"));
    const { prod, dev } = splitByDepType(opts.pkgs, new Set(Object.keys(wtPkg?.devDependencies ?? {})));
    const devAll = [...dev, ...opts.devPkgs];
    const steps = [{ name: "install", cmd: "pnpm", args: ["install", "--frozen-lockfile"], kind: "setup" }];
    if (opts.range) steps.push({ name: "update", cmd: "pnpm", args: ["update"], kind: "setup" });
    if (prod.length > 0) steps.push({ name: "add", cmd: "pnpm", args: ["add", ...prod], kind: "setup" });
    if (devAll.length > 0) steps.push({ name: "add-dev", cmd: "pnpm", args: ["add", "-D", ...devAll], kind: "setup" });
    for (const [name, args] of CHECK_STEPS) steps.push({ name, cmd: "pnpm", args, kind: "check" });

    const results = runSteps(steps, runner);
    const stopped = results.some(isInterrupted);
    if (stopped) {
      console.error("중단 신호를 받아 시험을 멈췄다.");
      return 1;
    }

    const auditStep = { name: "audit", cmd: "pnpm", args: ["audit", "--json"], kind: "check", judge: false };
    const [auditResult] = runSteps([auditStep], runner);
    if (isInterrupted(auditResult)) {
      console.error("중단 신호를 받아 시험을 멈췄다.");
      return 1;
    }
    const audit = parseAuditReport(auditResult.stdout ?? "");
    const updatedPkg = parseJsonOrNull(readFileSync(join(wt, "package.json"), "utf8"));
    const advisories = audit ? classifyAdvisories(audit, updatedPkg) : null;

    const diff = run("git", ["diff", "--", "package.json", "pnpm-lock.yaml"], { cwd: wt });
    const patchPath = join(outDir, "changes.patch");
    writeFileSync(patchPath, diff.stdout);
    const pkgDiff = run("git", ["diff", "-U0", "--", "package.json"], { cwd: wt })
      .stdout.split("\n")
      .filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---) /.test(l));

    const allResults = [...results, auditResult];
    process.stdout.write(
      renderReport({ opts, outDir, patchPath, steps: [...steps, auditStep], results: allResults, advisories, pkgDiff }),
    );
    return results.some((r) => r.judge && r.status !== 0) ? 1 : 0;
  } finally {
    if (opts.keep) {
      console.log(`\n임시 worktree 를 남겼다: ${wt}`);
      console.log(`지우는 명령: git worktree remove --force "${wt}"`);
    } else {
      const removed = run("git", ["worktree", "remove", "--force", wt]);
      if (removed.status !== 0) {
        console.error(`임시 worktree 를 지우지 못했다: ${wt}`);
        console.error(`지우는 명령: git worktree remove --force "${wt}"`);
      }
    }
  }
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exit(main());
}
