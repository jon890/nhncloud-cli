// 저장소 규약 검사. 정적으로 판정할 수 있는 코드 규칙을 세어 등급이 붙은 표로 낸다.
//
// 사용법: node .agents/skills/health-check/scripts/conventions.mjs [--json]
//
// 등급: error 는 종료 코드 1 에 넣고, warn 과 info 는 종료 코드에 넣지 않는다.
// 규칙의 근거는 AGENTS.md 의 「코드 경계와 규칙」 절과 docs/code-architecture.md 다.
// 새 규칙은 사람이 읽는 문장으로 따로 남기지 않고, 이 파일에 검사 함수와
// conventions.test.mjs 의 표본으로 더한다.
//
// 종료 코드: 0 error 없음, 1 error 하나 이상, 2 필요한 파일을 찾지 못했거나 읽지 못함.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { enterRepoRoot } from "./lib.mjs";

const TEST_FILE = /\.test(?:-helper)?\.ts$/;
const LARGE_FILE_LINES = 400;
const INFO_LIST_LIMIT = 15;
const WRITE_CALL = /\b(?:writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream)\s*\(/g;

function posix(p) {
  return p.split(sep).join("/");
}

function listTsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTsFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".ts")) out.push(full);
  }
  return out.sort();
}

// 주석 줄(`//` 시작, `/* */` 블록 안)을 빈 줄로 바꿔 줄 번호를 유지한다.
function blankComments(text) {
  let inBlock = false;
  return text
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (inBlock) {
        if (t.includes("*/")) inBlock = false;
        return "";
      }
      if (t.startsWith("//")) return "";
      if (t.startsWith("/*")) {
        if (!t.includes("*/", 2)) inBlock = true;
        return "";
      }
      return line;
    })
    .join("\n");
}

// start 위치의 여는 괄호부터 짝이 맞는 닫는 괄호까지의 끝 인덱스를 돌려준다. 문자열 리터럴 안의 괄호는 세지 않는다.
function matchParen(text, open) {
  let depth = 0;
  let quote = null;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return i;
  }
  return -1;
}

function lineOf(text, index) {
  let n = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

function calls(text, pattern) {
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  const out = [];
  let m;
  while ((m = re.exec(text))) {
    const open = m.index + m[0].length - 1;
    const end = matchParen(text, open);
    if (end === -1) continue;
    out.push({ line: lineOf(text, m.index), text: text.slice(m.index, end + 1) });
  }
  return out;
}

function firstNumber(text) {
  const m = /(\d+)/.exec(String(text ?? ""));
  return m ? Number(m[1]) : null;
}

function rule(id, level, title, hits, hint) {
  return { id, level, title, count: hits.length, hits, hint };
}

function inspectNodeVersions(root) {
  const hits = [];
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const engines = firstNumber(pkg.engines?.node);
  if (engines === null) hits.push({ at: "package.json", line: "engines.node 를 읽지 못했다" });

  const tsup = readFileSync(join(root, "tsup.config.ts"), "utf8");
  const targetMatch = /target\s*:\s*["']node(\d+)["']/.exec(tsup);
  const target = targetMatch ? Number(targetMatch[1]) : null;
  if (target === null) hits.push({ at: "tsup.config.ts", line: "target 을 읽지 못했다" });

  if (engines !== null && target !== null && engines !== target) {
    hits.push({ at: "tsup.config.ts", line: `target node${target} 가 engines.node 의 ${engines} 와 다르다` });
  }

  const workflows = new Set();
  const wfDir = join(root, ".github", "workflows");
  if (existsSync(wfDir)) {
    for (const name of readdirSync(wfDir).filter((n) => n.endsWith(".yml")).sort()) {
      for (const raw of readFileSync(join(wfDir, name), "utf8").split("\n")) {
        const t = raw.trim();
        if (!t.startsWith("NODE_VERSION:") && !t.startsWith("node-version:")) continue;
        const n = firstNumber(t.slice(t.indexOf(":") + 1));
        if (n !== null) workflows.add(n);
      }
    }
  }
  if (workflows.size === 0 || (engines !== null && !workflows.has(engines))) {
    hits.push({
      at: ".github/workflows",
      line: `워크플로 Node 버전 {${[...workflows].join(", ")}} 이 engines.node 의 ${engines ?? "?"} 를 포함하지 않는다`,
    });
  }
  return hits;
}

export function inspect(root) {
  for (const required of ["package.json", "src/index.ts", "tsup.config.ts"]) {
    if (!existsSync(join(root, required))) throw new Error(`${required} 를 찾을 수 없다: ${root}`);
  }

  const files = listTsFiles(join(root, "src")).map((full) => {
    const rel = posix(relative(root, full));
    const text = readFileSync(full, "utf8");
    return { rel, text, code: blankComments(text), isTest: TEST_FILE.test(rel), lines: text.split("\n").length };
  });
  const ops = files.filter((f) => !f.isTest);

  const lineHits = (list, pattern, skip = () => false) => {
    const hits = [];
    for (const f of list) {
      if (skip(f)) continue;
      f.code.split("\n").forEach((line, i) => {
        if (pattern.test(line)) hits.push({ at: `${f.rel}:${i + 1}`, line: line.trim() });
      });
    }
    return hits;
  };

  const processExit = lineHits(ops, /\bprocess\.exit\s*\(/, (f) => f.rel === "src/index.ts");
  const rawFetch = lineHits(
    ops,
    /(?:^|[^.\w])(?:globalThis\.)?fetch\s*\(/,
    (f) => /\bfetch\s*:/.test(f.code) || /\b(?:function|const|let|var)\s+fetch\b/.test(f.code),
  );
  const plainError = lineHits(ops, /\bthrow\s+(?:new\s+)?Error\s*\(/);

  const exitLiteral = [];
  for (const f of ops) {
    for (const c of calls(f.code, /new\s+NhnCloudCliError\s*\(/)) {
      if (/,\s*\d+\s*,?\s*\)$/.test(c.text)) exitLiteral.push({ at: `${f.rel}:${c.line}`, line: c.text.replace(/\s+/g, " ") });
    }
  }

  const sensitive = [];
  for (const f of ops.filter((x) => x.rel.startsWith("src/config/") || x.rel.startsWith("src/cache/"))) {
    for (const c of calls(f.code, WRITE_CALL)) {
      if (!/\bmode\s*:/.test(c.text)) sensitive.push({ at: `${f.rel}:${c.line}`, line: c.text.split("\n")[0].trim() });
    }
  }

  const commandFiles = ops.filter((f) => f.rel.startsWith("src/commands/") && !f.rel.endsWith("/index.ts"));
  const untested = commandFiles
    .filter((f) => {
      const dir = dirname(f.rel);
      const stem = f.rel.slice(dir.length + 1, -".ts".length);
      const tests = files.filter((t) => t.isTest && dirname(t.rel) === dir);
      return !tests.some((t) => t.text.includes(`from "./${stem}.js"`) || t.text.includes(`from "./${stem}"`));
    })
    .map((f) => ({ at: f.rel, line: "" }));

  const large = ops
    .filter((f) => f.lines >= LARGE_FILE_LINES)
    .sort((a, b) => b.lines - a.lines || a.rel.localeCompare(b.rel))
    .map((f) => ({ at: f.rel, line: `${f.lines}줄` }));

  return [
    rule("process-exit", "error", "src/index.ts 밖의 process.exit 호출", processExit, "NhnCloudCliError 를 던지고 종료는 src/index.ts 에 맡긴다."),
    rule("raw-fetch", "warn", "전역 fetch 호출", rawFetch, "HTTP 클라이언트는 ky 만 쓴다."),
    rule("plain-error", "warn", "NhnCloudCliError 가 아닌 Error 를 던지는 곳", plainError, "사용자 오류는 NhnCloudCliError(message, exitCode) 로 던진다."),
    rule("exit-code-literal", "error", "NhnCloudCliError 의 종료 코드 숫자 리터럴", exitLiteral, "src/utils/exit-codes.ts 의 상수를 쓴다."),
    rule("sensitive-write-mode", "error", "mode 없이 파일을 쓰는 config, cache 코드", sensitive, "자격증명 파일 권한 0600 을 mode 로 준다."),
    rule("node-version-alignment", "warn", "Node 버전 선언 불일치", inspectNodeVersions(root), "engines.node, tsup target, 워크플로 NODE_VERSION 의 메이저를 맞춘다."),
    rule("command-tests", "info", `같은 디렉터리 테스트가 import 하지 않는 명령 파일 (전체 명령 파일 ${commandFiles.length}개)`, untested, "명령 파일마다 같은 디렉터리의 테스트가 import 하는지 본다."),
    rule("large-files", "info", `${LARGE_FILE_LINES}줄 이상 운영 파일`, large, "분리 후보다."),
  ];
}

export function renderMarkdown(rules) {
  const out = ["# 규약 검사", "", "| 규칙 | 등급 | 건수 | 대응 |", "|---|---|---|---|"];
  for (const r of rules) out.push(`| \`${r.id}\` | ${r.level} | ${r.count} | ${r.hint} |`);
  for (const r of rules) {
    if (r.count === 0) continue;
    const fmt = (h) => `- \`${h.at}\`${h.line ? ` ${h.line}` : ""}`;
    if (r.level === "info") {
      out.push("", `## ${r.id} (${r.count}건)`, "", r.title, "");
      out.push(...r.hits.slice(0, INFO_LIST_LIMIT).map(fmt));
      if (r.count > INFO_LIST_LIMIT) out.push(`외 ${r.count - INFO_LIST_LIMIT}건. 전체는 --json`);
    } else {
      out.push("", `## ${r.id}`, "", r.title, "", ...r.hits.map(fmt));
    }
  }
  return out.join("\n");
}

export function main(argv = process.argv.slice(2)) {
  try {
    const root = enterRepoRoot();
    if (!statSync(root).isDirectory()) throw new Error(`저장소 루트가 디렉터리가 아니다: ${root}`);
    const rules = inspect(root);
    console.log(argv.includes("--json") ? JSON.stringify({ rules }, null, 2) : renderMarkdown(rules));
    return rules.filter((r) => r.level === "error").reduce((n, r) => n + r.count, 0) > 0 ? 1 : 0;
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    return 2;
  }
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exit(main());
}
