#!/usr/bin/env node
// 게시한 릴리스가 태그, GitHub Release, npm 에 모두 반영됐는지 확인한다. 읽기 전용이다.
//
// 근거: docs/adr/041-release-publish-local-ci-verify.md
// 사용법: node .agents/skills/release/scripts/verify-release.mjs <버전> [--no-wait]
//   버전은 `0.19.0` 이나 `v0.19.0`.
// 종료 코드: 0 전부 통과, 1 하나 이상 실패, 2 인자 없음이나 저장소 루트 없음
// 확인 항목: 로컬 태그, origin 태그, GitHub Release(draft 아님, 본문에 escape 잔재 없음),
// npm 최신 버전.
// npm 반영은 15초 간격으로 최대 10분 기다린다. `--no-wait` 은 한 번만 묻는다.
// escape 잔재는 백틱이나 `$` 바로 앞에 백슬래시가 있는 줄이다. 코드 블록의 줄 연속
// 백슬래시는 정상이라 세지 않는다.

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { repoRoot, run } from "./lib.mjs";

const POLL_MS = 15_000;
const MAX_WAIT_MS = 10 * 60_000;
const ESCAPE_RE = /\\[`$]/;

export function countEscapeResidue(body) {
  return body.split("\n").filter((line) => ESCAPE_RE.test(line)).length;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = process.argv.slice(2);
  const noWait = args.includes("--no-wait");
  const version = args.find((a) => !a.startsWith("--"))?.replace(/^v/, "");
  if (!version) {
    console.error("사용법: verify-release.mjs <버전> [--no-wait]");
    return 2;
  }
  const root = repoRoot();
  if (!root) {
    console.error("git 저장소 안에서 실행해야 한다.");
    return 2;
  }
  const tag = `v${version}`;
  const name = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).name;
  const failed = [];
  const check = (label, ok, detail = "") => {
    console.log(`[${ok ? "통과" : "실패"}] ${label}${detail ? `: ${detail}` : ""}`);
    if (!ok) failed.push(label);
  };

  const local = run("git", ["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`], { cwd: root });
  check("로컬 태그", local.status === 0, tag);

  const remote = run("git", ["ls-remote", "--tags", "origin", `refs/tags/${tag}`], { cwd: root });
  check("origin 태그", remote.status === 0 && remote.stdout.trim() !== "", tag);

  const rel = run("gh", ["release", "view", tag, "--json", "isDraft,body"], { cwd: root });
  if (rel.status !== 0) {
    check("GitHub Release", false, "조회 실패");
  } else {
    const info = JSON.parse(rel.stdout);
    check("GitHub Release 가 draft 아님", info.isDraft === false);
    const residue = countEscapeResidue(info.body ?? "");
    check("Release 본문 escape 잔재 없음", residue === 0, `${residue}줄`);
  }

  const deadline = Date.now() + MAX_WAIT_MS;
  let latest = "";
  for (;;) {
    const npm = run("npm", ["view", name, "version", "--prefer-online"], { cwd: root });
    latest = npm.status === 0 ? npm.stdout.trim() : "";
    if (latest === version || noWait || Date.now() >= deadline) break;
    console.log(`[대기] npm 최신 ${latest || "조회 실패"}, ${POLL_MS / 1000}초 뒤 다시 확인`);
    await sleep(POLL_MS);
  }
  check("npm 최신 버전", latest === version, `${name}@${latest || "조회 실패"}`);

  return failed.length > 0 ? 1 : 0;
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exit(await main());
}
