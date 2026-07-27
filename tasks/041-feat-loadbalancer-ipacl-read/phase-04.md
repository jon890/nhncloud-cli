# Phase 04 — 브랜치 검증과 commit·push

**Execution profile**: fast  
**Status**: pending

---

## 목표

Phase 01–03 산출물과 검증 근거를 확인하고 지정 브랜치에 관심사별 변경만 commit한 뒤 원격에 push한다.

**범위 외**: PR 생성, merge, 후속 쓰기 plan 실행은 이 phase에서 하지 않는다.

---

## 작업 항목 (4)

### 1. 브랜치와 선행 산출물 확인

현재 브랜치가 `feat/041-feat-loadbalancer-ipacl-read`인지 확인한다.
Phase 01–03의 신규 파일과 공개 문서가 존재하는지 확인한다.
예상하지 않은 사용자 변경은 되돌리거나 commit에 포함하지 않는다.

### 2. 최종 검증

Phase 03의 타입 검사, 테스트, build, catalog 검사, 개인 식별 정보 검사, `git diff --check`를 다시 실행한다.
실패가 남아 있으면 commit하지 않는다.

### 3. task 완료 상태

`tasks/041-feat-loadbalancer-ipacl-read/index.json`에서 아래를 갱신한다.

- Phase 4를 포함한 모든 phase `status`: `completed`
- task `status`: `completed`
- `current_phase`: `4`
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
| Phase 01–03의 Critical Files | 최종 확인 |
| `tasks/041-feat-loadbalancer-ipacl-read/index.json` | completed 마킹 |

## 검증과 commit

```bash
# cwd: <repo root>
git branch --show-current
git status --porcelain
pnpm tsc --noEmit
pnpm test
pnpm run build
node dist/index.js commands --json | jq -e '.commands | length == 141'
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
  tasks/041-feat-loadbalancer-ipacl-read
git diff --cached --check
git commit -m "feat(loadbalancer): add IP ACL read commands"
git push origin feat/041-feat-loadbalancer-ipacl-read
```

성공 기준:

- 첫 명령 출력이 `feat/041-feat-loadbalancer-ipacl-read`다.
- 검증 명령과 commit·push가 종료 코드 0이다.
- `git status --porcelain`에 이 task가 소유한 미반영 변경이 없다.
- `index.json`이 `status: "completed"`이고 모든 phase가 `completed`다.

## 의도 메모

- 계획 문서 commit `af3b72c`는 확정 설계 근거이므로 수정하거나 squash하지 않는다.
- 제품 코드와 task 상태는 한 구현 commit에 포함하되 관련 없는 작업은 분리한다.

## Blocked 조건

- 예상 브랜치가 아니면 `PHASE_BLOCKED: 예상 외 브랜치 — feat/041-feat-loadbalancer-ipacl-read 필요`를 보고한다.
- push가 실패하면 `PHASE_BLOCKED: push 실패 — 원격 상태 확인 필요`를 보고하고 완료를 주장하지 않는다.
