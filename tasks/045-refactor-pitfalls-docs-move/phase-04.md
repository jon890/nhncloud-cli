# Phase 04 — 완료 상태와 커밋 인계

**Execution profile**: fast
**Status**: completed

---

## 목표

최신 원격 상태와 최종 검증 근거를 확인하고 task 완료 상태와 관심사별 커밋을 team-lead에게 인계한다.

**범위 외**: executor는 commit, push, rebase와 PR 생성을 수행하지 않는다. 의미 기반 문서 삭제는 후속 `046-refactor-pitfalls-prune`에서 수행한다.

---

## 작업 항목 (4)

### 1. 브랜치와 외부 상태 확인

```bash
# cwd: <repo root>
# branch: refactor/045-refactor-pitfalls-docs-move
set -e
test "$(git branch --show-current)" = "refactor/045-refactor-pitfalls-docs-move"
git fetch origin
git merge-base --is-ancestor origin/main HEAD
move_pr_count="$(gh pr list --state open --head refactor/045-refactor-pitfalls-docs-move --json number --jq 'length')"
test "$move_pr_count" -le 1
```

### 2. 최종 검증

Phase 3 검증 블록의 1~6번(내용 보존·frontmatter·INDEX 링크·INDEX 헤더 개수·활성 참조·공개 정보)을 다시 실행한다.
기준 커밋은 Phase 3과 같이 `origin/main`이다.

7번 저장소 회귀 검증(`pnpm tsc --noEmit`·`pnpm test`·`pnpm run build`)은 다시 실행하지 않는다. Phase 3에서 통과한 뒤 이 phase가 바꾸는 것은 `index.json`과 `RUNS.md` 두 Markdown·JSON뿐이라 빌드 결과에 영향이 없다.
대신 아래로 의도한 파일만 바뀌었는지 확인한다.

```bash
# cwd: <repo root>
set -e
git diff --check
test "$(git status --porcelain | grep -c '^??')" = "0"
```

미추적 파일 0건을 고정하는 이유는 `pnpm install`이 만드는 미완성 `pnpm-workspace.yaml` 같은 무관한 파일이 커밋에 딸려 들어가는 것을 막기 위해서다.

### 3. task 완료 상태와 실행 기록

`tasks/045-refactor-pitfalls-docs-move/index.json`의 최상위와 네 phase `status`를 `completed`로 바꾼다.
`current_phase`는 `4`, `updated_at`은 실제 UTC 완료 시각으로 갱신하고 오류 필드는 `null`로 유지한다.
네 phase 파일의 `**Status**:` 줄도 `completed`로 바꾼다. `index.json`만 갱신하면 phase 파일이 `pending`으로 남아 선행 task 관례와 어긋난다.
`docs/retrospectives/RUNS.md`에 실제 `build-with-teams` 결과 한 줄을 추가한다.

### 4. team-lead 커밋·push 인계

team-lead는 phase 단위 atomic commit을 기본으로 하고, 한 phase 안에서 관심사가 섞이면 아래 분류로 쪼갠다.

1. 이동과 활성 소비 경로: `refactor(pitfalls): move knowledge docs`.
2. task 상태와 실행 기록: `docs(retro): record pitfalls docs move`.

Phase 3은 검증 전용이라 `index.json` 상태 갱신만 남으므로 별도 커밋을 만들지 않고 인접 커밋에 합친다.

commit 전에 `git status`로 staged 전체를 확인하고 이 task와 무관한 파일을 제외한다.
`pnpm install`이 만드는 미완성 `pnpm-workspace.yaml`처럼 추적되지 않은 파일이 딸려 들어가면 안 된다.

planning 문서 커밋과 task 생성 커밋은 구현 전에 이미 push되어 있어야 한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `tasks/045-refactor-pitfalls-docs-move/index.json` | 최상위·phase 완료 상태와 완료 시각 |
| `docs/retrospectives/RUNS.md` | build-with-teams 실행 결과 |

## 완료 조건

- 이전 경로가 제거되고 `docs/pitfalls/`에 Markdown 112개가 존재한다.
- 111개 패턴 본문은 이전 경로의 내용과 바이트 단위로 같고 INDEX만 경로·실측 개수 갱신을 포함한다.
- 활성 표면에 이전 경로가 없고 문서 감사 대상이 중첩 패턴 파일을 포함한다. `docs/adr/018-harness-docs-directory.md`의 기각 대안 기록은 예외로 보존한다.
- `docs-verifier` 에이전트 두 개의 감사 대상에 `docs/pitfalls/` 경로가 들어가 이동 목적이 실제로 달성된다.
- 타입 검사, 전체 테스트, 빌드와 공개 정보 검사가 Phase 3에서 통과한다.
- `index.json`의 최상위와 네 phase가 `completed`다.

## Blocked 조건

- 최신 `main`이 선행 관계가 아니면 `PHASE_BLOCKED: team-lead의 branch 갱신 필요`를 보고한다.
- 같은 브랜치의 열린 PR이 둘 이상이면 `PHASE_BLOCKED: branch PR 상태 확인 필요`를 보고한다.
- 패턴 본문에 예상하지 않은 의미 변경이 있으면 `PHASE_BLOCKED: 내용 보존 위반 확인 필요`를 보고한다.
