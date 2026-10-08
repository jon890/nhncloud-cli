# Phase 03. 저장소 규약 검사 스크립트

**Execution profile**: standard

## 목표

`AGENTS.md` 의 코드 규칙 가운데 정적으로 판정할 수 있는 것을 세어 등급(error, warn, info)이 붙은 표로 내는 스크립트를 만든다.
이 저장소에는 lint 가 없어, 사람이 읽고 지키던 규칙을 health-check 1단계에서 기계로 세기 위해서다.

**범위 외**: 찾은 위반을 고치는 일. 이 phase 는 세기만 한다.

## 컨텍스트

- phase 01 이 만든 `.agents/skills/health-check/scripts/lib.mjs` 의 `enterRepoRoot` 를 쓴다.
- 직접 실행 가드와 export 패턴은 `.agents/skills/release/scripts/doc-sync-check.mjs` 끝부분을 따른다.
- 규칙의 근거는 `AGENTS.md` 「코드 경계와 규칙」 절이다.
  - `HTTP 클라이언트는 ky만 사용한다`
  - `사용자 오류는 NhnCloudCliError(message, exitCode)와 src/utils/exit-codes.ts의 종료 코드를 사용한다`
  - 자격증명 파일 권한 `0600`
- `src/utils/exit-codes.ts` 는 `EXIT_SUCCESS`, `EXIT_API_ERROR`, `EXIT_AUTH_ERROR`, `EXIT_PARAM_ERROR`, `EXIT_CONFIG_ERROR` 를 export 한다. 종료 코드 숫자 리터럴 대신 이 상수를 쓰는 것이 규약이다(`docs/pitfalls/code-review/exit-code-literal-no-constant.md`).
- 계획 시점(2026-10-08) 코드의 사실이다. 규칙을 만들 때 이 사실로 오탐을 확인한다.
  - `process.exit(` 는 `src/index.ts` 에만 있다.
  - `src/commands/skm/asymmetric-key.ts` 는 `fetch` 라는 이름의 함수 인자를 받아 `fetch(client, ...)` 로 부른다. 전역 fetch 가 아니다.
  - `src/config/credentials.ts` 와 `src/cache/token-store.ts` 의 `writeFile` 호출은 여러 줄에 걸쳐 `mode: 0o600` 을 준다.
  - `src/commands/appkey-option.test-helper.ts` 는 테스트 보조 파일이다.
  - `src/commands/deploy/commands.test.ts` 처럼 디렉터리 하나의 테스트 파일이 여러 명령 파일을 `from "./artifacts.js"` 형태로 import 한다.
  - `package.json` 의 `engines.node` 는 `>=20`, `tsup.config.ts` 의 `target` 은 `"node20"`, `.github/workflows/ci.yml` 과 `release.yml` 의 `NODE_VERSION` 은 `"20"` 이다.

**근거 문서**: `AGENTS.md` 의 「코드 경계와 규칙」 절, `docs/code-architecture.md` 의 「공개 스킬 관리」 절

## 의도 메모

- 형제 저장소의 같은 스크립트에 있던 `.gitattributes` 규칙과 무거운 라이브러리의 정적 import 규칙은 옮기지 않는다. 이 저장소의 지침에 근거가 없다.
- 새 규칙은 사람이 읽는 문장으로 남기지 않고 이 파일에 검사와 테스트 표본으로 더한다고 머리 주석에 적는다.

## 작업 항목

### 1. `.agents/skills/health-check/scripts/conventions.mjs` 신규

머리 주석에 사용법(`node .agents/skills/health-check/scripts/conventions.mjs [--json]`), 등급 뜻(error 는 종료 코드 1, warn 과 info 는 종료 코드에 넣지 않음), 규칙의 근거가 `AGENTS.md` 와 `docs/code-architecture.md` 라는 것, 종료 코드(0 error 없음, 1 error 하나 이상, 2 필요한 파일을 찾지 못했거나 읽지 못함)를 적는다.

`export function inspect(root)` 는 규칙 배열 `[{ id, level, title, count, hits: [{ at, line }], hint }]` 를 돌려준다. `at` 은 `src/path.ts:줄번호` 형식의 POSIX 경로다.
`root` 에 `package.json`, `src/index.ts`, `tsup.config.ts` 중 하나라도 없으면 `Error` 를 던진다.

파일 집합: `src/` 아래 `.ts` 전부. 테스트 파일은 `/\.test(?:-helper)?\.ts$/` 에 맞는 것이고, 나머지가 운영 파일이다.
주석 줄 제외는 `//` 로 시작하는 줄과 `/* ... */` 블록 안의 줄을 뺀다.

| id | 등급 | 대상 | 판정 |
|---|---|---|---|
| `process-exit` | error | `src/index.ts` 를 뺀 운영 파일, 주석 제외 | `/\bprocess\.exit\s*\(/` |
| `raw-fetch` | warn | 운영 파일, 주석 제외 | `/(?:^|[^.\w])(?:globalThis\.)?fetch\s*\(/`. 단 파일 안에 `/\bfetch\s*:/` 나 `/\b(?:function|const|let|var)\s+fetch\b/` 가 있으면 그 파일은 지역 이름으로 보고 건너뛴다 |
| `plain-error` | warn | 운영 파일, 주석 제외 | `/\bthrow\s+(?:new\s+)?Error\s*\(/` |
| `exit-code-literal` | error | 운영 파일 | `new NhnCloudCliError(` 마다 괄호 짝을 맞춰 호출 전체 문자열을 얻고(문자열 리터럴 안의 괄호는 세지 않는다), 그 문자열이 `/,\s*\d+\s*,?\s*\)$/` 에 맞으면 위반 |
| `sensitive-write-mode` | error | `src/config/` 와 `src/cache/` 아래 운영 파일 | `writeFile`, `writeFileSync`, `appendFile`, `appendFileSync`, `createWriteStream` 중 이름 뒤에 `\s*\(` 가 붙은 것만 호출로 본다(import 줄의 이름은 호출이 아니다). 호출마다 호출 전체 문자열에 `/\bmode\s*:/` 가 없으면 위반 |
| `node-version-alignment` | warn | `package.json`, `tsup.config.ts`, `.github/workflows/*.yml` | `engines.node` 의 첫 숫자, `tsup.config.ts` 의 `target: "nodeNN"` 숫자, 워크플로에서 `NODE_VERSION:` 이나 `node-version:` 으로 시작하는 줄의 숫자들을 읽는다. 숫자가 없는 줄(`node-version: ${{ env.NODE_VERSION }}`)은 무시한다. 읽지 못한 값(engines, target)마다 1건, target 이 engines 와 다르면 1건, 워크플로에서 읽은 숫자 집합이 비었거나 engines 값이 없으면 1건. main 에서는 engines `>=20`, target `node20`, 워크플로 숫자 집합 `{20}` 이라(`ci.yml` 과 `release.yml` 의 `node-version` 줄은 숫자가 없어 무시된다) 0건이다 |
| `command-tests` | info | `src/commands/` 아래 운영 파일 중 `index.ts` 가 아닌 것 | 같은 디렉터리의 테스트 파일 어느 것도 `from "./<stem>.js"` 나 `from "./<stem>"` 를 담지 않으면 1건. 제목에 전체 명령 파일 수를 넣는다 |
| `large-files` | info | 운영 파일 | 400줄 이상. 줄 수 내림차순, `line` 은 `N줄` |

`export function renderMarkdown(rules)` 는 `# 규약 검사` 제목, 표(열: 규칙, 등급, 건수, 대응), 건수가 있는 error 와 warn 규칙마다 `## <id>` 아래 전체 목록, info 규칙은 `## <id> (N건)` 아래 15건까지와 `외 N건. 전체는 --json` 줄을 낸다.

`main()` 은 `enterRepoRoot()` 뒤 `inspect` 를 부르고, `--json` 이면 `{ rules }` 를 JSON 으로, 아니면 `renderMarkdown` 을 stdout 에 낸다. error 등급 규칙의 count 합이 0 보다 크면 1, 아니면 0, 예외면 stderr 에 이유를 쓰고 2.

### 2. 이 phase 를 검증하는 `.agents/skills/health-check/scripts/conventions.test.mjs`

`mkdtempSync(join(tmpdir(), "conventions-test-"))` 아래 표본 저장소를 만들고 `inspect(root)` 를 직접 부른다. 테스트 끝에 `rmSync(root, { recursive: true, force: true })`.

기본 표본: `package.json`(`engines.node: ">=20"`), `tsup.config.ts`(`target: "node20"`), `.github/workflows/ci.yml`(`NODE_VERSION: "20"`), `src/index.ts`(`process.exit(1);`).

- 검출과 비검출 표본 하나: `src/commands/run.ts` 에 주석 처리된 `process.exit`, `fetch`, `throw Error` 각 한 줄과 실제 `process.exit (1);`, `globalThis.fetch ("a");`, `throw new Error("b");`, 여러 줄로 쓴 `new NhnCloudCliError(\n  "x",\n  3,\n)` 한 건과 `new NhnCloudCliError("y", EXIT_PARAM_ERROR)` 한 건을 둔다. `src/commands/local.ts` 에는 `async function load(fetch: () => Promise<void>) { await fetch(); }` 를 둔다. `src/config/files.ts` 에는 `import { writeFile, appendFile } from "node:fs/promises";` 줄(검출되면 안 된다)과 여러 줄에 걸쳐 `mode: 0o600` 을 준 `writeFile` 한 건과 mode 없는 `appendFile(path, data);` 한 건을 둔다. 기대값은 `process-exit` 1, `raw-fetch` 1, `plain-error` 1, `exit-code-literal` 1, `sensitive-write-mode` 1, `node-version-alignment` 0.
- `command-tests`: `src/commands/a.ts`, `src/commands/b.ts`, `src/commands/index.ts`, `src/commands/a.test.ts`(`import { x } from "./a.js";`), `src/commands/x.test-helper.ts` 를 두면 hits 의 `at` 목록이 `["src/commands/b.ts"]` 다.
- `node-version-alignment`: `engines` 없는 `package.json`, target 없는 `tsup.config.ts`, 숫자가 있는 버전 줄이 없는 워크플로(`node-version: ${{ env.NODE_VERSION }}` 한 줄만 있어도 같다)면 count 3. 기본 표본의 워크플로에 `node-version: ${{ env.NODE_VERSION }}` 줄을 더해도 count 0 이다.
- 필수 파일이 없는 빈 디렉터리에서 `inspect` 가 던진다.
- `renderMarkdown` 출력에 `# 규약 검사` 와 `## process-exit` 가 있다.

표본 값에 사내 도메인처럼 보이는 문자열이나 16자 이상 비밀값 같은 리터럴을 쓰지 않는다.

## 검증

```bash
pnpm exec vitest run .agents/skills/health-check/scripts/conventions.test.mjs
node .agents/skills/health-check/scripts/conventions.mjs; test $? -le 1
node .agents/skills/health-check/scripts/conventions.mjs --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=Object.fromEntries(JSON.parse(s).rules.map(x=>[x.id,x]));if(r["process-exit"].count!==0||r["raw-fetch"].count!==0||r["sensitive-write-mode"].count!==0||r["node-version-alignment"].count!==0)process.exit(1)})'
pnpm tsc --noEmit
pnpm test
node scripts/check-pii.mjs
git diff --check
```

- 셋째 줄은 컨텍스트에 적은 현재 코드의 사실로 오탐이 없는지 본다. 넷 모두 0 이어야 한다. 0 이 아니면 그 hits 를 읽어 규칙의 오탐인지 실제 위반인지 판정하고, 오탐이면 규칙과 테스트 표본을 고친다.
- 실제 저장소에서 나온 `exit-code-literal`, `plain-error`, `command-tests`, `large-files` 건수는 PR 본문에 옮긴다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `.agents/skills/health-check/scripts/conventions.mjs` | 신규 |
| `.agents/skills/health-check/scripts/conventions.test.mjs` | 신규 |
