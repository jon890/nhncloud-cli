# Phase 04 — 브랜치 검증과 commit·push

**Execution profile**: fast
**Status**: pending

---

## 목표

Phase 01–03 산출물과 검증 근거를 확인하고 task 완료 상태와 실행 기록을 갱신한다.
executor는 commit·push하지 않고 team-lead에게 검증 결과와 변경 경로를 인계한다.

**범위 외**: PR 생성, merge, 후속 쓰기 plan 실행은 executor가 수행하지 않는다.

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

### 4. 실행 기록과 team-lead 인계

`git status --porcelain`로 변경 파일을 확인한다.
`docs/retrospectives/RUNS.md`에 `build-with-teams` 실행 기록 한 줄을 추가한다.
이번 task의 코드, 테스트, README, skill reference, task 상태와 실행 기록 경로를 team-lead에게 보고한다.
team-lead는 phase별 atomic commit과 최종 push를 소유하며 `git add -A`를 사용하지 않는다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| Phase 01–03의 Critical Files | 최종 확인 |
| `tasks/041-feat-loadbalancer-ipacl-read/index.json` | completed 마킹 |
| `docs/retrospectives/RUNS.md` | build-with-teams 실행 기록 |

## 최종 검증

```bash
# cwd: <repo root>
set -e
git branch --show-current
git status --porcelain
pnpm tsc --noEmit
pnpm test
pnpm run build
node dist/index.js commands --json | jq -e '.commands | length == 141'
node dist/index.js commands --json | jq -e '
  .commands | map(.path) as $paths
  | ["loadbalancer list", "loadbalancer get", "loadbalancer ipacl list", "loadbalancer ipacl get", "loadbalancer ipacl target list"]
  | all(. as $path | ([ $paths[] | select(. == $path) ] | length) == 1)
'
node dist/index.js loadbalancer --help | grep -E "Agent workflow|loadbalancer list --json|loadbalancer ipacl list --json"
git diff --check
```

```bash
# cwd: <repo root>
if grep -rnoE "(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)" README.md skills/ docs/ AGENTS.md CLAUDE.md src/ 2>/dev/null \
  | grep -vE "nhncloud\.com|nhncloudservice\.com|github\.com|npmjs\.com|example\.com|openai\.com|anthropic\.com"; then
  exit 1
fi
if grep -rnE "(secret|password|appkey)['\"]?[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9]{16,}" README.md skills/ docs/ AGENTS.md CLAUDE.md src/ 2>/dev/null; then
  exit 1
fi
```

성공 기준:

- 첫 명령 출력이 `feat/041-feat-loadbalancer-ipacl-read`다.
- 검증 명령이 종료 코드 0이다.
- `git status --porcelain`에 이 task가 소유한 미반영 변경이 없다.
- `index.json`이 `status: "completed"`이고 모든 phase가 `completed`다.

## 의도 메모

- 계획 문서 commit `af3b72c`는 확정 설계 근거이므로 수정하거나 squash하지 않는다.
- executor는 커밋하지 않고 team-lead가 phase별 관심사 경계를 확인해 원자적으로 커밋한다.

## Blocked 조건

- 예상 브랜치가 아니면 `PHASE_BLOCKED: 예상 외 브랜치 — feat/041-feat-loadbalancer-ipacl-read 필요`를 보고한다.
- 최종 검증이 실패하면 `PHASE_BLOCKED: 최종 검증 실패 — 관련 phase 수정 필요`를 보고하고 완료를 주장하지 않는다.
