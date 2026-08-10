# Phase 03 — 통합 검증과 사용자 가이드 docs 갱신

**Execution profile**: fast
**Status**: pending

---

## 목표

앞선 두 phase 의 산출물을 통합 검증하고, 사용자 가이드 문서에 새 전역 옵션을 반영한다.

**범위 외**: 결정 docs(`docs/adr/`·`docs/flow.md`·`docs/code-architecture.md`)는 planning 단계에서 이미 반영·커밋했다. 이 phase 에서 다시 고치지 않는다.
커밋·push·PR 생성은 이 phase 의 책임이 아니다 — team-lead 가 수행한다.

---

## 실행 전제

```bash
# cwd: <repo root>
# branch: feat/052-global-request-timeout
set -e
test -f src/api/timeout.ts
rg -q -- "--request-timeout" src/index.ts
rg -q "TimeoutError" src/api/httpError.ts
```

Phase 1·2 산출물이 없으면 `PHASE_BLOCKED: 선행 phase 미완` 을 보고하고 멈춘다.

---

## 작업 항목 (3)

### 1. `README.md` — 전역 옵션 서술 보강

"에이전트 없이 직접 쓰기" 절의 출력 모드 표 아래 문장을 고친다.

현재 문장은 이렇다.

```
전역 옵션이라 모든 명령에 붙일 수 있다. `--no-color` 도 함께 쓴다.
```

`--request-timeout` 을 같은 자리에 넣고, 짧은 설명 세 줄을 잇는다. README 는 라우터형이라 상세는 두지 않는다 — 범위·우선순위 표와 deploy 상한 규칙은 `references/common.md` 가 소유한다.

담을 것은 세 가지다.

- `--no-color` 와 `--request-timeout <sec>` 를 같은 자리에서 쓴다는 안내
- 초 단위이고 기본 30, 허용 1~3600 이라는 값 범위
- `NHNCLOUD_REQUEST_TIMEOUT` 로도 지정하며 옵션이 환경변수보다 우선한다는 것

### 2. `skills/nhncloud-cli/references/common.md` — 요청 타임아웃 절 신설

`## 출력 모드` 절 다음, `## Command catalog` 앞에 `## 요청 타임아웃` 절을 추가한다.
에이전트가 읽는 단일 소스이므로 여기에 상세를 담는다.

담을 것은 여섯 가지다.

- 기본 상한이 30초이고 넓은 기간 조회에서 걸릴 수 있다는 배경
- 전역 옵션과 환경변수 두 지정 방법을 실행 가능한 예제로 (`logncrash search` 기준)
- 단위는 초, 허용 1~3600, 범위 밖이면 API 호출 전에 exit code 3
- 우선순위는 옵션 > 환경변수 > 기본값 30초
- deploy 바이너리 업로드·다운로드 상한(600초)은 이 값이 600초보다 클 때만 따라 커지고, 낮춰도 끊기지 않는다는 것
- `instance create --timeout` 과 `ncs workload create --timeout` 은 상태 폴링 대기라 다른 축이라는 것

### 3. `index.json` 완료 마킹

`tasks/052-feat-global-request-timeout/index.json` 에서 task `status` 를 `completed`, `current_phase` 를 `3`, 세 phase 의 `status` 를 모두 `completed` 로 바꾼다.

`updated_at` 도 실행 시각으로 갱신한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `README.md` | 수정 (전역 옵션 서술) |
| `skills/nhncloud-cli/references/common.md` | 수정 (요청 타임아웃 절 신설) |
| `tasks/052-feat-global-request-timeout/index.json` | 수정 (완료 마킹) |

## 검증

```bash
# cwd: <repo root>
# branch: feat/052-global-request-timeout
# shell: bash 또는 zsh — POSIX sh 로 실행하지 않는다 (함수 안에서 local 을 쓴다)
set -e

# 1. 통합 빌드 검증
pnpm tsc --noEmit 2>&1 | grep -c '^src/' | grep -qx 0
pnpm test
pnpm run build

# 2. 사용자 가이드 두 곳이 새 옵션을 담는다
rg -q -- "--request-timeout" README.md
rg -q -- "--request-timeout" skills/nhncloud-cli/references/common.md
rg -q "NHNCLOUD_REQUEST_TIMEOUT" README.md
rg -q "NHNCLOUD_REQUEST_TIMEOUT" skills/nhncloud-cli/references/common.md
rg -q "^## 요청 타임아웃" skills/nhncloud-cli/references/common.md

# 3. 값이 문서 사이에서 일치한다 — 세 문서가 같은 범위를 말해야 한다
for f in docs/adr/026-request-timeout-global-control.md README.md skills/nhncloud-cli/references/common.md; do
  rg -q "3600" "$f"
done
rg -q "600" skills/nhncloud-cli/references/common.md

# 4. 실제 동작이 문서와 일치한다
exit_code_of() { local c=0; "$@" >/dev/null 2>&1 || c=$?; echo "$c"; }
node dist/index.js --help | grep -q -- "--request-timeout"
test "$(exit_code_of node dist/index.js commands --request-timeout 3600 --json)" = "0"
test "$(exit_code_of node dist/index.js commands --request-timeout 3601)" = "3"

# 5. 명령 카탈로그 수는 그대로다
test "$(node dist/index.js commands --json | python3 -c 'import json,sys;print(len(json.load(sys.stdin)["commands"]))')" = "149"

# 6. 결정 docs 는 이 phase 에서 바뀌지 않았다
git diff --quiet HEAD -- docs/adr docs/flow.md docs/code-architecture.md

# 7. 완료 마킹
test "$(python3 -c 'import json;d=json.load(open("tasks/052-feat-global-request-timeout/index.json"));print(d["status"],d["current_phase"],all(p["status"]=="completed" for p in d["phases"]))')" = "completed 3 True"

# 8. 사내 식별자·자격증명 노출 0건
test -z "$(grep -rnoE '(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)' README.md skills/ docs/ AGENTS.md CLAUDE.md src/ 2>/dev/null | grep -vE 'nhncloud\.com|nhncloudservice\.com|github\.com|npmjs\.com|example\.com|shields\.io|anthropic\.com|claude\.com')"

git diff --check
test "$(git status --porcelain | grep -c '^??')" = "0"
```

## 의도 메모 (왜)

- 사용자 가이드를 마지막 phase 에 두는 이유는 이 문서들이 코드 산출물에 의존하기 때문이다. `.claude/planning-overlay.md` 의 갱신 시점 분리 규칙을 따른다.
- 상세를 `references/common.md` 한 곳에만 두는 이유는 같은 정보를 두 문서에 쓰지 않기 위해서다. README 는 값 범위까지만 적고 규칙은 reference 로 넘긴다.
- 검증 6번이 결정 docs 무변경을 강제하는 이유는 planning 이 이미 커밋한 내용을 phase 가 덮어쓰면 이중 편집이 되기 때문이다.
- 커밋을 이 phase 에 넣지 않는 이유는 build-with-teams 에서 phase 단위 커밋이 team-lead 책임이기 때문이다. phase 가 `git commit` 을 담으면 두 주체가 같은 커밋을 만들려 해 충돌한다.

## Blocked 조건

- Phase 1·2 산출물이 없으면 `PHASE_BLOCKED: 선행 phase 미완` 을 보고하고 멈춘다.
