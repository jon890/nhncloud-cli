# Phase 05 — 브랜치 검증과 commit·push

**Execution profile**: fast
**Status**: pending

---

## 목표

Phase 01–04의 산출물과 검증 근거를 확인한다.
지정 브랜치에 이 task가 소유한 변경만 commit하고 원격에 push한다.

**범위 외**: PR 생성, merge, 실제 cloud 쓰기 smoke는 이 phase에서 하지 않는다.

---

## 작업 항목 (4)

### 1. 브랜치와 선행 이력 확인

현재 브랜치가 `feat/041-2-feat-loadbalancer-ipacl-write`인지 확인한다.
`git merge-base --is-ancestor origin/main HEAD`로 최신 main rebase 결과를 검사한다.
읽기 task 파일, `LoadBalancerClient`, ADR-022가 존재하는지 다시 검사한다.
예상하지 않은 사용자 변경은 되돌리거나 commit에 포함하지 않는다.

### 2. 최종 검증

Phase 04의 타입 검사, 테스트, build, catalog 검사, 개인 식별 정보 검사, `git diff --check`를 다시 실행한다.
실패가 남아 있으면 commit하지 않는다.

### 3. task 완료 상태

`tasks/041-2-feat-loadbalancer-ipacl-write/index.json`에서 아래를 갱신한다.

- Phase 5를 포함한 모든 phase `status`: `completed`
- task `status`: `completed`
- `current_phase`: `5`
- `updated_at`: 실제 완료 UTC 시각
- `error_message`, `blocked_reason`: `null`

### 4. commit과 push

`git status --porcelain`로 변경 파일을 확인한다.
이 task의 코드, 테스트, README, skill reference, task 상태 파일만 경로를 명시해 `git add`한다.
`git add -A`와 관련 없는 파일 추가를 금지한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| Phase 01–04의 Critical Files | 최종 확인 |
| `tasks/041-2-feat-loadbalancer-ipacl-write/index.json` | completed 마킹 |

## 검증과 commit

```bash
# cwd: <repo root>
git fetch origin
git branch --show-current
git merge-base --is-ancestor origin/main HEAD
git status --porcelain
pnpm tsc --noEmit
pnpm test
pnpm run build
node dist/index.js commands --json | jq -e '.commands | length == 147'
git diff --check
```

```bash
# cwd: <repo root>
git add \
  src/services/loadbalancer \
  src/commands/loadbalancer \
  src/index.ts \
  README.md \
  skills/nhncloud-cli/SKILL.md \
  skills/nhncloud-cli/references/loadbalancer.md \
  tasks/041-2-feat-loadbalancer-ipacl-write
git diff --cached --check
git commit -m "feat(loadbalancer): add IP ACL write safety"
git push origin feat/041-2-feat-loadbalancer-ipacl-write
```

성공 기준:

- 첫 명령 출력이 `feat/041-2-feat-loadbalancer-ipacl-write`다.
- 최신 `origin/main`이 HEAD의 조상이다.
- 검증 명령과 commit·push가 종료 코드 0이다.
- `git status --porcelain`에 이 task가 소유한 미반영 변경이 없다.
- `index.json`이 `status: "completed"`이고 모든 phase가 `completed`다.

## 의도 메모

- 후속 branch는 읽기 PR 병합 후 rebase하는 의존 순서를 지킨다.
- 제품 변경과 공개 문서는 한 기능 PR로 묶되 관련 없는 작업은 포함하지 않는다.

## Blocked 조건

- 예상 브랜치가 아니면 `PHASE_BLOCKED: 예상 외 브랜치 — feat/041-2-feat-loadbalancer-ipacl-write 필요`를 보고한다.
- 최신 main이 조상이 아니면 `PHASE_BLOCKED: origin/main rebase 필요`를 보고한다.
- push가 실패하면 `PHASE_BLOCKED: push 실패 — 원격 상태 확인 필요`를 보고하고 완료를 주장하지 않는다.
