# Phase 02 — 전역 --request-timeout 옵션과 타임아웃 오류 안내

**Execution profile**: standard
**Status**: pending

---

## 목표

전역 옵션 `--request-timeout <sec>` 과 `NHNCLOUD_REQUEST_TIMEOUT` 환경변수로 요청 상한을 조절할 수 있게 하고, 타임아웃으로 실패했을 때 조정 방법을 오류 메시지에 노출한다.

**범위 외**: `README.md` 와 `skills/nhncloud-cli/references/` 갱신은 Phase 3 이다. service client 파일은 이 phase 에서 건드리지 않는다 (Phase 1 이 이미 처리했다).

---

## 실행 전제

```bash
# cwd: <repo root>
# branch: feat/052-global-request-timeout
set -e
test -f src/api/timeout.ts
rg -q 'export function setRequestTimeoutMs' src/api/timeout.ts
rg -q 'export function getRequestTimeoutMs' src/api/timeout.ts
```

Phase 1 이 만든 `src/api/timeout.ts` 를 전제한다. 없으면 `PHASE_BLOCKED: Phase 1 산출물 부재` 를 보고하고 멈춘다.

---

## 작업 항목 (4)

### 1. `src/index.ts` — 전역 옵션 정의

기존 전역 옵션 정의 자리(`.option("--no-color", ...)` 다음)에 한 줄을 더한다.

```
.option("--request-timeout <sec>", "HTTP 요청 타임아웃 (초, 기본 30, 범위 1~3600). NHNCLOUD_REQUEST_TIMEOUT 로도 지정")
```

**기본값 인자를 주지 않는다.** `.option(flag, desc, "30")` 처럼 Commander 기본값을 넣으면 `opts.requestTimeout` 이 항상 채워져 환경변수를 읽을 기회가 사라진다. 값이 `undefined` 인 것이 "옵션 미지정" 신호다.

`--page` 처럼 기본값을 주는 기존 옵션과 다른 점이므로, 그 이유를 1줄 주석으로 남긴다.

### 2. `src/index.ts` — `preAction` 훅에서 해석과 주입

기존 `program.hook("preAction", ...)` 안, `setQuiet(true)` 처리 옆에 타임아웃 해석을 더한다.

우선순위는 **옵션 > 환경변수 > 기본값 30초**다. `docs/data-schema.md` 의 profile 해석 순서와 같은 결이다.

- `opts.requestTimeout` 이 있으면 `parseIntegerOption(opts.requestTimeout, "--request-timeout", { min: 1, max: 3600 })`
- 없고 `process.env["NHNCLOUD_REQUEST_TIMEOUT"]` 이 있으면 같은 함수에 flag 자리로 `"NHNCLOUD_REQUEST_TIMEOUT"` 을 넘긴다 — 오류 메시지가 사용자가 실제로 쓴 이름을 가리켜야 한다
- 둘 다 없으면 아무것도 하지 않는다 (모듈 기본값 30초 유지)
- 값이 있으면 `setRequestTimeoutMs(sec * 1000)` 호출

`parseIntegerOption` 은 `src/commands/parse-options.ts` 에서 import 한다. 이미 정수 표기·범위·빈 문자열을 함께 검증하고 `EXIT_PARAM_ERROR` 로 던지므로 새 파서를 만들지 않는다.

검증이 `preAction` 에 있으므로 잘못된 값은 **API 호출과 자격증명 로드 이전에** 걸러진다.

### 3. `src/api/httpError.ts` — `TimeoutError` 분기 추가

현재 ky `TimeoutError` 는 `err instanceof Error` 분기로 떨어져 `Request timed out: POST <url>` 원문이 그대로 노출된다. 사용자는 상한이 몇 초인지, 어떻게 늘리는지 알 수 없다.

`HTTPError` 분기 **앞이 아니라 뒤, 일반 `Error` 분기 앞**에 `TimeoutError` 분기를 넣는다. 두 클래스 모두 `ky` 에서 import 한다.

- exit code 는 `EXIT_API_ERROR` 로 기존과 같게 유지한다 — 종료 코드 계약을 바꾸지 않는다
- 메시지에 `getRequestTimeoutMs()` 로 읽은 현재 상한(초)과 `--request-timeout <초>` 로 늘릴 수 있다는 안내를 담는다
- 원본 `err.message` 는 보존한다. 어떤 요청이 끊겼는지가 진단에 필요하다

### 4. 테스트 추가

`src/api/httpError.test.ts` 에 `TimeoutError` 케이스를 더한다. 기존 파일의 단언 방식을 따른다.

- `new TimeoutError(new Request("https://example.com"))` 을 넘기면 `exitCode` 가 `EXIT_API_ERROR` 다
- 메시지에 현재 상한과 `--request-timeout` 이 모두 들어 있다
- `setRequestTimeoutMs(120_000)` 후에는 메시지의 상한이 120 으로 바뀐다. 단언 후 `setRequestTimeoutMs(30_000)` 로 되돌린다

`instanceof` 분기를 타야 하므로 **실제 `TimeoutError` 인스턴스**를 만든다. `{ name: "TimeoutError" }` 같은 평범한 객체는 분기를 타지 않아 다른 경로로 빠지고, 우연히 같은 값이 나오면 잘못된 이유로 통과한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/index.ts` | 수정 (전역 옵션 정의, `preAction` 주입) |
| `src/api/httpError.ts` | 수정 (`TimeoutError` 분기) |
| `src/api/httpError.test.ts` | 수정 (케이스 추가) |

## 검증

```bash
# cwd: <repo root>
# branch: feat/052-global-request-timeout
# shell: bash 또는 zsh — POSIX sh 로 실행하지 않는다 (함수 안에서 local 을 쓴다)
set -e
pnpm run build

# 1. 전역 옵션이 root help 에 노출된다
node dist/index.js --help | grep -q -- "--request-timeout"

# 2. 기본값 인자를 주지 않았다 — help 에 (default: 가 붙지 않는다
node dist/index.js --help | grep -- "--request-timeout" | grep -vq "default:"

# 3. 서브커맨드 뒤에 붙여도 파싱된다 (전역 옵션 위치 무관)
node dist/index.js commands --request-timeout 60 --json >/dev/null

# 4. 범위 밖 값은 API 호출 전에 exit 3 으로 거부된다
#    set -e 아래에서는 실패 명령을 `|| code=$?` 로 받아야 스크립트가 죽지 않는다
exit_code_of() { local c=0; "$@" >/dev/null 2>&1 || c=$?; echo "$c"; }
test "$(exit_code_of node dist/index.js commands --request-timeout 0)" = "3"
test "$(exit_code_of node dist/index.js commands --request-timeout 4000)" = "3"
test "$(exit_code_of node dist/index.js commands --request-timeout abc)" = "3"
test "$(exit_code_of node dist/index.js commands --request-timeout 3600 --json)" = "0"

# 5. 환경변수도 같은 검증을 받는다
test "$(NHNCLOUD_REQUEST_TIMEOUT=4000 exit_code_of node dist/index.js commands)" = "3"
test "$(NHNCLOUD_REQUEST_TIMEOUT=60 exit_code_of node dist/index.js commands --json)" = "0"

# 6. 환경변수 오류 메시지가 환경변수 이름을 가리킨다
NHNCLOUD_REQUEST_TIMEOUT=0 node dist/index.js commands 2>&1 | grep -q "NHNCLOUD_REQUEST_TIMEOUT"

# 7. 타입·테스트
pnpm tsc --noEmit 2>&1 | grep -c '^src/' | grep -qx 0
pnpm test

# 8. 명령 수는 그대로다 (전역 옵션은 카탈로그 항목을 늘리지 않는다)
test "$(node dist/index.js commands --json | python3 -c 'import json,sys;print(len(json.load(sys.stdin)["commands"]))')" = "149"

git diff --check
```

## 의도 메모 (왜)

- `--timeout` 을 쓰지 않는 이유는 `instance create` 와 `ncs workload create` 가 그 이름을 상태 폴링 대기 시간으로 이미 쓰기 때문이다. 한 이름이 두 의미가 되면 `--wait --timeout` 조합의 해석이 갈린다 (ADR-026).
- 검증을 `preAction` 에 두는 이유는 잘못된 값이 자격증명 로드나 API 호출을 먼저 밟지 않게 하기 위해서다.
- 오류 메시지에 상한과 조정 방법을 넣는 이유는 옵션을 만들어도 사용자가 존재를 모르면 쓰이지 않기 때문이다. 이슈 #67 의 사용자는 회피 수단을 찾지 못해 스크립트 바깥에서 재호출하고 있었다.
- exit code 를 바꾸지 않는 이유는 타임아웃이 이미 `EXIT_API_ERROR` 로 나가고 있어, 바꾸면 기존 자동화의 분기가 깨지기 때문이다.

## Blocked 조건

- `src/api/timeout.ts` 가 없으면 `PHASE_BLOCKED: Phase 1 산출물 부재` 를 보고하고 멈춘다.
