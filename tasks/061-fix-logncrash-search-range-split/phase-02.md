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
외부 문자열이므로 출력 전에 정제한다.
같은 이름의 헬퍼가 이미 두 벌 있다 — `src/commands/apigateway/helpers.ts` 와
`src/commands/loadbalancer/rebind.ts`. **세 번째 사본을 만들지 않는다.**
둘 중 하나를 import 하거나 공용 위치로 올린다. 어느 쪽을 택했는지 완료 보고에 적는다.

`--cursor` 계약은 건드리지 않는다. `search` 는 분할하지 않는다.

### 2. `src/commands/logncrash/export.ts` — 적응형 분할

현재 흐름은 전체 기간으로 `scrollStart` 한 뒤 `scrollNext` 를 반복해 temp 파일에 append 한다.
이 구조를 유지하고 바깥에 창 루프를 감싼다.

동작 순서다.

1. 전체 기간을 창 하나로 두고 시작한다
2. **창에 들어가기 전에 현재까지 쓴 바이트 위치와 `count` 를 기억한다**
3. 그 창에서 `scrollStart`~`scrollNext` 를 끝까지 돌린다
4. `LogncrashServerError` 가 나오면 **2번에서 기억한 지점까지 파일을 되돌린 뒤**
   현재 창 크기를 절반으로 줄여 그 구간을 다시 나눈다
5. 성공한 창 크기를 기억해 남은 구간에 그대로 적용한다. 매 구간마다 다시 탐색하지 않는다
6. 창 크기가 `MIN_SPLIT_WINDOW_MS` 아래로 내려가야 하면 분할을 멈추고 오류로 끝낸다

**4번의 되돌리기가 이 phase 의 핵심이다.** 500 은 `scrollStart` 직후만이 아니라
`scrollNext` 를 여러 번 성공한 뒤에도 난다. 그 시점에는 이미 `writePage` 가 temp 에 append 를 마쳤고,
같은 구간을 다시 돌면 그 로그가 파일에 두 번 들어간다.
스트림은 append-only 라 그냥 이어 쓰면 되돌릴 수 없으므로, 창 시작 시점의 바이트 위치를 남겨 두고
실패 시 그 길이로 잘라낸 뒤 이어 쓴다(`fs.truncate` 후 append 모드로 다시 연다).
`count` 와 `first`(JSON 배열 구분자 플래그)도 같은 지점으로 되돌린다.

지켜야 할 것들이다.

- **부분 파일을 남기지 않는다.** 어느 창이든 최종 실패하면 기존 `catch` 처럼 stream 을 닫고
  temp 를 지운 뒤 던진다. 기존 코드의 `stream.once("close", ...)` 대기 주석이 설명하는 이유가
  그대로 유효하니 그 처리를 재사용한다
- **누적 건수 상한과 전체 건수는 파일 전체 기준이다.** `MAX_TOTAL` 은 창별이 아니라 파일 전체에 적용한다.
  기존 절단 경고 조건은 `count >= MAX_TOTAL && total > MAX_TOTAL` 인데 `total` 이
  마지막 창의 `totalItems` 라면 파일이 상한에 닿아도 경고가 나가지 않는다.
  창별 `totalItems` 를 **합계로 누적**해 그 값을 조건과 진행 표시 분모에 쓴다.
  누적하지 않으면 `count/total` 분모가 창마다 리셋돼 진행률이 뒤로 가고,
  export.ts 의 "No-silent-caps" 계약이 깨진다
- **JSON 배열 형식의 구분자를 창 경계에서 틀리지 않는다.**
  `format === "json"` 일 때 `first` 플래그는 파일 전체에서 하나여야 한다.
  창마다 초기화하면 `][` 나 `,,` 가 생긴다
- **진행 표시는 `spinner.text` 로만 갱신한다.** 기존 주석이 "별도 stderr.write 는 ora 와
  줄이 뒤섞인다" 고 적은 그대로다. 창이 여럿이면 `창 2/5` 처럼 함께 보여 준다
- **500 이 아닌 오류는 재시도하지 않는다.** 인증 실패나 입력 오류를 기간 문제로 오인해
  헛되이 쪼개면 안 된다. `LogncrashServerError` 만 분할 신호로 쓴다
- **`scrollNextWithHint`(export.ts 하단)가 분할 신호를 삼키지 않게 한다.**
  이 함수는 `exitCode === EXIT_API_ERROR` 인 오류를 **새 `NhnCloudCliError` 로 감싸 던진다**.
  그대로 두면 `scrollNext` 중 발생한 500 이 `LogncrashServerError` 인스턴스를 잃어
  `instanceof` 검사를 통과하지 못하고 분할이 걸리지 않는다.
  긴 기간에서는 500 이 오히려 이 경로에서 나올 여지가 크다.
  `LogncrashServerError` 는 감싸지 말고 그대로 다시 던지도록 고친다.
  그 함수의 안내 문구("검색 범위를 좁혀 다시 실행하세요")는 분할이 자동으로 하는 일이 되었으므로
  500 경로에서는 더 이상 필요 없다

### 3. `src/commands/logncrash/export.test.ts` 와 `search.test.ts` — 계약 테스트

두 테스트 파일 모두 이미 있고 action 레벨 하네스도 갖춰져 있다
(`export.test.ts` 의 `vi.mock` 세 개·가짜 client·`programWithExport`, `search.test.ts` 도 같은 형태).
그 하네스를 그대로 쓴다. 새로 만들지 않고 테스트를 위해 내부 함수를 export 하지도 않는다.

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

# 실패한 창을 되돌리는 처리가 있다 (append-only 스트림의 중복 방지)
grep -qE 'truncate|bytesWritten' src/commands/logncrash/export.ts

# scrollNextWithHint 가 500 전용 오류를 감싸지 않는다
grep -q 'LogncrashServerError' src/commands/logncrash/export.ts

# 진행 표시가 spinner 를 우회하지 않는다.
# 기존 stderr.write 3곳(--size 폐기 경고·MAX_TOTAL 절단 경고·저장 완료)은 정당하므로 그대로 둔다.
# 창 진행 표시를 stderr 로 새로 뿌리지 않았는지만 본다 — 늘어나면 안 된다
BEFORE_ERR="$(git show origin/main:src/commands/logncrash/export.ts | grep -c 'process.stderr.write')"
test "$(grep -c 'process.stderr.write' src/commands/logncrash/export.ts)" = "$BEFORE_ERR"

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
- `export` — scrollNext 를 몇 번 성공한 뒤 500 이 나도 결과 파일에 로그가 중복되지 않는다
- `export` — scrollNext 경로의 500 도 분할을 발동시킨다 (scrollNextWithHint 가 신호를 삼키지 않는다)
- `export` — 창이 여럿일 때 전체 건수 분모가 창별 값으로 리셋되지 않는다
- `export` — 500 이 아닌 오류는 재시도하지 않는다 (호출 횟수로 확인)
- `export` — `--format json` 에서 창이 여럿이어도 배열 구분자가 올바르다

## 의도 메모 (왜)

- 전체 기간을 먼저 시도하는 이유는 상한이 프로젝트마다 다르기 때문이다(ADR-030).
  작은 창으로 시작하면 로그가 적은 프로젝트에서 불필요하게 여러 번 부른다.
- 성공 크기를 재사용하는 이유는 그 탐색 비용을 한 번으로 묶기 위해서다.
- `search` 를 분할하지 않는 이유는 `--cursor` 페이지 이동 계약([[adr-024]])과 충돌해서다.
  창마다 커서가 따로 생기면 사용자에게 무엇을 돌려줄지 정할 수 없다.
