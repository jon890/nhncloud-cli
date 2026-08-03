# Phase 05 — 최종 검증과 완료 마킹

**Execution profile**: fast
**Status**: pending

---

## 목표

관리형 스킬 수명주기의 완료 근거를 수집하고 task 상태·실행 기록·관심사별 커밋을 team-lead에게 인계한다.

**범위 외**: executor는 commit, push, rebase와 PR 생성을 수행하지 않는다.

---

## 작업 항목 (4)

### 1. 브랜치와 외부 상태 확인

```bash
# cwd: <repo root>
# branch: feat/044-feat-managed-skill-lifecycle
set -e
test "$(git branch --show-current)" = "feat/044-feat-managed-skill-lifecycle"
git fetch origin
git merge-base --is-ancestor origin/main HEAD
skill_pr_count="$(gh pr list --state open --head feat/044-feat-managed-skill-lifecycle --json number --jq 'length')"
test "$skill_pr_count" -le 1
```

### 2. 최종 검증

```bash
# cwd: <repo root>
# branch: feat/044-feat-managed-skill-lifecycle
set -e
pnpm tsc --noEmit
pnpm test
pnpm run build
node dist/index.js skills status --json | jq -e \
  '.schemaVersion == 1 and (.status | type == "string") and .currentVersion == "0.12.0"'
node dist/index.js commands --json | jq -e '.commands | length == 149'
git diff --check
```

실제 홈 디렉터리의 기존 스킬 링크는 변경하지 않는다.
임시 디렉터리를 사용하는 manager 테스트로 설치·갱신·백업·제거 흐름을 검증한다.

### 3. task 완료 상태와 실행 기록

`tasks/044-feat-managed-skill-lifecycle/index.json`의 최상위와 다섯 phase `status`를 `completed`로 바꾼다.
`current_phase`는 `5`, `updated_at`은 실제 UTC 완료 시각으로 갱신하고 오류 필드는 `null`로 유지한다.
`docs/retrospectives/RUNS.md`에 실제 `build-with-teams` 결과 한 줄을 추가한다.

### 4. team-lead 커밋·push 인계

team-lead는 다음 관심사별로 변경이 있는 커밋만 만든다.

1. 제품 코드와 테스트: `feat(skill): add managed skill lifecycle`.
2. 공개 사용자·AI 문서: `docs(skill): document managed skill updates`.
3. task 상태와 실행 기록: `docs(retro): record managed skill lifecycle execution`.

docs-first 계획 커밋과 task 생성 커밋은 구현 전에 이미 push되어 있어야 한다.
team-lead는 commit 전 브랜치, `git status --porcelain`, staged diff와 무관 변경 제외 여부를 확인한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `tasks/044-feat-managed-skill-lifecycle/index.json` | 최상위·phase 완료 상태와 완료 시각 |
| `docs/retrospectives/RUNS.md` | build-with-teams 실행 결과 |

## 완료 조건

- 최상위와 다섯 phase가 `completed`이며 `current_phase`가 `5`다.
- 타입 검사, 전체 테스트, 빌드, 상태 JSON과 149개 명령 카탈로그 검증이 통과한다.
- 실제 사용자 홈의 스킬 링크를 검증 중 변경하지 않는다.
- 제품 코드·공개 문서·실행 기록이 관심사별 커밋으로 분리되어 push된다.

## Blocked 조건

- 최신 `main`이 선행 관계가 아니면 `PHASE_BLOCKED: team-lead의 branch 갱신 필요`를 보고한다.
- 같은 브랜치의 열린 PR이 둘 이상이면 `PHASE_BLOCKED: branch PR 상태 확인 필요`를 보고한다.
- 검증이 실제 사용자 홈의 링크 변경을 요구하면 테스트 격리가 부족한 것이므로 완료 처리하지 않는다.
