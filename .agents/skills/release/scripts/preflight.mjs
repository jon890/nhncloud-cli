#!/usr/bin/env node
// 릴리스 전에 공개 정보, 타입, 테스트, 빌드, 패키지 산출물을 차례로 검사한다.
//
// 근거: docs/adr/041-release-publish-local-ci-verify.md
// 사용법: node .agents/skills/release/scripts/preflight.mjs
// 종료 코드: 0 전부 통과, 1 하나 이상 실패, 2 저장소 루트나 package.json,
// scripts/check-pii.mjs 가 없음
// 한 검사가 실패해도 나머지를 계속 돌리고, 실패한 검사 이름을 마지막에 stderr 로 모아 낸다.
// package.json 과 빌드된 CLI 버전의 일치는 `pnpm run verify:package` 가 확인한다.

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { repoRoot, run } from "./lib.mjs";

export const CHECKS = [
  { name: "공개 정보 검사", cmd: "node", args: ["scripts/check-pii.mjs"] },
  { name: "타입 검사", cmd: "pnpm", args: ["exec", "tsc", "--noEmit"] },
  { name: "테스트", cmd: "pnpm", args: ["test"] },
  { name: "빌드", cmd: "pnpm", args: ["run", "build"] },
  { name: "패키지 산출물 검증", cmd: "pnpm", args: ["run", "verify:package"] },
];

function main() {
  const root = repoRoot();
  if (!root || !existsSync(join(root, "package.json")) || !existsSync(join(root, "scripts/check-pii.mjs"))) {
    console.error("저장소 루트, package.json, scripts/check-pii.mjs 중 하나를 찾을 수 없다.");
    return 2;
  }
  const failed = [];
  for (const check of CHECKS) {
    console.log(`[검사] ${check.name}: ${check.cmd} ${check.args.join(" ")}`);
    const r = run(check.cmd, check.args, { cwd: root, stdio: "inherit" });
    if (r.status !== 0) failed.push(check.name);
  }
  if (failed.length > 0) {
    console.error(`[실패] ${failed.join(", ")}`);
    return 1;
  }
  console.log("[통과] 모든 사전 점검을 통과했다.");
  return 0;
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exit(main());
}
