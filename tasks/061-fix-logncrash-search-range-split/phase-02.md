# Phase 02 — search 의 500 안내와 export 의 적응형 기간 분할

**Execution profile**: standard

---

## 목표

`search` 는 500 을 받았을 때 원인을 단정하지 않는 안내와 `requestId` 를 보여 준다.
`export` 는 500 을 만나면 기간을 절반으로 줄여 다시 시도해 전량 추출을 끝낸다.

결정 근거는 `docs/adr/030-logncrash-search-range-adaptive-split.md` 다. 먼저 읽어라.

phase 01 이 만든 아래가 실재해야 한다. 없으면 `PHASE_BLOCKED` 를 보고하고 멈춘다.

- `LogncrashServerError`·`toLogncrashError` (`src/services/logncrash/errors.ts`)
- `splitTimeRange`·`MIN_SPLIT_WINDOW_MS` (`src/utils/time.ts`)

**이 phase 도 실제 Log & Crash API 를 호출하지 않는다.** 테스트는 client 를 mock 한다.

---

## 작업 항목 (3)

### 1. `src/commands/logncrash/search.ts` — 500 안내

`LogncrashServerError` 를 잡아 안내를 덧붙인 뒤 다시 던진다. 분할하지 않는다.

안내에 담을 것과 담지 않을 것을 구분한다.

- 담는다 — 기간을 줄여 다시 시도하거나 `export` 를 쓰라는 제안, 서버 `requestId`
- 담지 않는다 — "기간이 상한을 넘었습니다" 같은 단정.
  서버가 원인을 주지 않아 CLI 가 확정할 수 없다(ADR-030)

문구는 추정임이 드러나게 쓴다. 예: `검색 기간이 넓어 서버가 처리하지 못했을 수 있습니다.`

`requestId` 가 `null` 이면 그 부분을 빼고 나머지만 낸다.
외부 문자열이므로 출력 전에 정제한다 — `src/commands/apigateway/helpers.ts` 의 `sanitizeForTerminal`
같은 처리가 이 명령군에 없으면 제어 문자를 치환하는 최소 처리를 그 자리에서 한다.

`--cursor` 계약은 건드리지 않는다. `search` 는 분할하지 않는다.

### 2. `src/commands/logncrash/export.ts` — 적응형 분할

현재 흐름은 전체 기간으로 `scrollStart` 한 뒤 `scrollNext` 를 반복해 temp 파일에 append 한다.
이 구조를 유지하고 바깥에 창 루프를 감싼다.

동작 순서다.

1. 전체 기간을 창 하나로 두고 시작한다
2. 그 창에서 `scrollStart`~`scrollNext` 를 끝까지 돌린다
3. `LogncrashServerError` 가 나오면 현재 창 크기를 절반으로 줄여 그 구간을 다시 나눈다
4. 성공한 창 크기를 기억해 남은 구간에 그대로 적용한다. 매 구간마다 다시 탐색하지 않는다
5. 창 크기가 `MIN_SPLIT_WINDOW_MS` 아래로 내려가야 하면 분할을 멈추고 오류로 끝낸다

지켜야 할 것들이다.

- **부분 파일을 남기지 않는다.** 어느 창이든 최종 실패하면 기존 `catch` 처럼 stream 을 닫고
  temp 를 지운 뒤 던진다. 기존 코드의 `stream.once("close", ...)` 대기 주석이 설명하는 이유가
  그대로 유효하니 그 처리를 재사용한다
- **누적 건수 상한은 전체 기준이다.** `MAX_TOTAL` 은 창별이 아니라 파일 전체에 적용한다.
  상한에 닿으면 남은 창을 돌지 않고 멈추며, 기존과 같이 잘렸음을 stderr 로 알린다
- **JSON 배열 형식의 구분자를 창 경계에서 틀리지 않는다.**
  `format === "json"` 일 때 `first` 플래그는 파일 전체에서 하나여야 한다.
  창마다 초기화하면 `][` 나 `,,` 가 생긴다
- **진행 표시는 `spinner.text` 로만 갱신한다.** 기존 주석이 "별도 stderr.write 는 ora 와
  줄이 뒤섞인다" 고 적은 그대로다. 창이 여럿이면 `창 2/5` 처럼 함께 보여 준다
- **500 이 아닌 오류는 재시도하지 않는다.** 인증 실패나 입력 오류를 기간 문제로 오인해
  헛되이 쪼개면 안 된다. `LogncrashServerError` 만 분할 신호로 쓴다

### 3. `src/commands/logncrash/export.test.ts` 와 `search.test.ts` — 계약 테스트

action 레벨 하네스는 이 명령군의 기존 테스트 방식을 따른다.
없으면 `src/commands/apigateway/commands.test.ts:13-44` 의 패턴(`vi.mock` 세 개, 가짜 client,
`programWith`, `exitOverride`)을 옮겨 온다. 테스트를 위해 내부 함수를 새로 export 하지 않는다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/commands/logncrash/search.ts` | 수정 |
| `src/commands/logncrash/export.ts` | 수정 |
| `src/commands/logncrash/export.test.ts` | 신규 또는 수정 |
| `src/commands/logncrash/search.test.ts` | 신규 또는 수정 |

## 검증

```bash
# cwd: <repo root>
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run
./node_modules/.bin/tsup

# search 는 분할하지 않는다 — 분할 유틸을 쓰지 않는다
test "$(grep -c 'splitTimeRange' src/commands/logncrash/search.ts)" = "0"

# export 는 분할 유틸과 500 전용 오류를 모두 쓴다
grep -q 'splitTimeRange' src/commands/logncrash/export.ts
grep -q 'LogncrashServerError' src/commands/logncrash/export.ts

# 진행 표시가 spinner 를 우회하지 않는다 (기존에도 0 이다)
test "$(grep -c 'process.stderr.write' src/commands/logncrash/export.ts)" = "0"

# 명령 표면이 늘지 않았다 — 이 plan 은 옵션을 추가하지 않는다
BEFORE="$(git show origin/main:src/commands/logncrash/export.ts | grep -c '\.option(')"
test "$(grep -c '\.option(' src/commands/logncrash/export.ts)" = "$BEFORE"

git diff --check
```

테스트에 아래를 넣는다.

- `search` — `LogncrashServerError` 에 안내와 `requestId` 가 붙어 다시 던져진다
- `search` — `requestId` 가 `null` 이면 그 부분 없이 안내만 나온다
- `search` — 401 은 안내가 붙지 않고 그대로 전달된다
- `export` — 첫 호출이 500 이면 절반 창으로 재시도해 끝까지 추출한다
- `export` — 성공한 창 크기를 남은 구간에 재사용한다 (호출 인자로 확인)
- `export` — 최소 창에서도 500 이면 오류로 끝나고 결과 파일이 생기지 않는다
- `export` — 500 이 아닌 오류는 재시도하지 않는다 (호출 횟수로 확인)
- `export` — `--format json` 에서 창이 여럿이어도 배열 구분자가 올바르다

## 의도 메모 (왜)

- 전체 기간을 먼저 시도하는 이유는 상한이 프로젝트마다 다르기 때문이다(ADR-030).
  작은 창으로 시작하면 로그가 적은 프로젝트에서 불필요하게 여러 번 부른다.
- 성공 크기를 재사용하는 이유는 그 탐색 비용을 한 번으로 묶기 위해서다.
- `search` 를 분할하지 않는 이유는 `--cursor` 페이지 이동 계약([[adr-024]])과 충돌해서다.
  창마다 커서가 따로 생기면 사용자에게 무엇을 돌려줄지 정할 수 없다.
