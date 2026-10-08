# Phase 01. 릴리스 판정 스크립트를 만든다

**Execution profile**: standard

## 목표

릴리스 스킬이 산문과 손 grep 으로 하던 세 판정을 스크립트로 만든다.

| 스크립트 | 판정 |
|---|---|
| `preflight.mjs` | 공개 정보 검사, 타입 검사, 테스트, 빌드, 패키지 산출물 검증 |
| `doc-sync-check.mjs` | 직전 태그 이후 `src/` 에 추가된 명령과 옵션이 `README.md` 나 `skills/` 에 있는가 |
| `verify-release.mjs` | 태그가 로컬과 origin 에 있고, GitHub Release 가 draft 가 아니며 본문에 escape 잔재가 없고, npm 최신 버전이 그 버전인가 |

지금 release 스킬은 문서 동기화를 사람이 고른 `KEYWORD` 로 grep 한다. 사람이 고르지 않은 명령은 검사도 통과한다.

**범위 외**: 릴리스 스킬 문서 수정(phase 02), 태그 push 워크플로(phase 03).

## 컨텍스트

- 스크립트는 내부 스킬 디렉터리 `.agents/skills/release/scripts/` 에 둔다. `.claude/skills` 는 `.agents/skills` 로 가는 심볼릭 링크다.
- 형제 프로젝트 dooray-cli 의 같은 스크립트가 본보기다: <https://github.com/jon890/dooray-cli/tree/main/.claude/skills/release/scripts> (`lib.mjs`, `preflight.mjs`, `doc-sync-check.mjs`, `verify-release.mjs`). 구조를 따르되 아래 의도 메모의 차이를 지킨다.
- 이 저장소의 검사 명령
  - 공개 정보 검사: `node scripts/check-pii.mjs`
  - 패키지 산출물 검증: `pnpm run verify:package`
  - 타입 검사, 테스트, 빌드: `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm run build`
- 패키지 이름은 `package.json` 의 `name` 에서 읽는다(`@bifos/nhncloud-cli`). 하드코딩하지 않는다.
- `vitest.config.ts` 의 `test.include` 는 `src/**/*.test.ts` 와 `scripts/**/*.test.mjs` 를 담는다.
- `docs/code-architecture.md` 「테스트와 빌드」 절에는 plan6 머지 뒤 「`scripts/*.test.mjs`도 vitest가 실행한다」 문장이 있다.

**근거 문서**: `docs/adr/041-release-publish-local-ci-verify.md`.

## Blocked 조건

- `scripts/check-pii.mjs` 가 없거나 `package.json` 에 `verify:package` 스크립트가 없으면 `PHASE_BLOCKED: 공개 정보 검사와 패키지 검증 스크립트가 main 에 없다` 를 출력하고 끝낸다. 이 둘은 앞선 계획이 만든다.
- `docs/code-architecture.md` 「테스트와 빌드」 절에 `scripts/*.test.mjs` 를 vitest 가 실행한다는 문장이 없으면 같은 방식으로 `PHASE_BLOCKED: plan6 의 문서 문장이 main 에 없다` 를 출력하고 끝낸다.

## 의도 메모

- `package.json` 과 빌드된 CLI 버전의 일치는 preflight 가 따로 검사하지 않는다. `pnpm run verify:package` 가 같은 것을 확인한다.
- Release 본문 escape 검사는 dooray-cli 처럼 백슬래시를 모두 세지 않는다. 이 저장소 Release 노트에는 코드 블록의 줄 연속 `\` 가 정상으로 들어간다. 지금 release 스킬과 같이 「백틱이나 `$` 바로 앞의 백슬래시가 든 줄」 만 센다. 정규식은 `/\\[`$]/`.
- npm 반영 대기는 15초 간격, 최대 10분이다. `--no-wait` 은 한 번만 묻는다. `npm view <name> version --prefer-online` 으로 로컬 캐시를 건너뛴다.
- `doc-sync-check.mjs` 는 `git diff -U0 <직전 태그>..HEAD -- src/ ':(exclude,glob)src/**/*.test.ts'`(`:!src/**/*.test.ts` 는 `src/` 바로 아래 테스트를 못 뺀다) 의 추가된 줄에서 `new Command("...")` 의 이름과 `.option(...)`·`.requiredOption(...)` 첫 문자열 안의 `--긴-이름` 을 모두 뽑는다. 추출은 줄 단위가 아니라 파일별로 `+` 줄의 `+` 를 떼고 `\n` 으로 이은 문자열 전체에 정규식을 적용한다(`.requiredOption(` 다음 줄에 플래그 문자열이 오는 선언이 `src/commands/ncs/workload.ts` 등에 있다)(`-y, --yes` 처럼 짧은 플래그가 앞선 선언도 잡는다). 이 저장소는 `.requiredOption` 을 쓰므로(예: `src/commands/apigateway/resource.ts`) 옵션 추출 정규식은 `/\.(?:option|requiredOption)\(\s*["'`]([^"'`]+)["'`]/g` 로 한다. 테스트 파일은 pathspec 으로 제외해 테스트 안의 표본 문자열이 대상이 되지 않게 한다. 인자를 주면 그 문자열만 검사한다. `new Command(name)` 처럼 이름을 변수로 넘기는 팩토리와 `list`, `create`, `--name` 같은 흔한 이름은 검사가 거르지 못한다. 이 한계는 스크립트 머리 주석에 적는다. 파일을 직접 읽어 고정 문자열로 찾고 셸 grep 에 넘기지 않는다(`--search` 같은 값을 grep 이 자기 옵션으로 읽는다).
- 검사 대상 문서는 `README.md` 와 `skills/` 다. `docs/guide` 는 이 저장소에 없다.
- 순수 로직은 함수로 export 해 테스트하고, 직접 실행될 때만 `main` 을 돈다(`fileURLToPath(import.meta.url) === resolve(process.argv[1])`).
- 자식 프로세스는 `spawnSync` 로 부르고 종료 코드를 그 자리에서 읽는다. 셸 파이프로 잇지 않는다.

## 작업 항목

### 1. `.agents/skills/release/scripts/lib.mjs` 신규

`run(cmd, args, opts)` 와 `repoRoot()` 를 둔다. dooray-cli 의 `lib.mjs` 와 같은 역할이다.

### 2. `.agents/skills/release/scripts/preflight.mjs` 신규

목표 표의 검사를 차례로 돌리고, 실패한 검사 이름을 모아 마지막에 낸다. 종료 코드: 0 전부 통과, 1 하나 이상 실패, 2 저장소 루트나 `package.json`, `scripts/check-pii.mjs` 가 없음.

### 3. `.agents/skills/release/scripts/doc-sync-check.mjs` 신규

export: `extractTargets(diffText)` 는 추가된 명령과 옵션 배열을, `findMissing(targets, files)` 는 `files`(`Map<경로, 줄 배열>`)에서 0건인 대상을 돌려준다. 종료 코드: 0 모두 발견(대상이 0건인 경우 포함), 1 문서에 없는 대상이 있음, 2 직전 태그나 검사 경로가 없음.

### 4. `.agents/skills/release/scripts/verify-release.mjs` 신규

인자는 버전(`0.19.0` 또는 `v0.19.0`)과 선택 `--no-wait`. export: `countEscapeResidue(body)` 는 의도 메모의 규칙으로 걸린 줄 수를 돌려준다. 종료 코드: 0 전부 통과, 1 하나 이상 실패, 2 인자 없음이나 저장소 루트 없음.

### 5. 테스트 `.agents/skills/release/scripts/release-scripts.test.mjs` 신규

- `extractTargets`: `+export const fooCommand = new Command("foo")`, `+  .option("-y, --yes", "...")`, `+  .option("--dry-run")`, `+  .requiredOption("--name <name>")` 이 든 diff 에서 `foo`, `--yes`, `--dry-run`, `--name` 을 뽑는다. `-` 로 시작하는 삭제 줄과 `+++` 머리 줄은 무시한다.
- `extractTargets`(여러 줄): `+  .requiredOption(` 다음 줄이 `+    "--listener-id <id>",` 인 diff 에서 `--listener-id` 를 뽑는다.
- `extractTargets`(테스트 제외): 이 pathspec 은 git 이 처리하므로 테스트 대상이 아니다. 대신 `git ls-files -- src/ ':(exclude,glob)src/**/*.test.ts'` 출력에 `.test.ts` 가 없음을 검증 절에서 확인한다.
- `findMissing`: 한 파일에만 있는 대상은 빠지고, 어디에도 없는 대상만 남는다.
- `countEscapeResidue`: `` bad \`x\` `` 와 `bad \$HOME` 줄은 세고, 백틱 코드와 줄 끝 `\` 는 세지 않는다.

### 6. `vitest.config.ts`

`test.include` 배열에 `".agents/skills/**/scripts/*.test.mjs"` 를 더한다. 기존 항목은 그대로 둔다.

### 7. `docs/code-architecture.md`

「테스트와 빌드」 절의 「`scripts/*.test.mjs`도 vitest가 실행한다」 문장을 「`scripts/*.test.mjs` 와 `.agents/skills/**/scripts/*.test.mjs` 도 vitest 가 실행한다」로 바꾼다.

## 검증

먼저 `pnpm install` 을 실행한다. 실패하면 `AGENTS.md` 「빌드와 검증」 절의 우회 절차를 따른다.

```bash
pnpm install
node_modules/.bin/vitest run .agents/skills/release/scripts/release-scripts.test.mjs
node_modules/.bin/vitest run
node .agents/skills/release/scripts/preflight.mjs; echo "preflight=$?"
node .agents/skills/release/scripts/doc-sync-check.mjs; echo "docsync=$?"
node .agents/skills/release/scripts/doc-sync-check.mjs "--no-such-option-xyz"; echo "docsync_missing=$?"
node .agents/skills/release/scripts/verify-release.mjs; echo "verify_noarg=$?"
node .agents/skills/release/scripts/verify-release.mjs "$(git describe --tags --abbrev=0)" --no-wait; echo "verify_latest=$?"
git ls-files -- src/ ':(exclude,glob)src/**/*.test.ts' | grep -c '\.test\.ts$'
node scripts/check-pii.mjs
```

- `git ls-files ... | grep -c` 는 0 을 출력한다.
- `preflight=0`
- `docsync` 는 0 이나 1 이다. 1 이면 출력된 대상이 실제로 문서에 없는지 확인하고 보고한다. 문서를 고치지 않는다.
- `docsync_missing=1`, `verify_noarg=2`
- `verify_latest` 는 직전 릴리스를 확인한다. 직전 릴리스이므로 태그, Release, npm 이 모두 있어 0 이어야 한다. 네트워크가 막혀 있으면 실패 항목과 함께 보고한다.
- 마지막 줄은 종료 코드 0 이다. 테스트 파일의 표본 문자열이 걸리면 런타임에 조각을 이어 만든다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `.agents/skills/release/scripts/lib.mjs` | 신규 |
| `.agents/skills/release/scripts/preflight.mjs` | 신규 |
| `.agents/skills/release/scripts/doc-sync-check.mjs` | 신규 |
| `.agents/skills/release/scripts/verify-release.mjs` | 신규 |
| `.agents/skills/release/scripts/release-scripts.test.mjs` | 신규 |
| `vitest.config.ts` | 수정 |
| `docs/code-architecture.md` | 수정 |
