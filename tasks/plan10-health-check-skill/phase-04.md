# Phase 04. health-check 스킬 문서와 references

**Execution profile**: standard

## 목표

phase 01~03 의 스크립트를 순서대로 부르는 `SKILL.md` 와 단계별 판단 기준을 담은 references 를 만든다.
스킬을 실행하면 작업 단위 표가 나오고 사용자가 단위마다 적용 경로를 정할 수 있게 하는 것이 이슈 #124 의 완료 조건이다.

**범위 외**: 실제 메이저 갱신(예: commander 15, ky 2, typescript 7, @types/node 26. 실제 목록은 실행 시점의 `pnpm outdated` 가 정한다)의 판정과 적용. 스킬이 머지된 뒤 이 스킬을 처음 실행한 결과로 별도 계획을 세운다. 이 사실을 PR 본문에 적는다.

**PR 본문**: 마지막 phase 를 마친 PR 본문은 `Refs #124` 로 쓰고 `Closes` 는 쓰지 않는다. 이 스킬을 처음 실행한 결과로 메이저 갱신 계획이 남아 있어 이슈가 닫히면 안 된다. 본문에는 이 스킬이 소비되는 경로도 적는다. 사용자가 「의존성 점검」, 「정기 점검」, `/health-check` 처럼 부르면 `SKILL.md` frontmatter 의 `description` 트리거가 스킬을 연다는 것이다. 같은 성격의 `codebase-maintenance` 스킬이 #102 에서 소비되지 않는다는 이유로 삭제되었기 때문이다.

## 컨텍스트

- 내부 스킬 문서의 기존 형태는 `.agents/skills/release/SKILL.md` 다. frontmatter 는 `name` 과 `description` 두 키이고, 본문은 제목, 굵은 글씨 목표 한 문장, 원칙 목록, 「워크플로우 개요」 표(열: 단계, 이름, 통과 조건), 단계별 절 순서다. 이 phase 는 표에 reference 열을 하나 더한다.
- 스크립트 경로와 인자는 phase 01~03 이 만든 파일의 머리 주석에서 직접 읽는다.
  - `.agents/skills/health-check/scripts/deps-report.mjs [--json]`
  - `.agents/skills/health-check/scripts/conventions.mjs [--json]`
  - `.agents/skills/health-check/scripts/trial-update.mjs` 의 `--range`, `--pkg NAME@SPEC`, `--dev-pkg NAME@SPEC`, `--out DIR`, `--keep`
- 이 저장소의 Node 하한은 세 곳에 있다. `package.json` 의 `engines.node`, `tsup.config.ts` 의 `target`, `.github/workflows/ci.yml` 과 `release.yml` 의 `NODE_VERSION`.
- 새 기능과 여러 파일에 걸친 변경은 `AGENTS.md` 「문서와 스킬」 절에 따라 `planning` 으로 문서와 task 를 만들고 `orchestration` 으로 worker 에 넘긴다.
- 공개 저장소다. 문서에 로컬 절대 경로, 사내 도메인, 실제 자격증명을 넣지 않는다.

**근거 문서**: `docs/code-architecture.md` 의 「공개 스킬 관리」 절, `AGENTS.md` 의 「문서와 스킬」 절

## 의도 메모

- 측정은 스크립트가 하고 판단이 필요한 곳만 사람과 에이전트가 본다. 스크립트 머리 주석이 이미 말하는 옵션 설명과 종료 코드를 `SKILL.md` 에 다시 적지 않는다.
- 명령 블록의 자리표시자를 `<이름>` 으로 쓰지 않는다. 셸이 입력 리다이렉션으로 읽어 실행 전에 실패한다. 변수에 담고 블록 앞에서 무엇을 채우는지 적는다.
- 판정 기준 표와 이유 표 형식은 3단계와 5단계에서만 쓰므로 `references/major-upgrade.md` 로 내린다. 구조 검토 축은 4단계에서만 쓰므로 `references/review-axes.md` 로 내린다.

## 작업 항목

### 1. `.agents/skills/health-check/SKILL.md` 신규

frontmatter:
- `name: health-check`
- `description`: 의존성 버전, 취약점(`pnpm audit`), 저장소 규약, 구조와 유지보수성을 점검하고 작업 단위 표와 적용 경로를 만든다는 것. 트리거 문구로 `/health-check`, `정기 점검`, `의존성 점검`, `패키지 버전 낡았나`, `pnpm audit`, `취약점 확인`, `메이저 업그레이드 해도 되나`, `구조 검토`, `유지보수성 평가` 를 넣는다. 새 버전 배포는 `release` 가 맡는다고 적는다.

본문:
- 목표 한 문장: `**목표: 작업 단위 표를 받은 사용자가 단위마다 적용 경로를 정했다.**`
- 원칙 두 줄: 측정은 스크립트가 하고 판단이 필요한 곳만 사람과 에이전트가 본다. 작업 중인 checkout 에서 갱신을 시험하지 않고 `trial-update.mjs` 가 만드는 임시 worktree 에서 한다.
- 「워크플로우 개요」 표(열: 단계, 이름, 통과 조건, reference):

| 단계 | 이름 | 통과 조건 | reference |
|---|---|---|---|
| 1 | 측정 | `deps-report.mjs` 와 `conventions.mjs` 가 종료 코드 0 이나 1 로 끝났다 | |
| 2 | 범위 안 갱신 시험 | `trial-update.mjs --range` 가 종료 코드 0 이고, 남은 취약점마다 해소 방법이나 남기는 이유가 있다 | |
| 3 | 메이저 판단 | 메이저 대상마다 올림, 코드 수정 후 올림, 보류 중 하나와 이유가 있다 | `references/major-upgrade.md` |
| 4 | 구조와 유지보수성 검토 | 보고 표의 높음 항목마다 확인한 파일과 줄이나 「확인하지 않음」이 적혀 있다 | `references/review-axes.md` |
| 5 | 보고와 적용 경로 결정 | 작업 단위 표를 보여 줬고, 어느 단위를 어느 경로로 할지 사용자가 정했다 | `references/major-upgrade.md` |

- 표 뒤 한 줄: 4단계는 사용자가 구조나 유지보수성 평가를 요청했거나 1단계 규약 검사에 error 가 있을 때만 돈다.
- 명령 블록은 저장소 root 에서 붙여넣고, 스크립트가 root 를 스스로 확인한다는 한 줄.
- 1절 측정: `OUT="$(mktemp -d)"` 뒤 두 스크립트 출력을 `"$OUT/deps.md"`, `"$OUT/conventions.md"` 로 받고 종료 코드를 `echo` 하는 블록. 읽을 때 먼저 볼 두 가지(취약점 표의 런타임 행, 규약 검사의 error 행). 규칙과 근거는 `conventions.mjs` 머리 주석과 각 규칙이 소유하고 새 규칙은 그 파일에 검사로 더한다는 것.
- 2절 범위 안 갱신 시험: `node .agents/skills/health-check/scripts/trial-update.mjs --range; echo "trial=$?"` 블록. 갱신 뒤에도 취약점이 남으면 3단계 전에 1단계 표의 「거쳐 오는 직접 의존성」 열을 보고, 범위 안에서 풀리는 취약점을 메이저 갱신의 이득으로 세지 않는다는 규칙. peer 로 자동 설치된 개발 도구가 옛 버전에 머물면 `--dev-pkg NAME@SPEC` 으로 직접 선언을 시험한다는 것. 실패하면 표의 로그 경로를 읽고 실패한 테스트 이름을 적는다는 것. 시험이 중간에 끊겨 임시 worktree 가 남으면 스크립트가 출력한 정리 명령을 그대로 쓴다는 것. 직접 지워야 하면 `git worktree list` 에서 경로가 `worktrees/nhncloud-cli/health-check-<숫자>-<숫자>` 패턴에 정확히 맞는 것만 `git worktree remove --force` 대상이고, 이 plan 의 worktree 처럼 이름에 `health-check` 가 들어도 그 패턴이 아니면 지우지 않는다는 경고 한 줄. 이 설명 문장에서도 `<숫자>` 같은 자리표시자는 코드 블록에 넣지 않는다.
- 3절 메이저 판단: 1단계 표에서 갱신 종류가 「메이저」인 패키지마다 `references/major-upgrade.md` 를 읽는다는 것과, `PKGS=(--pkg "NAME@SPEC")` 배열을 채워 `trial-update.mjs --range "${PKGS[@]}"` 를 돌리는 블록. 블록 앞에 배열에 1단계 표의 메이저 대상을 넣는다고 적는다. 타입 오류는 `tsc.log` 에서 파일과 줄을 읽어 수정량으로 적는다는 것.
- 4절 구조와 유지보수성 검토: `references/review-axes.md` 에 따라 읽기 전용 검토를 하고, 높음 항목은 근거 파일과 줄을 직접 열어 확인하며 확인하지 못하면 「확인하지 않음」이라고 적는다는 것.
- 5절 보고와 적용 경로 결정: 작업 단위 표(열: 단위, 내용, 규모, 먼저 정할 것), 버전을 바꾸는 단위에는 `references/major-upgrade.md` 「이유 표」를 붙인다는 것, 규모별 경로 표(시험을 마친 의존성 갱신과 몇 줄짜리 결함 수정은 이 세션에서 브랜치를 만들어 관심사별로 커밋, 여러 명령에 걸치거나 정책을 먼저 정해야 하는 것은 `planning` 으로 문서와 task 를 만든 뒤 `orchestration` 으로 넘긴다), 권장안을 먼저 적고 사용자가 정한다는 것, 의존성 갱신 커밋 본문에 이유 표를 패키지마다 한 줄씩 옮기고 `pnpm audit` 건수의 전후 변화와 남은 것의 이유를 적는다는 것, PR 은 사용자 확인 뒤 만든다는 것. 갱신을 적용할 때는 `trial-update.mjs` 가 남긴 `changes.patch` 를 작업 브랜치에서 `git apply` 하고 이어서 `pnpm install --frozen-lockfile` 로 node_modules 를 맞춘다는 것. patch 는 `os.tmpdir()` 아래에 있어 재부팅하면 사라지므로 적용 전에 있는지 확인하고 없으면 시험을 다시 돌린다는 것.

### 2. `.agents/skills/health-check/references/major-upgrade.md` 신규

- 「릴리스 노트 찾기」 절: `PKG=""` 를 채우고 `npm view "$PKG" repository.url engines --json` 으로 저장소를 찾는 블록, `REPO=""`, `MAJOR=""` 를 채우고 `gh api "repos/$REPO/releases?per_page=30" --jq ...` 로 `^v?${MAJOR}[.]0[.]0$` 태그 본문을 읽는 블록. 쿼리 문자열이 든 경로를 따옴표로 감싸야 zsh 가 `?` 를 glob 으로 읽지 않는다는 이유 한 줄. Release 가 없으면 `CHANGELOG.md`, 둘 다 없으면 compare 링크를 적고 보류.
- 「판정 기준」 표(열: 확인할 것, 보는 곳, 판정에 주는 영향). 행: dependencies 의 Node 하한(새 버전 `engines.node` 와 우리 `engines.node`. 더 높으면 사용자 설치 환경 하한이 바뀌므로 사용자에게 묻는다), devDependencies 의 Node 하한(사용자 설치본에 들어가지 않으므로 `engines.node` 가 아니라 워크플로의 `NODE_VERSION` 과 비교), 빌드 target(dependencies 가 `tsup.config.ts` 의 `target` 보다 새 문법을 요구하는지), 범위 안 대안(2단계에서 이미 풀리는 취약점이면 메이저의 보안 이득은 없다), 자체 타입 제공(`@types/*` 를 빼도 되는지는 `trial-update.mjs` 에 제거 옵션이 없으므로 수동으로 확인한다. 임시 worktree 는 메인 checkout 아래라 상위 `node_modules` 로 모듈 해석이 올라가 패키지 제거 시험은 위양성이 날 수 있다고 적는다), 진입점 변경(`exports` 맵 변경 시 깊은 경로 import 를 grep), 시험 결과(`trial-update.mjs` 의 tsc, test, build, verify-package 로그의 오류 건수와 위치).
- 판정 셋(올림, 코드 수정 후 올림, 보류)의 조건. 보안 이득도 기능 이득도 없는 메이저는 시험이 통과해도 「올림」으로 판정하지 않고 「이득 없음, 시험 통과」로 적어 사용자가 정한다는 것, 옛 메이저의 지원 종료일이 있으면 함께 적는다는 것. 보안 사유가 있는 메이저는 보류해도 보고 첫머리에 적는다는 것.
- 「이유 표」 절: 열은 패키지, 변경(현재 → 목표), 이유. 이유 칸은 해소하는 취약점(무엇이 일어나는 문제인지, 등급, 이 CLI 의 어느 기능이 그 코드를 쓰는지), 이 CLI 가 쓰는 경로에 닿는 변경(릴리스 노트의 어느 항목이 어느 코드에 해당하는지), 둘 다 없으면 「보안 사유 없음. 같은 범위 안의 최신화」 셋 중 하나다. advisory 제목을 옮기지 않고 무엇이 일어나는지로 풀어 쓴다.

### 3. `.agents/skills/health-check/references/review-axes.md` 신규

- 검토자 둘(구조, 유지보수성)에게 나눠 주고 서로의 축을 알려 범위가 겹치지 않게 한다는 것. 둘 다 읽기 전용이라 파일을 고치지 말라고 적는다는 것.
- 「공통으로 주는 것」: 먼저 읽을 문서(`AGENTS.md`, `docs/code-architecture.md`, `docs/adr/INDEX.md`), 1단계 `conventions.md` 전문(이미 센 항목은 다시 세지 않고 원인과 제안만 더한다), 결과 형식(한국어, 심각도 높음·중간·낮음, 근거 파일과 줄, 제안, 이득과 비용을 담은 표, 추측이면 추측이라고 표시, 한 줄에 항목 하나).
- 「검토자 A: 구조」 표(열: 축, 볼 것). 행: 레이어 경계(`docs/code-architecture.md` 의 의존 방향과 `src/services/`, `src/commands/`, `src/api/`, `src/config/` 의 실제 import), 명령 간 중복(입력 해석, `--json` 과 `--quiet` 출력, `--yes` 확인, 오류 처리), 규약과 동작의 일치(`AGENTS.md` 「코드 경계와 규칙」을 명령들이 지키는지. 빈 HOME 에서 빌드한 `node dist/index.js` 를 실행해 종료 코드로 확인할 수 있다), 큰 파일(나누는 것과 반복을 줄이는 것 중 무엇이 먼저인지, 테스트 mock 수정량까지 비용에 넣는다), 시작 시간(`node dist/index.js --version` 실측).
- 「검토자 B: 유지보수성」 표. 행: 타입(`tsconfig.json` strict 계열, `as` 단언과 `!` 위치), 인터페이스 계약(API 응답을 런타임 검증 없이 믿는 곳, `--json` 이 raw 응답을 지키는지), 오류 처리(HTTP 오류, 네트워크 오류, timeout 이 어디서 `NhnCloudCliError` 로 바뀌는지, 종료 코드를 잃는 재포장, 조건 없는 `catch {}`), 민감 정보(`~/.nhncloud/credentials.json` 과 캐시 파일 권한, 로그나 이슈 첨부에 자격증명이 섞일 경로), 그 밖의 영역(캐시 무결성과 동시 실행, 테스트 공백, CI 워크플로, npm 패키지 공개 범위).
- 「결과를 받은 뒤」: 높음 항목은 근거 파일과 줄을 직접 연다. 검토자가 실행으로 확인했다고 적은 항목은 그렇다고 보고에 적고 다시 돌렸는지도 적는다. 회신을 받고 더 물을 것이 없으면 그 검토자는 끝낸다.

## 검증

```bash
pnpm test
test -f .agents/skills/health-check/SKILL.md && test -f .agents/skills/health-check/references/major-upgrade.md && test -f .agents/skills/health-check/references/review-axes.md
test "$(for s in deps-report conventions trial-update; do grep -q "scripts/$s.mjs" .agents/skills/health-check/SKILL.md || echo "$s"; done | wc -l | tr -d ' ')" = 0
grep -q '^name: health-check$' .agents/skills/health-check/SKILL.md
test "$(for f in .agents/skills/health-check/SKILL.md .agents/skills/health-check/references/*.md; do awk '/^```/{b=!b; next} b' "$f"; done | grep -cE '<[^<>[:space:]]+>')" = 0
test -f .claude/skills/health-check/SKILL.md
OUT="$(mktemp -d)" && node .agents/skills/health-check/scripts/deps-report.mjs > "$OUT/deps.md"; d=$?; node .agents/skills/health-check/scripts/conventions.mjs > "$OUT/conventions.md"; c=$?; test "$d" -le 1 && test "$c" -le 1 && grep -q '# 의존성 측정' "$OUT/deps.md" && grep -q '# 규약 검사' "$OUT/conventions.md"
node scripts/check-pii.mjs
git diff --check
```

- 다섯째 줄은 SKILL.md 와 references 의 코드 블록 안(``` 로 감싼 줄)에 `<이름>` 형태의 자리표시자가 없는지 본다. 의도 메모가 막으려는 것이 셸이 실행하는 명령 블록의 입력 리다이렉션 오독이라 산문은 대상이 아니다. 코드 블록 밖 산문의 `<숫자>` 는 허용한다. 계획 시점에 `release` 스킬에 같은 검사를 돌려 0건임을 확인했다. 걸리면 변수로 바꾼다.
- 여섯째 줄은 `.claude/skills` 심볼릭 링크로 스킬이 보이는지 본다.
- 일곱째 줄은 1절 측정을 실제로 돌린다. 두 스크립트 모두 0 이나 1 이어야 한다.
- 한국어 문서는 `korean-check` 스킬의 검사기를 `SKILL.md` 와 references 두 파일에 돌려 종료 코드 0 을 확인한다. 이 검사기는 저장소 밖에 있어 검증 명령에 경로를 적지 않는다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `.agents/skills/health-check/SKILL.md` | 신규 |
| `.agents/skills/health-check/references/major-upgrade.md` | 신규 |
| `.agents/skills/health-check/references/review-axes.md` | 신규 |
