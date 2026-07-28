# Phase 03 — 브랜치 검증과 commit·push

**Execution profile**: fast
**Status**: pending

---

## 목표

검증된 #54 변경만 `fix/042-fix-ncs-events-time-filter` 브랜치에 커밋하고 원격에 푸시한다.
task 상태를 완료로 기록해 재실행과 누락을 방지한다.

---

## 작업 항목 (4)

### 1. 브랜치와 최신 main 확인

현재 브랜치가 `fix/042-fix-ncs-events-time-filter`인지 확인한다.
원격 main이 선행 관계가 아니면 Phase 01의 rebase 전제가 지켜지지 않은 것이므로 커밋하지 않고 차단한다.

```bash
# cwd: <repo root>
set -e
test "$(git branch --show-current)" = "fix/042-fix-ncs-events-time-filter"
git fetch origin
git merge-base --is-ancestor origin/main HEAD
```

### 2. 최종 검증

```bash
# cwd: <repo root>
set -e
pnpm tsc --noEmit
pnpm test
pnpm run build
node dist/index.js ncs workload logs --help
node dist/index.js ncs workload events --help
node dist/index.js commands --json | jq -e '.commands | length == 147'
node dist/index.js commands --json | jq -e '
  [
    "ncs workload",
    "ncs workload create",
    "ncs workload delete",
    "ncs workload events",
    "ncs workload get",
    "ncs workload history",
    "ncs workload history get",
    "ncs workload list",
    "ncs workload logs",
    "ncs workload patch",
    "ncs workload pause",
    "ncs workload restart",
    "ncs workload resume",
    "ncs workload schedule-history",
    "ncs workload update"
  ] as $expected
  | ([.commands[].path | select(startswith("ncs workload"))] | sort) == ($expected | sort)
'
git diff --check
```

실패가 있으면 관련 phase로 돌아가 수정하고 이 검증을 다시 실행한다.

### 3. task 완료 상태

`tasks/042-fix-ncs-events-time-filter/index.json`을 다음과 같이 갱신한다.

- 세 phase의 `status`: `completed`
- 최상위 `status`: `completed`
- `current_phase`: `3`
- `updated_at`: 실제 UTC 완료 시각
- `error_message`와 `blocked_reason`: `null`

### 4. 관심사별 commit 확인과 task 기록 push

Phase 1과 Phase 2에서 team-lead가 아래 두 커밋을 분리했는지 확인한다.

- 코드·테스트: `src/commands/ncs/*`, `src/services/ncs/client.test.ts`
- 사용자·AI 문서: `README.md`, `skills/nhncloud-cli/SKILL.md`, `skills/nhncloud-cli/references/ncs.md`

Phase 3에서는 task 상태와 실행 기록만 별도 커밋한다.
다른 작업의 변경과 untracked 파일은 포함하지 않는다.

```bash
# cwd: <repo root>
git diff-tree --no-commit-id --name-only -r <code-commit>
git diff-tree --no-commit-id --name-only -r <docs-commit>
git add docs/retrospectives/RUNS.md tasks/042-fix-ncs-events-time-filter
git diff --cached --check
git status --short
git commit -m "docs(retro): record NCS time filter execution"
git push origin fix/042-fix-ncs-events-time-filter
```

---

## 완료 조건

- `tasks/042-fix-ncs-events-time-filter/index.json`의 최상위와 세 phase `status`가 `completed`다.
- 타입 검사, 테스트, build, 두 도움말, catalog 항목 수와 `ncs workload` path 집합 검증이 통과한다.
- 커밋에는 #54 범위 파일만 포함된다.
- 코드·테스트, 사용자·AI 문서, task 상태·실행 기록 커밋이 관심사별 파일만 포함한다.
- 원격 브랜치와 local HEAD가 같다.

## Blocked 조건

- 최신 main 반영 과정에서 범위 밖 충돌이 생기면 `PHASE_BLOCKED: origin/main 충돌 해결 범위 확인 필요`를 보고한다.
- 원격 인증이나 보호 정책으로 push가 실패하면 `PHASE_BLOCKED: 원격 push 권한 또는 정책 확인 필요`를 보고하고 로컬 커밋 SHA를 보존한다.
