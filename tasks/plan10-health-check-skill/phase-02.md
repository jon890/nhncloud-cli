# Phase 02. 임시 worktree 갱신 시험 스크립트

**Execution profile**: deep

## 목표

범위 안 갱신과 지정한 패키지 갱신을 메인 checkout 의 `worktrees/nhncloud-cli/` 아래 임시 worktree 에서 설치하고 타입 검사, 테스트, 빌드, 패키지 산출물 검증을 돌린 뒤 결과 표와 patch 를 남기고 worktree 를 지우는 스크립트를 만든다.
작업 중인 checkout 의 `package.json` 과 `pnpm-lock.yaml` 을 건드리지 않고 메이저 갱신의 수정량을 재기 위해서다.

**범위 외**: 실제 메이저 갱신(commander 15, ky 2, typescript 7, @types/node 26)의 판정과 적용. 이 phase 의 검증은 시험 경로가 동작하는지만 본다.

## 컨텍스트

- phase 01 이 만든 `.agents/skills/health-check/scripts/lib.mjs` 의 `run`, `enterRepoRoot`, `mainCheckoutRoot`, `checkPnpmMajor`, `parseAuditReport`, `classifyAdvisories` 를 쓴다. 시그니처는 그 파일에서 직접 읽는다.
- 직접 실행 가드와 export 패턴은 `.agents/skills/release/scripts/doc-sync-check.mjs` 끝부분을 따른다.
- worktree 위치 규칙은 `.claude/build-with-teams-overlay.md` 의 「worktree」 절이다. 유지보수자 환경의 hook 이 `worktrees/nhncloud-cli/` 밖의 worktree 생성을 막는다.
  linked worktree 안에서 실행해도 메인 checkout 아래에 만들어야 하므로 `repoRoot()` 가 아니라 `mainCheckoutRoot()` 를 기준으로 한다.
- `.gitignore` 에는 `worktrees/` 가 없다. 유지보수자의 `.git/info/exclude` 에만 있어서, 새로 clone 한 checkout 에서는 임시 worktree 가 `git status` 에 미추적 디렉터리로 보인다. `scripts/check-pii.mjs` 의 `SKIP_DIRS` 는 이미 `worktrees` 를 건너뛴다.
- 계획 시점(2026-10-08) 실측: 새 detached worktree 에서 `pnpm install --frozen-lockfile` 은 종료 코드 0 이었다. `pnpm-workspace.yaml` 의 `allowBuilds: esbuild: true` 가 esbuild 빌드를 허용한다. `pnpm update` 는 종료 코드 0 이었고 `package.json` 의 범위 하한만 올렸다.
- 저장소 검증 명령은 `AGENTS.md` 의 「빌드와 검증」 절이다. 시험 단계는 그중 `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm run build`, `pnpm run verify:package` 를 쓴다.

**근거 문서**: `docs/code-architecture.md` 의 「공개 스킬 관리」 절

## 의도 메모

- 로그와 patch 는 `os.tmpdir()` 아래 `mkdtempSync(join(tmpdir(), "health-check-"))` 디렉터리에 둔다. worktree 를 지운 뒤에도 남아야 하기 때문이다. worktree 자체만 `worktrees/nhncloud-cli/` 아래에 둔다.
- 임시 worktree 이름은 `health-check-<Date.now()>-<pid>`(숫자 둘을 `-` 로 이은 형식)로 정하고, 경로는 `worktrees/nhncloud-cli/health-check-<숫자>-<숫자>` 다. 이 패턴이 plan worktree(`worktrees/nhncloud-cli/plan10-health-check-skill`)와 겹치지 않으므로, 남은 임시 worktree를 찾는 검증과 정리 안내는 이 패턴만 쓴다.
- 검사 로그는 단계마다 파일 하나로 남긴다. tail 로 자르면 어느 단언이 깨졌는지가 사라진다.
- `pnpm audit` 결과는 보고만 하고 종료 코드 판정에 넣지 않는다. 남은 취약점의 판단은 스킬 2단계와 3단계에서 사람이 한다.
- 계획 시점에 범위 안 갱신 뒤에도 `vite 8.0.14`, `postcss 8.5.15` 같은 개발 도구 경로의 간접 의존성이 옛 버전에 머물렀다. `pnpm update NAME` 에 간접 의존성 이름을 주어도, lockfile 을 지우고 새로 설치해도 같았다. 이 원인 조사와 해소는 이 phase 의 범위가 아니다. 스크립트는 남은 advisory 를 표로 보여 주기만 한다.

## 작업 항목

### 1. `.agents/skills/health-check/scripts/trial-update.mjs` 신규

머리 주석에 사용법 세 줄(`--range`, `--pkg NAME@SPEC`, `--range --dev-pkg NAME@SPEC --keep`), 옵션 설명, HEAD 커밋에서 worktree 를 만들어 커밋하지 않은 변경은 시험에 들어가지 않는다는 것, 종료 코드(0 갱신과 검사 모두 통과, 1 하나 이상 실패나 중단, 2 인자 오류나 pnpm 버전 불일치나 worktree 생성 실패)를 적는다.

다음을 `export` 한다.

| 이름 | 동작 |
|---|---|
| `parseArgs(argv)` | `--range`, `--keep`, `--pkg NAME@SPEC`(반복), `--dev-pkg NAME@SPEC`(반복), `--out DIR` 를 읽어 `{ range, keep, pkgs, devPkgs, outDir }` 를 돌려준다. 모르는 인자, 값 없는 `--pkg`/`--dev-pkg`/`--out`, `/^(@[^/]+\/)?[^@]+@.+$/` 에 맞지 않는 값, 셋(`--range`, `--pkg`, `--dev-pkg`) 중 아무것도 없는 경우는 한국어 메시지의 `Error` 를 던진다 |
| `nameOfSpec(spec)` | `spec.slice(0, spec.lastIndexOf("@"))`. `@scope/name@^2` 는 `@scope/name` |
| `splitByDepType(pkgs, devNames)` | `devNames`(Set) 에 이름이 있으면 `dev`, 없으면 `prod` 로 나눠 `{ prod, dev }` |
| `trialWorktreePath(mainRoot, suffix)` | `join(mainRoot, "worktrees", "nhncloud-cli", \`health-check-${suffix}\`)` |
| `CHECK_STEPS` | `[["tsc", ["exec", "tsc", "--noEmit"]], ["test", ["test"]], ["build", ["run", "build"]], ["verify-package", ["run", "verify:package"]]]` |

`main()` 순서:

1. `parseArgs` 가 던지면 stderr 에 메시지를 쓰고 2.
2. `enterRepoRoot()`, `package.json` 의 `packageManager` 와 `pnpm --version` 을 `checkPnpmMajor` 로 확인. 메시지가 있으면 2.
3. `mainCheckoutRoot()` 가 `null` 이면 2. `suffix` 는 `${Date.now()}-${process.pid}`. 경로가 이미 있으면 2. 상위 디렉터리는 `mkdirSync(..., { recursive: true })`.
4. `git worktree add --detach WT HEAD` 실패 시 stderr 를 보여 주고 2. 성공한 바로 다음 줄에서 `try` 를 열고, 5~10 은 모두 그 안에서 돈다. worktree 정리는 11 의 `finally` 하나가 맡는다.
5. 중단 판정에 `process.on("SIGINT")` 나 `process.on("SIGTERM")` 처리기를 쓰지 않는다. 자식을 `spawnSync` 로 돌리는 동안 node 이벤트 루프가 멈춰 처리기가 돌지 않는다(계획 시점 실측). 터미널의 Ctrl+C 는 자식에게도 가므로 자식 결과의 `signal` 이나 `status >= 128` 로 중단을 판정한다.
6. 단계 실행은 `step(name, cmd, args, { judge = true })` 하나로 한다. `cwd: WT` 로 `run` 하고, 로그를 `outDir/<name>.log` 에 `$ cmd args` 머리와 stdout, stderr 로 쓰고, `{ name, status, signal, log, judge }` 를 쌓는다. 자식 결과의 `signal` 이 null 이 아니거나 `status >= 128` 이면 중단으로 보고 실패로 기록한 뒤 남은 단계를 건너뛰고 곧바로 `finally` 로 간다.
7. 차례: `pnpm install --frozen-lockfile`, `--range` 면 `pnpm update`, `splitByDepType` 의 `prod` 가 있으면 `pnpm add ...prod`, `dev` 와 `devPkgs` 를 합친 것이 있으면 `pnpm add -D ...`, 그다음 `CHECK_STEPS`. 설치나 갱신이 실패하면 검사 단계를 돌리지 않는다. 검사 단계는 하나가 실패해도 나머지를 돈다.
8. `pnpm audit --json` 을 `judge: false` 로 돌리고 `parseAuditReport` 와 `classifyAdvisories`(worktree 의 갱신된 `package.json` 기준)로 읽는다.
9. worktree 에서 `git diff -- package.json pnpm-lock.yaml` 을 `outDir/changes.patch` 로 쓴다.
10. stdout 에 `# 갱신 시험` 보고를 낸다. 대상, 로그와 patch 경로, 단계 표(열: 단계, 종료 코드, 로그. 종료 코드 칸은 `0 (통과)`, `1 (실패)`, audit 은 `(보고만)`), 갱신 후 취약점(`읽지 못함`, `없음`, 또는 `## 갱신 후 남은 advisory` 표. 열: 패키지, 등급, 거쳐 오는 직접 의존성), `package.json` 의 바뀐 의존성 줄을 담은 diff 블록.
11. `finally` 에서 `--keep` 이 아니면 `git worktree remove --force WT` 를 돌린다. 실패하면 stderr 에 경로와 `git worktree remove --force "WT"` 명령을 쓴다. `--keep` 이면 남긴 경로와 지우는 명령을 stdout 에 쓴다.
12. 반환값은 실패나 중단이 있으면 1, 아니면 0.

### 2. `.gitignore` 수정

`.claude/worktrees/` 줄 아래에 `/worktrees/` 를 더한다. 새로 clone 한 checkout 에서도 임시 worktree 와 plan worktree 가 미추적 디렉터리로 보이지 않게 하기 위해서다.

### 3. 이 phase 를 검증하는 `.agents/skills/health-check/scripts/trial-update.test.mjs`

- `parseArgs(["--range", "--pkg", "commander@^15.0.0", "--dev-pkg", "@types/node@^26"])` 는 `{ range: true, keep: false, pkgs: ["commander@^15.0.0"], devPkgs: ["@types/node@^26"], outDir: null }`.
- `parseArgs([])`, `parseArgs(["--pkg"])`, `parseArgs(["--pkg", "commander"])`, `parseArgs(["--unknown"])` 는 각각 던진다.
- `nameOfSpec("@types/node@^26")` 는 `"@types/node"`, `nameOfSpec("ky@^2.1.0")` 는 `"ky"`.
- `splitByDepType(["ky@^2", "typescript@^7"], new Set(["typescript"]))` 는 `{ prod: ["ky@^2"], dev: ["typescript@^7"] }`.
- `trialWorktreePath("/repo", "1-2")` 는 `join("/repo", "worktrees", "nhncloud-cli", "health-check-1-2")`.
- `CHECK_STEPS` 의 이름 목록이 `["tsc", "test", "build", "verify-package"]` 다.

표본 값에 사내 도메인처럼 보이는 문자열이나 16자 이상 비밀값 같은 리터럴을 쓰지 않는다.

## 검증

```bash
pnpm exec vitest run .agents/skills/health-check/scripts/trial-update.test.mjs
OUT="$(mktemp -d)" && node .agents/skills/health-check/scripts/trial-update.mjs --range --out "$OUT"; s=$?; echo "trial=$s"; test "$s" -le 1 && test -f "$OUT/changes.patch" && test -f "$OUT/tsc.log"
test "$(git worktree list --porcelain | grep -c '/worktrees/nhncloud-cli/health-check-[0-9]')" = 0
node .agents/skills/health-check/scripts/trial-update.mjs --pkg commander; test $? = 2
git status --porcelain package.json pnpm-lock.yaml | wc -l | grep -qx ' *0'
pnpm tsc --noEmit
pnpm test
node scripts/check-pii.mjs
git diff --check
```

- 둘째 줄은 실제 registry 에 접속해 1분 안팎이 걸린다. 종료 코드 0 이나 1 이 정상이다. 2 면 worktree 생성이나 pnpm 확인이 실패한 것이다. 1 이면 보고의 단계 표에서 실패한 단계와 로그 경로를 PR 본문에 옮긴다.
- 셋째 줄은 시험 뒤 임시 worktree 가 남지 않았는지 본다. 경로 패턴을 `health-check-<숫자>` 로 한정한 것은 이 plan worktree(경로와 브랜치 이름에 `health-check` 가 든다)를 세지 않기 위해서다.
- 다섯째 줄은 작업 중인 checkout 의 `package.json` 과 lockfile 이 바뀌지 않았는지 본다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `.agents/skills/health-check/scripts/trial-update.mjs` | 신규 |
| `.agents/skills/health-check/scripts/trial-update.test.mjs` | 신규 |
| `.gitignore` | 수정 |
