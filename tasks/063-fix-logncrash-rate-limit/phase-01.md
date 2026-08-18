# Phase 01 — 봉투 resultCode 보존과 rate limit 판별

**Execution profile**: standard

---

## 목표

Log & Crash 의 조회 횟수 제한을 CLI 가 다른 오류와 구분해 안내하게 만든다.

지금은 구분할 수단이 없다.
rate limit 은 HTTP 429 가 아니라 **HTTP 200 에 봉투 실패**로 오고, 봉투에만 `resultCode: 429` 가 실린다.
그런데 `src/api/envelope.ts` 의 `unwrapHeader` 가 `resultMessage` 만 메시지에 담고 `resultCode` 를 버려서, 호출부가 원인을 알 수 없다.

이 phase 는 `resultCode` 를 오류 객체에 보존하고 `search` 가 그것으로 안내를 가른다.

**범위 외**: `export` 의 부분 결과 보존과 안내 문구 교체는 phase-02 가 맡는다.
사용자 가이드 갱신은 phase-03 이 맡는다.
`search` 가 500 을 받았을 때의 기존 안내는 그대로 둔다 — 그 500 의 원인은 이번 범위에서 규명되지 않았다.
잔여 토큰 조회 엔드포인트는 쓰지 않는다. 공개 API 가이드에 없어 [[adr-030]] 과 [[adr-032]] 가 모두 배제했다.

근거는 `docs/adr/032-logncrash-rate-limit.md` 다. 착수 전에 읽는다.

---

## 작업 항목 (3)

### 1. `src/api/envelope.ts` — 봉투 실패 오류에 `resultCode` 를 보존한다

`NhnCloudCliError` 를 상속한 `NhnEnvelopeError` 를 추가하고 `unwrapHeader` 가 이것을 던지게 한다.

```ts
export class NhnEnvelopeError extends NhnCloudCliError {
  public readonly resultCode: number | string;
}
```

- 생성자는 `(resultCode: number | string, resultMessage: string)` 를 받는다.
- `super()` 에 넘기는 메시지는 **기존과 완전히 같은** `` `API 오류: ${resultMessage}` `` 이고 exit code 도 `EXIT_API_ERROR` 그대로다.
- `this.name = "NhnEnvelopeError"` 를 설정한다.
- `unwrapHeader` 는 `NhnCloudCliError` 대신 이 클래스를 던진다. 다른 변경은 없다.

기존 호출부는 전부 `NhnCloudCliError` 로 잡으므로 하위 클래스라 그대로 동작한다.
메시지와 exit code 를 바꾸면 다른 서비스의 출력 계약이 깨진다. 바꾸지 않는다.

### 2. `src/services/logncrash/errors.ts` — rate limit 판별을 추가한다

```ts
export const RATE_LIMIT_RESULT_CODE = 429;
export function isRateLimitError(err: unknown): boolean
```

- `err` 가 `NhnEnvelopeError` 이고 `Number(err.resultCode) === RATE_LIMIT_RESULT_CODE` 일 때만 `true` 다.
- `resultCode` 는 서비스마다 `number` 와 `string` 이 섞이므로([[adr-006]]) `Number()` 로 변환해 비교한다.
- HTTP 상태로 판정하지 않는다. 실제 응답이 200 이라 상태로는 걸리지 않는다.

### 3. `src/commands/logncrash/search.ts` — rate limit 안내를 가른다

현재 catch 는 `LogncrashServerError`(500)만 분기한다.
그보다 **앞에** rate limit 분기를 넣는다. 두 조건은 배타적이지만 순서를 고정해 의도를 드러낸다.

rate limit 이면 원본 메시지 뒤에 줄바꿈으로 아래 문장을 붙여 `NhnCloudCliError` 로 다시 던진다.

```
조회 횟수 제한에 걸렸습니다. 시간을 두고 다시 실행하세요. 검색 기간을 좁혀도 풀리지 않습니다.
```

- exit code 는 `EXIT_API_ERROR` 를 유지한다.
- 회복 속도나 소모량을 숫자로 적지 않는다. 측정값이지 서버 계약이 아니다([[adr-032]]).
- `stopSpinner(false)` 는 기존처럼 분기 전에 한 번만 호출한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/api/envelope.ts` | 수정 — `NhnEnvelopeError` 추가 |
| `src/api/envelope.test.ts` | 수정 — `resultCode` 보존과 기존 메시지 유지 검증 |
| `src/services/logncrash/errors.ts` | 수정 — `isRateLimitError` 추가 |
| `src/services/logncrash/errors.test.ts` | 수정 — 판별 검증 |
| `src/commands/logncrash/search.ts` | 수정 — rate limit 안내 분기 |
| `src/commands/logncrash/search.test.ts` | 수정 — 안내 문구와 exit code 검증 |

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm test
pnpm run build
```

pnpm 이 `ERR_PNPM_IGNORED_BUILDS` 로 실패하면 `./node_modules/.bin/tsc`,
`./node_modules/.bin/vitest run`, `./node_modules/.bin/tsup` 을 직접 실행한다.

추가 기준이다.

```bash
# cwd: <repo root>
# 기존 봉투 오류 메시지 형식이 유지됐는지 — 1 이 나와야 한다
grep -cF 'API 오류: ' src/api/envelope.ts || true

# HTTP 상태로 rate limit 을 판정하지 않는지 — 출력이 없어야 한다
grep -n 'status === 429' src/services/logncrash/errors.ts || true
```

테스트는 아래 세 가지를 각각 덮는다.

- `unwrapHeader` 가 봉투 실패에서 `resultCode` 를 보존하고 메시지는 기존과 같다.
- `isRateLimitError` 가 `429` 와 `"429"` 를 모두 참으로, 다른 코드와 `HTTPError` 를 거짓으로 판정한다.
- `search` 가 rate limit 에서 기간을 좁히라고 안내하지 **않는다**.

## 의도 메모 (왜)

- `resultCode` 를 공통 봉투 계층에 보존하는 이유는 판별 근거가 봉투에만 있기 때문이다.
  logncrash 쪽에서 메시지 문자열을 정규식으로 훑는 방법도 있지만, 서버 문구가 바뀌면 조용히 깨진다.
- 메시지와 exit code 를 그대로 두는 이유는 이 오류가 전 서비스 공용이기 때문이다.
  하위 클래스로 넓히기만 하면 기존 계약이 유지된다.
- 이 phase 가 phase-02 의 전제를 만든다. `export` 도 같은 판별 함수를 쓴다.
