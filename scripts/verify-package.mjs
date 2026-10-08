// 게시 전 산출물 검증.
// 사용법: 저장소 루트에서 `pnpm run build` 후 `node scripts/verify-package.mjs`
// 종료 코드: 0 통과, 1 검사 실패, 2 package.json 또는 dist/index.js 없음
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SKILL_DIR = "skills/nhncloud-cli";
const REQUIRED_FILES = ["README.md", "dist/index.js"];

export function checkVersion(expected, actual) {
  if (expected === actual) return [];
  return [`버전 불일치: package.json=${expected}, dist/index.js --version=${actual}`];
}

export function findMissingPackedFiles(tracked, packed, required = []) {
  const packedSet = new Set(packed);
  return [...tracked, ...required].filter((file) => !packedSet.has(file));
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    const reason = result.error?.message ?? `종료 코드 ${result.status}: ${result.stderr.trim()}`;
    throw new Error(`${command} ${args.join(" ")} 실패: ${reason}`);
  }
  return result.stdout;
}

function main() {
  if (!existsSync("package.json") || !existsSync("dist/index.js")) {
    console.error("package.json 또는 dist/index.js 가 없다. 저장소 루트에서 먼저 빌드한다.");
    return 2;
  }
  const failures = [];
  try {
    const { version } = JSON.parse(readFileSync("package.json", "utf8"));
    const actual = run(process.execPath, ["dist/index.js", "--version"]).trim();
    failures.push(...checkVersion(version, actual));

    const tracked = run("git", ["ls-files", SKILL_DIR]).split("\n").filter(Boolean);
    const packJson = JSON.parse(run("npm", ["pack", "--dry-run", "--json"]));
    const packed = packJson[0].files.map((file) => file.path);
    for (const missing of findMissingPackedFiles(tracked, packed, REQUIRED_FILES)) {
      failures.push(`패키지에 없는 파일: ${missing}`);
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
  for (const failure of failures) console.error(failure);
  return failures.length === 0 ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
