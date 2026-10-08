#!/usr/bin/env node
// 직전 태그 이후 src/ 에 추가된 명령과 옵션이 README.md 나 skills/ 에 있는지 검사한다.
//
// 근거: docs/adr/041-release-publish-local-ci-verify.md
// 사용법: node .agents/skills/release/scripts/doc-sync-check.mjs [검사할 문자열...]
// 종료 코드: 0 모두 발견(대상이 0건인 경우 포함), 1 문서에 없는 대상이 있음,
// 2 직전 태그나 검사 경로가 없음
// 인자를 주면 diff 를 보지 않고 그 문자열만 검사한다.
//
// 대상 추출: 테스트 파일을 뺀 src/ 의 추가된 줄에서 `new Command("이름")` 의 이름과
// `.option(...)`, `.requiredOption(...)` 첫 문자열 안의 `--긴-이름` 을 뽑는다.
// 한계:
// - `new Command(name)` 처럼 이름을 변수로 넘기는 팩토리가 만든 명령은 뽑지 못한다.
// - `list`, `create`, `--name` 같은 흔한 이름은 문서 어딘가에 있기만 하면 통과하므로
//   새 명령의 문서가 빠져도 걸러지지 않는다.
// 문서 검색은 파일을 직접 읽어 고정 문자열로 찾는다. 셸 grep 은 `--search` 같은 값을
// 자기 옵션으로 읽기 때문에 쓰지 않는다.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { repoRoot, run } from "./lib.mjs";

const COMMAND_RE = /new Command\(\s*["'`]([^"'`]+)["'`]/g;
const OPTION_RE = /\.(?:option|requiredOption)\(\s*["'`]([^"'`]+)["'`]/g;
const LONG_FLAG_RE = /--[A-Za-z0-9][A-Za-z0-9-]*/g;

export function extractTargets(diffText) {
  const byFile = new Map();
  let current = "";
  for (const line of diffText.split("\n")) {
    if (line.startsWith("+++ ")) {
      current = line.slice(4);
      continue;
    }
    if (line.startsWith("+")) {
      if (!byFile.has(current)) byFile.set(current, []);
      byFile.get(current).push(line.slice(1));
    }
  }
  const targets = new Set();
  for (const lines of byFile.values()) {
    const text = lines.join("\n");
    for (const m of text.matchAll(COMMAND_RE)) targets.add(m[1]);
    for (const m of text.matchAll(OPTION_RE)) {
      for (const flag of m[1].matchAll(LONG_FLAG_RE)) targets.add(flag[0]);
    }
  }
  return [...targets];
}

export function findMissing(targets, files) {
  const lines = [...files.values()].flat();
  return targets.filter((t) => !lines.some((line) => line.includes(t)));
}

function collectFiles(root, rel, out) {
  const abs = join(root, rel);
  if (!existsSync(abs)) return false;
  if (statSync(abs).isDirectory()) {
    for (const name of readdirSync(abs)) collectFiles(root, join(rel, name), out);
  } else {
    out.set(rel, readFileSync(abs, "utf8").split("\n"));
  }
  return true;
}

function main() {
  const root = repoRoot();
  if (!root) {
    console.error("git 저장소 안에서 실행해야 한다.");
    return 2;
  }
  const files = new Map();
  for (const rel of ["README.md", "skills"]) {
    if (!collectFiles(root, rel, files)) {
      console.error(`검사 경로가 없다: ${rel}`);
      return 2;
    }
  }

  let targets = process.argv.slice(2);
  if (targets.length === 0) {
    const tag = run("git", ["describe", "--tags", "--abbrev=0"], { cwd: root });
    if (tag.status !== 0) {
      console.error("직전 태그를 찾을 수 없다.");
      return 2;
    }
    const prev = tag.stdout.trim();
    const diff = run(
      "git",
      ["diff", "-U0", `${prev}..HEAD`, "--", "src/", ":(exclude,glob)src/**/*.test.ts"],
      { cwd: root, maxBuffer: 64 * 1024 * 1024 },
    );
    if (diff.status !== 0) {
      console.error(`${prev}..HEAD diff 를 만들 수 없다.`);
      return 2;
    }
    targets = extractTargets(diff.stdout);
    console.log(`[대상] ${prev} 이후 추가된 명령과 옵션 ${targets.length}건`);
  }

  const missing = findMissing(targets, files);
  if (missing.length > 0) {
    console.error("[누락] README.md 와 skills/ 에 없는 대상:");
    for (const t of missing) console.error(`  ${t}`);
    return 1;
  }
  console.log("[통과] 모든 대상이 문서에 있다.");
  return 0;
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exit(main());
}
