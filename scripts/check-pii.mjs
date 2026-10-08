#!/usr/bin/env node
// 공개 저장소에 사내 도메인과 비밀값이 들어갔는지 검사한다.
//
// 정책과 대체 표기는 AGENTS.md 「공개 저장소 정보 보호」 가 소유한다.
// 허용 도메인 목록은 이 파일이 소유한다.
//
// 사용법: node scripts/check-pii.mjs   (cwd 는 저장소 루트)
// 종료 코드: 0 통과, 1 위반 발견, 2 필수 검사 경로를 읽을 수 없음
// 위반은 `[위반] <설명>` 머리 아래에 `파일:줄:값` 줄로 stdout 에 낸다.
// 비밀값은 키 이름만 남기고 값을 `***` 로 가린다. CI 로그가 공개되기 때문이다.
// `SCAN` 은 없으면 종료 코드 2 이고, `OPTIONAL_SCAN` 은 없으면 건너뛴다.

import { access, readdir, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// CLAUDE.md 는 AGENTS.md 를 가리키는 심볼릭 링크라 따로 넣지 않는다.
export const SCAN = [
  "README.md",
  "skills/",
  "docs/",
  "AGENTS.md",
  "src/",
  ".agents/",
  ".claude/",
  ".github/",
  "scripts/",
];

// `tasks/` 는 계획이 끝나면 비는 작업 공간이라 없는 것이 정상이다.
export const OPTIONAL_SCAN = ["tasks/"];

// 호스트가 이 값과 같거나, 이 값 앞에 `.` 을 붙인 문자열로 끝나면 허용한다.
export const OK_DOMAIN_SUFFIXES = [
  "nhncloud.com",
  "gov-nhncloud.com",
  "nhncloudservice.com",
  "gov-nhncloudservice.com",
  "example.com",
];

// 호스트가 이 값과 정확히 같을 때만 허용한다.
// alpha 호스트는 ADR-024, ADR-036 이 링크한 공개 명세 주소라 접미사로 열지 않는다.
export const OK_DOMAINS = [
  "github.com",
  "npmjs.com",
  "www.npmjs.com",
  "anthropic.com",
  "openai.com",
  "claude.com",
  "api-lncs-search.alpha-nhncloudservice.com",
];

const SKIP_DIRS = new Set([".git", "node_modules", "dist", "worktrees"]);
const DOMAIN_PATTERN = /(https?:\/\/|@)([A-Za-z0-9.-]+\.(?:com|co\.kr|net)[A-Za-z0-9.-]*)/g;
const SECRET_PATTERN = /(secret|password|appkey)['"]?[ \t]*[:=][ \t]*['"][A-Za-z0-9]{16,}/g;

export async function walkFiles(roots, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const skipDirs = options.skipDirs ?? SKIP_DIRS;
  const optionalRoots = new Set(options.optionalRoots ?? []);
  const files = [];

  for (const root of roots) {
    const absoluteRoot = resolve(cwd, root);

    if (optionalRoots.has(root)) {
      try {
        await access(absoluteRoot, constants.R_OK);
      } catch {
        continue;
      }
    } else {
      await access(absoluteRoot, constants.R_OK);
    }

    await collectFiles(absoluteRoot, files, skipDirs);
  }

  return files.sort();
}

async function collectFiles(path, files, skipDirs) {
  const entryStat = await stat(path);

  if (entryStat.isDirectory()) {
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory() && skipDirs.has(entry.name)) {
        continue;
      }
      await collectFiles(resolve(path, entry.name), files, skipDirs);
    }
    return;
  }

  if (entryStat.isFile()) {
    files.push(path);
  }
}

export function findForeignDomains(text, { exact, suffixes }) {
  const exactSet = new Set(exact);
  const matches = [];

  // https:// 또는 @ 접두를 요구해 코드의 property 접근(.com/.net)을 배제한다.
  // 허용 여부는 호스트 경계로 비교한다. 부분 문자열로 비교하면
  // 허용 도메인 앞뒤에 글자를 붙인 주소가 그대로 통과한다.
  for (const match of text.matchAll(DOMAIN_PATTERN)) {
    const host = match[2].toLowerCase().replace(/\.+$/, "");
    const allowed =
      exactSet.has(host) || suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
    if (!allowed) {
      matches.push(match[0]);
    }
  }

  return matches;
}

export function findSecrets(text) {
  return Array.from(text.matchAll(SECRET_PATTERN), (match) => `${match[1]}=***`);
}

function collectLineMatches(text, filePath, cwd, finder) {
  const hits = [];

  for (const [index, line] of text.split(/\r?\n/).entries()) {
    for (const match of finder(line)) {
      hits.push(`${relativePath(filePath, cwd)}:${index + 1}:${match}`);
    }
  }

  return hits;
}

function relativePath(filePath, cwd) {
  return filePath.startsWith(`${cwd}/`) ? filePath.slice(cwd.length + 1) : filePath;
}

function report(failures, message, matches) {
  if (matches.length === 0) {
    return;
  }

  failures.push(`\n[위반] ${message}\n${matches.join("\n")}`);
}

export async function main(options = {}) {
  const cwd = options.cwd ?? process.cwd();

  let files;
  try {
    files = await walkFiles([...SCAN, ...OPTIONAL_SCAN], { cwd, optionalRoots: OPTIONAL_SCAN });
  } catch (error) {
    console.error(`공개 정보 검사 실패: 필수 검사 경로를 읽을 수 없다: ${error.message}`);
    return 2;
  }

  const domainMatches = [];
  const secretMatches = [];
  try {
    for (const file of files) {
      const text = await readFile(file, "utf8");
      domainMatches.push(
        ...collectLineMatches(text, file, cwd, (line) =>
          findForeignDomains(line, { exact: OK_DOMAINS, suffixes: OK_DOMAIN_SUFFIXES }),
        ),
      );
      secretMatches.push(...collectLineMatches(text, file, cwd, findSecrets));
    }
  } catch (error) {
    console.error(`공개 정보 검사 실패: 파일을 읽을 수 없다: ${error.message}`);
    return 2;
  }

  const failures = [];
  report(
    failures,
    "허용 목록 밖 도메인: placeholder 로 바꾸거나 이 스크립트의 OK_DOMAINS 를 검토한다",
    domainMatches,
  );
  report(failures, "비밀값처럼 보이는 문자열: <secret> 같은 placeholder 로 바꾼다", secretMatches);

  if (failures.length > 0) {
    console.log(failures.join("\n"));
    return 1;
  }

  console.log("공개 정보 검사 통과");
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
