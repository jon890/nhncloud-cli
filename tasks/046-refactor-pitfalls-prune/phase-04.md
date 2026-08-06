# Phase 04 — 완료 상태와 커밋 인계

**Execution profile**: fast
**Status**: pending

---

## 목표

임시 감사 자료를 제거하고 최신 원격 상태·최종 검증·task 완료 상태를 확인해 관심사별 커밋을 team-lead에게 인계한다.

**범위 외**: executor는 commit, push, rebase와 PR 생성을 수행하지 않는다.

---

## 작업 항목 (4)

### 1. 브랜치와 외부 상태 확인

```bash
# cwd: <repo root>
# branch: refactor/046-refactor-pitfalls-prune
set -e
test "$(git branch --show-current)" = "refactor/046-refactor-pitfalls-prune"
git fetch origin
git merge-base --is-ancestor origin/main HEAD
git cat-file -e origin/main:docs/pitfalls/INDEX.md
test "$(git ls-tree -r --name-only origin/main docs/pitfalls | grep -c '\.md$')" = "112"
! git cat-file -e origin/main:.agents/skills/_shared/pitfalls/INDEX.md 2>/dev/null
prune_pr_count="$(gh pr list --state open --head refactor/046-refactor-pitfalls-prune --json number --jq 'length')"
test "$prune_pr_count" -le 1
```

### 2. 최종 검증과 임시 자료 제거

Phase 3의 삭제 근거·INDEX·frontmatter·활성 참조 검사와 `pnpm tsc --noEmit`, `pnpm test`, `pnpm run build`, `git diff --check`를 다시 실행한다.
검증 근거를 확인한 뒤 `.omx/pitfalls-audit.tsv`를 제거하고 git 변경에 포함되지 않았는지 확인한다.

### 3. task 완료 상태와 실행 기록

`tasks/046-refactor-pitfalls-prune/index.json`의 최상위와 네 phase `status`를 `completed`로 바꾼다.
`current_phase`는 `4`, `updated_at`은 실제 UTC 완료 시각으로 갱신하고 오류 필드는 `null`로 유지한다.
`docs/retrospectives/RUNS.md`에 실제 `build-with-teams` 결과 한 줄을 추가한다.

### 4. team-lead 커밋·push 인계

team-lead는 다음 관심사별로 변경이 있는 커밋만 만든다.

1. 패턴 정리와 활성 소비 경로: `refactor(pitfalls): prune obsolete guidance`.
2. task 상태와 실행 기록: `docs(retro): record pitfalls guidance prune`.

planning 문서와 task 파일은 `045`를 통해 `main`에 병합된 뒤 이 브랜치가 최신 `main`으로 rebase되어 있어야 한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `.omx/pitfalls-audit.tsv` | 검증 후 제거, 커밋 금지 |
| `tasks/046-refactor-pitfalls-prune/index.json` | 최상위·phase 완료 상태와 완료 시각 |
| `docs/retrospectives/RUNS.md` | build-with-teams 실행 결과 |

## 완료 조건

- 삭제된 모든 파일에 `delete-*` 근거가 있고 남은 파일은 현재 저장소 표면과 일치한다.
- INDEX 링크·카테고리 개수와 실제 파일이 일치하고 frontmatter가 유효하다.
- 타입 검사, 전체 테스트, 빌드, 공개 정보 검사와 이전 경로 grep이 통과한다.
- 임시 분류표가 작업 트리와 커밋에 남지 않는다.
- `index.json`의 최상위와 네 phase가 `completed`다.

## Blocked 조건

- 최신 `main`이 선행 관계가 아니면 `PHASE_BLOCKED: 045 병합 후 branch rebase 필요`를 보고한다.
- 같은 브랜치의 열린 PR이 둘 이상이면 `PHASE_BLOCKED: branch PR 상태 확인 필요`를 보고한다.
- 삭제 근거가 규칙의 부분 중복이나 자동 검사의 일부 보장에 그치면 `PHASE_BLOCKED: 삭제 근거 부족`을 보고하고 해당 문서를 보존한다.
