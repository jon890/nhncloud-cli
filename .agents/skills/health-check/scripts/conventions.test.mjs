import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspect, renderMarkdown } from "./conventions.mjs";

const roots = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop(), { recursive: true, force: true });
});

function sample(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "conventions-test-"));
  roots.push(root);
  const files = {
    "package.json": JSON.stringify({ engines: { node: ">=20" } }),
    "tsup.config.ts": 'export default { target: "node20" };\n',
    ".github/workflows/ci.yml": 'env:\n  NODE_VERSION: "20"\n',
    "src/index.ts": "process.exit(1);\n",
    ...overrides,
  };
  for (const [rel, content] of Object.entries(files)) {
    if (content === null) continue;
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

const count = (rules, id) => rules.find((r) => r.id === id).count;

describe("inspect", () => {
  it("주석은 세지 않고 실제 위반만 센다", () => {
    const root = sample({
      "src/commands/run.ts": [
        "// process.exit(1);",
        "// fetch('x');",
        "// throw new Error('a');",
        "/*",
        "process.exit(2);",
        "*/",
        "process.exit (1);",
        'globalThis.fetch ("a");',
        'throw new Error("b");',
        "throw new NhnCloudCliError(",
        '  "x",',
        "  3,",
        ");",
        'throw new NhnCloudCliError("y", EXIT_PARAM_ERROR);',
        "",
      ].join("\n"),
      "src/commands/local.ts": "async function load(fetch: () => Promise<void>) { await fetch(); }\n",
      "src/config/files.ts": [
        'import { writeFile, appendFile } from "node:fs/promises";',
        "await writeFile(",
        "  target,",
        "  data,",
        "  { mode: 0o600 },",
        ");",
        "appendFile(target, data);",
        "",
      ].join("\n"),
    });
    const rules = inspect(root);
    expect(count(rules, "process-exit")).toBe(1);
    expect(count(rules, "raw-fetch")).toBe(1);
    expect(count(rules, "plain-error")).toBe(1);
    expect(count(rules, "exit-code-literal")).toBe(1);
    expect(count(rules, "sensitive-write-mode")).toBe(1);
    expect(count(rules, "node-version-alignment")).toBe(0);
    expect(rules.find((r) => r.id === "sensitive-write-mode").hits[0].at).toBe("src/config/files.ts:7");
  });

  it("command-tests 는 같은 디렉터리 테스트가 import 하지 않는 명령 파일만 센다", () => {
    const root = sample({
      "src/commands/a.ts": "export const a = 1;\n",
      "src/commands/b.ts": "export const b = 1;\n",
      "src/commands/index.ts": "export {};\n",
      "src/commands/a.test.ts": 'import { x } from "./a.js";\n',
      "src/commands/x.test-helper.ts": "export {};\n",
    });
    const rule = inspect(root).find((r) => r.id === "command-tests");
    expect(rule.hits.map((h) => h.at)).toEqual(["src/commands/b.ts"]);
    expect(rule.title).toContain("2");
  });

  it("large-files 는 400줄 이상을 줄 수 내림차순으로 낸다", () => {
    const root = sample({
      "src/big.ts": "x\n".repeat(399),
      "src/bigger.ts": "x\n".repeat(499),
    });
    const rule = inspect(root).find((r) => r.id === "large-files");
    expect(rule.hits).toEqual([
      { at: "src/bigger.ts", line: "500줄" },
      { at: "src/big.ts", line: "400줄" },
    ]);
  });

  it("node-version-alignment 는 읽지 못한 값마다 1건을 센다", () => {
    const root = sample({
      "package.json": "{}",
      "tsup.config.ts": "export default {};\n",
      ".github/workflows/ci.yml": "node-version: ${{ env.NODE_VERSION }}\n",
    });
    expect(count(inspect(root), "node-version-alignment")).toBe(3);
  });

  it("node-version-alignment 는 숫자 없는 node-version 줄을 무시한다", () => {
    const root = sample({
      ".github/workflows/ci.yml": 'env:\n  NODE_VERSION: "20"\njobs:\n  with:\n    node-version: ${{ env.NODE_VERSION }}\n',
    });
    expect(count(inspect(root), "node-version-alignment")).toBe(0);
  });

  it("node-version-alignment 는 워크플로가 engines 와 다르면 1건을 센다", () => {
    const root = sample({ ".github/workflows/ci.yml": 'env:\n  NODE_VERSION: "22"\n' });
    expect(count(inspect(root), "node-version-alignment")).toBe(1);
  });

  it("필수 파일이 없으면 던진다", () => {
    const root = mkdtempSync(join(tmpdir(), "conventions-test-"));
    roots.push(root);
    expect(() => inspect(root)).toThrow();
  });
});

describe("renderMarkdown", () => {
  it("제목과 건수가 있는 규칙의 절을 낸다", () => {
    const root = sample({ "src/commands/run.ts": "process.exit(1);\n" });
    const md = renderMarkdown(inspect(root));
    expect(md).toContain("# 규약 검사");
    expect(md).toContain("## process-exit");
    expect(md).toContain("src/commands/run.ts:1");
  });
});
