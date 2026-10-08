# Phase 01. 공용 helper 와 의존성 측정 스크립트

**Execution profile**: standard

## 목표

`pnpm outdated` 와 `pnpm audit` 결과를 읽어 범위 안 갱신과 메이저 갱신, 런타임 경로와 개발 도구 경로의 취약점을 나눈 Markdown 표를 내는 스크립트를 만든다.
health-check 스킬 1단계의 측정이 사람의 해석 없이 같은 표를 내게 하기 위해서다.

**범위 외**: 갱신 시험(phase 02), 규약 검사(phase 03), `SKILL.md` 와 references(phase 04).
실제 의존성 버전은 이 plan 에서 바꾸지 않는다. `package.json` 과 `pnpm-lock.yaml` 을 커밋하지 않는다.

## 컨텍스트

- 내부 스킬은 `.agents/skills/<이름>/` 에 둔다. `.claude/skills` 는 `.agents/skills` 로 가는 심볼릭 링크다.
- 따를 기존 패턴은 `.agents/skills/release/scripts/` 다.
  - `doc-sync-check.mjs` 와 `preflight.mjs` 는 함수를 `export` 하고, 파일 끝의 `if (fileURLToPath(import.meta.url) === resolve(process.argv[1])) { process.exit(main()); }` 로 직접 실행할 때만 `main()` 을 돈다. 테스트는 그 함수를 import 한다.
  - `release-scripts.test.mjs` 는 vitest 의 `describe`, `it`, `expect` 를 쓴다.
- `vitest.config.ts` 의 `include` 에 `.agents/skills/**/scripts/*.test.mjs` 가 이미 있다. 설정을 고치지 않는다.
- `package.json` 의 `packageManager` 는 `pnpm@11.18.0` 이다.
- 이 스킬은 `release` 스킬의 `scripts/lib.mjs` 를 import 하지 않는다. 스킬마다 독립해 지우거나 옮길 수 있게 하기 위해서다.
- 계획 시점(2026-10-08)에 pnpm 11.18.0 으로 실측한 출력 형태다. 테스트 입력은 이 형태를 따른다.
  - `pnpm outdated --format json`: 낡은 것이 있으면 종료 코드 1. 패키지 이름을 키로 `{ current, latest, wanted, isDeprecated, dependencyType }` 를 담은 객체다. `dependencyType` 은 `"dependencies"` 나 `"devDependencies"` 다. `wanted` 는 lockfile 기준이라 `current` 와 같게 나온다.
  - `pnpm audit --json`: 취약점이 있으면 종료 코드 1. 최상위 키는 `advisories` 와 `metadata` 다. `metadata.vulnerabilities` 는 `{ info, low, moderate, high, critical }` 건수다. advisory 마다 `module_name`, `severity`, `github_advisory_id`, `title`, `url`, `patched_versions`, `findings[]` 가 있고, finding 은 `{ version, dev, paths[] }` 다. path 는 `.>vitest>vite>postcss` 처럼 `>` 로 이어진다.

**근거 문서**: `docs/code-architecture.md` 의 「공개 스킬 관리」 절

## 의도 메모

- 범위 안과 메이저 구분은 `wanted` 가 아니라 `current` 와 `latest` 의 메이저 숫자 비교로 정한다. `wanted` 가 lockfile 기준이라 범위 안 갱신이 있어도 `current` 와 같게 나오기 때문이다.
- `pnpm --version` 의 메이저가 `packageManager` 의 메이저와 다르면 종료 코드 2 로 멈춘다. 다른 메이저의 pnpm 은 lockfile 을 다른 형식으로 다시 쓰거나 `outdated` 와 `audit` 출력 형식이 달라 측정이 틀어질 수 있다.
- Windows 셸 처리는 넣지 않는다. 이 저장소의 `release` 스크립트도 셸 없이 spawn 한다.

## 작업 항목

### 1. `.agents/skills/health-check/scripts/lib.mjs` 신규

머리 주석에 이 파일이 health-check 스크립트의 공용 helper 라는 것만 적는다. 다음을 `export` 한다.

| 이름 | 시그니처 | 동작 |
|---|---|---|
| `run` | `run(cmd, args = [], opts = {})` | `spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts })`. 반환은 `{ status: r.status ?? -1, signal: r.signal ?? null, stdout: r.stdout ?? "", stderr: r.stderr ?? "", error: r.error }` |
| `repoRoot` | `repoRoot(cwd = process.cwd())` | `git rev-parse --show-toplevel` 의 결과. 실패하면 `null` |
| `mainCheckoutRoot` | `mainCheckoutRoot(cwd = process.cwd())` | `git rev-parse --path-format=absolute --git-common-dir` 의 결과의 `dirname`. linked worktree 안에서 불러도 메인 checkout 경로를 낸다. 실패하면 `null` |
| `enterRepoRoot` | `enterRepoRoot()` | `repoRoot()` 로 `process.chdir` 하고 경로를 돌려준다. 못 찾으면 stderr 에 `git 저장소 안에서 실행한다.` 를 쓰고 `process.exit(2)` |
| `parseJsonOrNull` | `parseJsonOrNull(text)` | `JSON.parse` 실패 시 `null` |
| `majorOf` | `majorOf(version)` | 앞자리 숫자. 없으면 `null` |
| `checkPnpmMajor` | `checkPnpmMajor(packageManager, pnpmVersion)` | 메이저가 같으면 `null`. `packageManager` 가 `pnpm@` 로 시작하지 않거나 메이저가 다르면 이유를 담은 한국어 문자열 |
| `parseAuditReport` | `parseAuditReport(text)` | JSON 이 아니거나 `error` 키가 있거나 `metadata.vulnerabilities` 가 객체가 아니면 `null`. 아니면 파싱한 객체 |
| `classifyAdvisories` | `classifyAdvisories(audit, pkg)` | advisory 마다 `{ id, module, severity, title, installed, patched, scope, via, direct, url }`. `id` 는 `github_advisory_id ?? String(id)`, `installed` 는 finding version 을 중복 없이 `", "` 로 이은 것, `scope` 는 finding 하나라도 `dev === false` 면 `"runtime"` 아니면 `"dev"`, `via` 는 각 path 를 `>` 로 나눈 두 번째 조각의 중복 없는 배열, `direct` 는 `module` 이 `pkg.dependencies` 나 `pkg.devDependencies` 키에 있는지. 정렬은 runtime 먼저, 그다음 등급(critical, high, moderate, low, info 순), 그다음 module 이름 |
| `classifyOutdated` | `classifyOutdated(raw)` | 항목마다 `{ name, type, current, wanted, latest, deprecated, kind }`. `type` 은 `dependencyType === "devDependencies"` 면 `"dev"` 아니면 `"runtime"`, `deprecated` 는 `Boolean(isDeprecated)`, `kind` 는 두 메이저를 모두 읽었고 latest 쪽이 크면 `"major"` 아니면 `"in-range"` |

### 2. `.agents/skills/health-check/scripts/deps-report.mjs` 신규

머리 주석에 사용법(`node .agents/skills/health-check/scripts/deps-report.mjs [--json]`), 출력하는 것, 종료 코드(0 낡은 것도 취약점도 없음, 1 하나 이상 있음, 2 저장소 root 나 pnpm 을 찾지 못했거나 pnpm 버전이 맞지 않거나 pnpm 출력을 읽지 못함)를 적는다.

- `export function buildResult(pkg, outdatedRaw, audit)` 는 `{ engines, outdated, advisories, summary }` 를 돌려준다. `summary` 는 `{ outdatedInRange, outdatedMajor, deprecated, runtimeAdvisories, devAdvisories, bySeverity }` 이고 `bySeverity` 는 `audit.metadata.vulnerabilities` 다.
- `export function renderMarkdown(result)` 는 문자열을 돌려준다. 제목은 `# 의존성 측정`, 요약 목록 네 줄(범위 안과 메이저와 deprecated 개수, 런타임과 개발 경로 취약점 건수, 0보다 큰 등급별 건수나 `없음`, `engines.node`), 낡은 것이 있으면 `## 낡은 의존성` 표(열: 패키지, 구분, 현재, 최신, 갱신 종류. 갱신 종류는 `메이저` 나 `범위 안`), advisory 가 있으면 `## 취약점` 표(열: 경로, 등급, 패키지, 설치, 수정, 거쳐 오는 직접 의존성, 내용. 경로는 `런타임` 이나 `개발`, 내용의 `|` 는 `\|` 로 이스케이프)다.
- `main()` 순서: `enterRepoRoot()`, `package.json` 읽기, `run("pnpm", ["--version"])` 결과를 `checkPnpmMajor` 로 확인해 메시지가 있으면 stderr 출력 후 2, `pnpm outdated --format json`(종료 코드 0 과 1 만 정상, 빈 stdout 은 `{}`), `pnpm audit --json` 을 `parseAuditReport` 로 읽기(null 이면 2), `--json` 이면 `JSON.stringify(result, null, 2)` 아니면 `renderMarkdown` 을 stdout 에. 반환값은 낡은 것과 advisory 합이 0 보다 크면 1 아니면 0. 예외는 stderr 에 이유를 쓰고 2.
- 파일 끝은 `release` 스크립트와 같은 직접 실행 가드로 `process.exit(main())` 한다.

### 3. 이 phase 를 검증하는 `.agents/skills/health-check/scripts/lib.test.mjs` 와 `deps-report.test.mjs`

`lib.test.mjs`:
- `classifyOutdated`: `{ commander: { current: "14.0.3", latest: "15.0.0", wanted: "14.0.3", isDeprecated: false, dependencyType: "dependencies" }, ora: { current: "9.4.0", latest: "9.4.1", wanted: "9.4.0", isDeprecated: false, dependencyType: "dependencies" }, typescript: { current: "6.0.3", latest: "7.0.2", wanted: "6.0.3", isDeprecated: false, dependencyType: "devDependencies" } }` 에서 commander 는 `kind: "major"`, `type: "runtime"`, ora 는 `kind: "in-range"`, typescript 는 `type: "dev"`, `kind: "major"`.
- `classifyAdvisories`: advisory 둘을 넣는다. 하나는 `module_name: "vite"`, finding `{ version: "8.0.14", dev: true, paths: [".>vitest>vite", ".>vitest>@vitest/mocker>vite"] }`, 다른 하나는 `module_name: "ky"`, finding `{ version: "1.14.3", dev: false, paths: [".>ky"] }` 이고 `pkg` 는 `{ dependencies: { ky: "^1.14.3" }, devDependencies: { vitest: "^4.1.5" } }` 다. 결과 첫 항목이 ky(`scope: "runtime"`, `direct: true`, `via: ["ky"]`), 둘째가 vite(`scope: "dev"`, `direct: false`, `via: ["vitest"]`) 인지 본다.
- `parseAuditReport`: 정상 객체, `{ "error": {} }`, `"not json"` 세 입력에 객체, `null`, `null`.
- `checkPnpmMajor`: `("pnpm@11.18.0", "11.2.0")` 은 `null`, `("pnpm@11.18.0", "10.0.0")` 과 `(undefined, "11.0.0")` 은 문자열.

`deps-report.test.mjs`:
- `buildResult` 와 `renderMarkdown` 에 위 표본을 넣고 출력에 `| \`commander\` | runtime | 14.0.3 | 15.0.0 | 메이저 |` 줄과 `## 취약점` 이 있는지 본다.
- 낡은 것과 advisory 가 모두 없는 입력이면 `## 낡은 의존성` 과 `## 취약점` 이 둘 다 없는지 본다.

표본 값에 사내 도메인처럼 보이는 문자열이나 16자 이상 비밀값 같은 리터럴을 쓰지 않는다. `node scripts/check-pii.mjs` 가 `.agents/` 도 검사한다. advisory `url` 은 `https://github.com/advisories/GHSA-xxxx` 같은 github 주소만 쓴다.

## 검증

```bash
pnpm exec vitest run .agents/skills/health-check/scripts/lib.test.mjs .agents/skills/health-check/scripts/deps-report.test.mjs
node .agents/skills/health-check/scripts/deps-report.mjs > /dev/null; test $? -le 1
node .agents/skills/health-check/scripts/deps-report.mjs --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);if(!Array.isArray(r.outdated)||!Array.isArray(r.advisories))process.exit(1)})'
pnpm tsc --noEmit
pnpm test
node scripts/check-pii.mjs
git diff --check
```

- 둘째 줄은 종료 코드가 0 이나 1 이어야 한다. 2 면 pnpm 실행이나 출력 읽기가 실패한 것이다.
- `git status --porcelain package.json pnpm-lock.yaml` 의 출력이 비어 있어야 한다. 측정 스크립트는 lockfile 을 바꾸지 않는다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `.agents/skills/health-check/scripts/lib.mjs` | 신규 |
| `.agents/skills/health-check/scripts/lib.test.mjs` | 신규 |
| `.agents/skills/health-check/scripts/deps-report.mjs` | 신규 |
| `.agents/skills/health-check/scripts/deps-report.test.mjs` | 신규 |
