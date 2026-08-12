# Phase 01 — 서버 500 을 구분해 requestId 를 살리고 기간 분할 유틸을 만든다

**Execution profile**: standard

---

## 목표

Log & Crash 검색이 받는 HTTP 500 을 다른 오류와 구분하고, 응답 본문의 `requestId` 를 보존한다.
`export` 가 쓸 기간 분할 유틸도 함께 만든다.

결정 근거는 `docs/adr/030-logncrash-search-range-adaptive-split.md` 다. 먼저 읽어라.

**범위 외**: 명령 계층 변경은 phase 02 다. 이 phase 는 서비스·유틸 계층만 만든다.

**이 phase 는 실제 Log & Crash API 를 호출하지 않는다.** 테스트는 `ky` 를 mock 한다.

---

## 작업 항목 (3)

### 1. `src/services/logncrash/errors.ts` — 500 전용 오류 (신규)

```ts
export class LogncrashServerError extends NhnCloudCliError {
  readonly requestId: string | null;   // 본문에서 못 꺼내면 null
}
export async function toLogncrashError(err: unknown): Promise<NhnCloudCliError>
```

종료 코드는 `EXIT_API_ERROR` 로 고정한다. 500 은 서버 오류이고 기존 변환기도 5xx 를 그 코드로 다룬다.

`toLogncrashError` 는 `HTTPError` 이고 `status === 500` 일 때만 `LogncrashServerError` 를 만든다.
그 외는 기존 `toNhnCloudCliError(err)` 결과를 그대로 반환한다.

`requestId` 는 500 응답 본문에서 꺼낸다. 실측한 본문 형태는 아래와 같다.

```json
{ "timestamp": "...", "path": "/v3/<appkey>/logs/cursor", "status": 500, "error": "Internal Server Error", "requestId": "..." }
```

본문 파싱은 실패할 수 있으므로 `try`/`catch` 로 감싸고, 실패하면 `requestId` 를 `null` 로 둔다.
`err.response.json()` 은 한 번만 읽을 수 있으니 결과를 지역 변수에 담는다.
파싱 결과를 `as` 로 단언하지 않는다 — `unknown` 으로 받아 필드 타입을 확인한다.

메시지는 `toNhnCloudCliError` 의 형식(`API 호출 실패 (500): ...`)을 유지한다.
안내 문구를 붙이는 것은 명령 계층(phase 02)의 몫이다. 서비스 계층은 사실만 담는다.

`src/api/httpError.ts` 의 `toNhnCloudCliError` 는 **고치지 않는다.**
그 함수는 동기이고 모든 서비스가 공유한다. 응답 본문을 읽으려면 비동기가 되어야 해 파급이 크다.

### 2. `src/services/logncrash/client.ts` — 500 경로만 새 변환기로 교체

`cursorSearch`·`scrollStart`·`scrollNext` 세 메서드의 `catch` 를 바꾼다.

```ts
} catch (err) {
  throw await toLogncrashError(err);
}
```

`send` 는 collector 계열이라 검색 500 과 무관하다. 그대로 둔다.
어느 메서드가 collector 인지는 `src/services/logncrash/client.ts` 의 기존 주석과 [[adr-014]] 로 확인한다.

### 3. `src/utils/time.ts` — 기간 분할 유틸

```ts
export const MIN_SPLIT_WINDOW_MS = 10 * 60 * 1000;
export function splitTimeRange(fromIso: string, toIso: string, windowMs: number): Array<{ from: string; to: string }>
```

- 창은 `from` 부터 `windowMs` 씩 끊고 마지막 창의 끝은 `toIso` 로 맞춘다
- **경계를 밀지 않는다.** 이전 창의 `to` 와 다음 창의 `from` 을 같은 값으로 둔다.
  서버가 경계를 한쪽만 포함하는 것을 실측으로 확인했다 —
  4시간 구간을 2시간씩 두 창으로 나눠 조회했을 때 두 창의 `totalItems` 합이
  전체 조회값과 **정확히 일치**했다(541만 건 규모, 차이 0).
  경계를 밀면 오히려 그 폭만큼 로그가 빠진다.
  `toLocalISOString`(`src/utils/time.ts`)이 초 정밀도라 밀리초 단위 시프트는 표현할 수도 없다
- `windowMs` 가 전체 범위 이상이면 원래 범위 하나만 담은 배열을 반환한다
- `windowMs` 가 `MIN_SPLIT_WINDOW_MS` 미만이면 `NhnCloudCliError`(`EXIT_PARAM_ERROR`)로 거부한다.
  10분은 관측된 실패 경계(한쪽 6시간, 다른 쪽 10일)보다 충분히 아래라고 본 **추정값**이다.
  로그가 더 많은 프로젝트에서는 부족할 수 있어 phase 03 의 수동 QA 에서 재확인한다
- 출력은 입력과 같은 ISO8601 문자열 형식이다

기존 `assertSearchRange` 는 손대지 않는다. 90일·31일 사전 검증은 공식 문서 근거가 있어 유지한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/services/logncrash/errors.ts` | 신규 |
| `src/services/logncrash/client.ts` | 수정 |
| `src/utils/time.ts` | 수정 |
| `src/services/logncrash/errors.test.ts` | 신규 |
| `src/utils/time.test.ts` | 수정 |

## 검증

```bash
# cwd: <repo root>
# pnpm 이 의존성 재검사로 실패하면 로컬 바이너리를 직접 쓴다
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run
./node_modules/.bin/tsup

# 공용 오류 변환기를 건드리지 않았다
test "$(git diff origin/main --name-only -- src/api/httpError.ts | grep -c .)" = "0"

# 검색 세 메서드가 새 변환기를 쓴다 (send 는 제외라 3 이다)
# import 1줄 + catch 3줄 = 4 다. 호출만 세려면 아래처럼 좁힌다
test "$(grep -c 'await toLogncrashError' src/services/logncrash/client.ts)" = "3"

# 500 본문 파싱을 as 로 단언하지 않는다
test "$(grep -rnE 'json\(\).*\)\s+as\b' src/services/logncrash/errors.ts | grep -c .)" = "0"

# 분할 유틸과 최소 창 상수가 있다
grep -q 'MIN_SPLIT_WINDOW_MS' src/utils/time.ts
grep -q 'export function splitTimeRange' src/utils/time.ts

git diff --check
```

오류 변환 테스트는 **`src/services/logncrash/errors.test.ts` 를 새로 만들어** 넣는다.
`client.test.ts` 에 넣지 않는다 — 그 파일은 최상단에서 `vi.mock("ky")` 를 하는데
`toLogncrashError` 의 `err instanceof HTTPError` 는 실제 인스턴스를 요구한다.
mock 된 모듈과 실제 모듈이 엇갈리면 500 분기를 타지 않고 다른 이유로 통과한다.
실제 인스턴스를 만드는 선례가 있다 — `src/api/httpError.test.ts`,
`src/services/loadbalancer/client.test.ts` 의 `new HTTPError(response, request, {} as never)`.

테스트에 아래를 넣는다.

- `LogncrashServerError` — 500 응답에서 `requestId` 를 꺼내고 `exitCode` 가 `EXIT_API_ERROR` 다
- 500 본문이 JSON 이 아니거나 `requestId` 가 없으면 `null` 이 된다
- 401·403 은 기존과 같이 `EXIT_AUTH_ERROR` 로 남는다 (새 변환기가 그 경로를 바꾸지 않는다)
- `splitTimeRange` — 이전 창의 `to` 와 다음 창의 `from` 이 같고 마지막 창 끝이 `toIso` 와 같다
- `splitTimeRange` — `windowMs` 가 전체 범위 이상이면 창 1개
- `splitTimeRange` — `MIN_SPLIT_WINDOW_MS` 미만이면 `EXIT_PARAM_ERROR`

## 의도 메모 (왜)

- 500 만 따로 다루는 이유는 그 상태 코드에서만 기간을 줄여 재시도할 여지가 있기 때문이다.
  401·403·4xx 는 기간을 줄여도 같은 결과라 재시도가 낭비다.
- `requestId` 를 살리는 이유는 CLI 가 500 의 원인을 확정할 수 없기 때문이다(ADR-030).
  사용자가 서버 쪽에 문의할 때 그 값이 유일한 단서다.
- 창 경계를 밀지 않는 이유는 실측이 그렇게 나왔기 때문이다.
  문서가 `from`·`to` 의 포함 여부를 명시하지 않아 추측 대신 두 창의 합과 전체를 대조했고 차이가 0 이었다.
