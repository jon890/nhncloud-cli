# Phase 04 — 최종 검증과 완료 마킹

**Execution profile**: fast
**Status**: pending

---

## 목표

검증된 Log & Crash Search v3 변경의 최종 근거를 수집한다.
task 상태와 실행 기록을 완료로 남겨 team-lead가 관심사별 commit·push·PR을 안전하게 수행하도록 인계한다.

**범위 외**: executor는 commit, push, rebase, PR 생성을 수행하지 않는다.
외부 상태 변경은 `build-with-teams` team-lead 책임이다.

---

## 작업 항목 (4)

### 1. 브랜치·원격 상태 확인

현재 브랜치와 최신 main 선행 관계를 확인한다.
외부 상태가 예상과 다르면 task 상태를 완료로 바꾸지 않는다.

```bash
# cwd: <repo root>
set -e
test "$(git branch --show-current)" = "feat/043-feat-logncrash-search-v3"
git fetch origin
git merge-base --is-ancestor origin/main HEAD
lncs_open_pr_count="$(gh pr list --state open --head feat/043-feat-logncrash-search-v3 --json number --jq 'length')"
test "$lncs_open_pr_count" -le 1
```

### 2. 최종 검증

```bash
# cwd: <repo root>
set -e
pnpm tsc --noEmit
pnpm test
pnpm run build
node dist/index.js logncrash search --help
node dist/index.js logncrash export --help
node dist/index.js configure --help
node dist/index.js commands --json | jq -e '.commands | length == 147'
test "$(rg -n 'X-LNCS-SECRET|/api/v2/search|scrollKey 유효기간은 1분|scrollKey 1분 만료' \
  README.md skills docs AGENTS.md src || true)" = ""
test "$(rg -n 'NHNCLOUD_LOGNCRASH_SECRET|<secretkey>|appkey / secret|logncrash (search|scroll) 에는 secret|자격증명에 secret 이 없습니다' \
  README.md skills docs AGENTS.md src || true)" = ""
git diff --check
```

실패가 있으면 관련 phase로 돌아가 수정하고 같은 검증을 다시 실행한다.

### 3. task 완료 상태와 실행 기록

`tasks/043-feat-logncrash-search-v3/index.json`을 다음과 같이 갱신한다.

- 네 phase의 `status`: `completed`.
- 최상위 `status`: `completed`.
- `current_phase`: `4`.
- `updated_at`: 실제 UTC 완료 시각.
- `error_message`와 `blocked_reason`: `null`.

`docs/retrospectives/RUNS.md`에 `build-with-teams` 실행 결과 한 줄을 추가한다.
실제 REVISE·FIX·DOCS·BLOCK·개입 수와 PR 결과만 기록하고 값을 추측하지 않는다.

### 4. team-lead commit·push 인계

이 task의 변경 목록을 확인하고 다른 작업의 변경과 untracked 파일을 인계 목록에서 제외한다.
executor는 `git add`, commit, push를 실행하지 않는다.

team-lead에게 아래 관심사 경계를 인계한다.

1. product code·tests: `feat(logncrash): migrate Search APIs to v3`.
2. 공개 사용자·AI 문서: `docs(logncrash): document Search v3 usage`.
3. task 상태·실행 기록: `docs(retro): record Log & Crash Search v3 execution`.

docs-first 계획 커밋과 task 생성 커밋은 build 실행 전에 브랜치에 있어야 한다.
team-lead는 commit 전에 `git status --porcelain`, `git diff --cached --check`, `git branch --show-current`를 확인한다.
각 관심사 파일에 변경이 없으면 빈 commit을 만들지 않는다.
phase별 commit을 이미 만들었다면 같은 변경을 중복 commit하지 않고 파일 범위만 검증한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `tasks/043-feat-logncrash-search-v3/index.json` | 최상위·phase 완료 상태와 완료 시각 |
| `docs/retrospectives/RUNS.md` | build-with-teams 실행 결과 |

## 완료 조건

- `tasks/043-feat-logncrash-search-v3/index.json`의 최상위와 네 phase `status`가 `completed`다.
- `current_phase`가 `4`이고 `updated_at`이 실제 완료 시각이다.
- 타입 검사, 전체 테스트, build, 도움말, catalog 147개, v2·secret 잔재 검사가 통과한다.
- product code·tests, 공개 문서, task 상태·실행 기록의 인계 목록이 관심사별 파일로 분리되어 있다.
- team-lead가 index 완료 마킹과 실행 기록을 마지막 commit에 포함하도록 인계 메모가 남아 있다.

## Blocked 조건

- 최신 main이 선행 관계가 아니면 `PHASE_BLOCKED: team-lead의 branch 갱신 필요`를 보고한다.
- 브랜치 PR이 둘 이상 열려 있으면 `PHASE_BLOCKED: branch PR 상태 확인 필요`를 보고한다.
- team-lead는 PR이 이미 열려 있으면 history rewrite 없이 현재 상태를 기준으로 commit·push한다.
