# Phase 01. HTTP 오류 본문 읽기를 src/api 로 모은다

**Execution profile**: standard

## 목표

세 서비스가 각자 구현한 "`HTTPError` 응답 본문을 JSON 으로 읽고, 실패하면 무시한다" 를 `src/api/httpError.ts` 의 함수 하나로 모은다.
본문을 해석하는 규칙(어느 필드를 꺼내 어떤 메시지로 만드는가)은 지금처럼 각 서비스에 둔다.

**범위 외**: 오류 메시지 문구, 종료 코드, 서비스별 판정 조건(상태 코드 집합 등)은 바꾸지 않는다.
봉투 오류(HTTP 200 의 `header.isSuccessful: false`)는 이 phase 와 관계없다.

## 컨텍스트

지금 본문을 읽는 곳은 셋이다. 셋 다 `try { await ...json() } catch { /* 무시 */ }` 형태다.

| 파일 | 함수 | 읽는 조건 | 꺼내는 값 | `clone()` |
|---|---|---|---|---|
| `src/services/network/errors.ts` | `toNetworkWriteError` | 상태 400·409 (`REJECTION_STATUSES`) | `NeutronError.message` 를 메시지 뒤에 `\n서버 응답: ...` 로 덧붙임 | 안 함 |
| `src/services/logncrash/errors.ts` | `toLogncrashError` | 상태 500 | `requestId` 를 `LogncrashServerError` 에 보존 | 안 함 |
| `src/services/skm/client.ts` | `toSkmError` (모듈 내부 함수) | 모든 `HTTPError` | `header.resultMessage` 로 메시지를 교체 | 함 |

공용 변환 `toNhnCloudCliError` 는 `src/api/httpError.ts` 에 있고 본문을 읽지 않는다.

**근거 문서**: `docs/code-architecture.md` 의 「명령 실행 경계」 절. HTTP 오류 본문은 `readHttpErrorBody` 로 읽고 해석은 서비스가 맡는다고 적혀 있다.
`docs/adr/002-ky-http-client.md`, `docs/adr/006-nhn-response-envelope.md`.

## 의도 메모

- 해석까지 공통화하지 않는다. 세 서비스의 꺼내는 필드와 결과 형태(덧붙임, 별도 예외 클래스, 메시지 교체)가 모두 달라, 합치면 옵션 객체만 늘어난다.
- 공통 함수는 `err.response.clone().json()` 을 쓴다. `Response` 본문은 한 번만 읽을 수 있어, `clone()` 없이 읽으면 같은 오류를 두 번 변환할 때 두 번째 읽기가 실패한다.
  지금 `network` 와 `logncrash` 는 `clone()` 을 쓰지 않으므로 이 phase 로 그 차이가 없어진다.
- 반복 함정 `docs/pitfalls/code-review/mock-reject-value-mismatch.md`, `docs/pitfalls/plan/test-expected-value-guessed.md` 를 읽는다.
  테스트의 `HTTPError` 는 기존 테스트처럼 실제 `Response` 로 만든다. 평범한 객체로 흉내 내면 `instanceof HTTPError` 분기를 타지 않는다.

## 작업 항목

### 1. `src/api/httpError.ts` 에 `readHttpErrorBody` 추가

```ts
/**
 * HTTP 오류 응답의 본문을 JSON 으로 읽는다. 본문이 비었거나 JSON 이 아니면 undefined 를 돌려준다.
 * 본문 해석은 각 서비스가 맡는다. 원본 응답을 소비하지 않도록 복제본을 읽는다.
 */
export async function readHttpErrorBody(err: HTTPError): Promise<unknown>
```

- 구현은 `try { return await err.response.clone().json(); } catch { return undefined; }` 다.
- 인자 타입은 `HTTPError` 다. `instanceof` 판정은 호출하는 쪽이 이미 한다.

### 2. 세 서비스가 `readHttpErrorBody` 를 쓰게 바꾼다

- `src/services/network/errors.ts` 의 `toNetworkWriteError`: `try/catch` 와 `err.response.json()` 을 `const body = await readHttpErrorBody(err);` 로 바꾼다. 이후 `NeutronError.message` 추출과 메시지 조립은 그대로 둔다.
- `src/services/logncrash/errors.ts` 의 `toLogncrashError`: 같은 방식으로 바꾼다. `requestId` 추출과 `LogncrashServerError` 생성은 그대로 둔다.
- `src/services/skm/client.ts` 의 `toSkmError`: 같은 방식으로 바꾼다. `header.resultMessage` 추출, `sanitizeForTerminal`, 401·403 의 `EXIT_AUTH_ERROR` 판정은 그대로 둔다.
- 각 파일에서 쓰지 않게 된 import 가 있으면 지운다.

### 3. `src/api/httpError.test.ts` 에 `readHttpErrorBody` 테스트 추가

기존 `src/services/network/errors.test.ts` 의 `makeHttpError(status, body)` 처럼 실제 `Response` 와 `Request` 로 `HTTPError` 를 만든다.

- JSON 본문(`{"a":1}`) 이면 `{ a: 1 }` 을 돌려준다.
- JSON 이 아닌 본문(`"not json"`)이면 `undefined` 를 돌려준다.
- 빈 본문이면 `undefined` 를 돌려준다.
- 같은 오류로 두 번 부르면 두 번 다 같은 객체를 돌려준다. `clone()` 을 빠뜨리면 실패하는 테스트다.

### 4. 기존 서비스 테스트는 그대로 통과해야 한다

`src/services/network/errors.test.ts`, `src/services/logncrash/errors.test.ts`, `src/services/skm/client.test.ts` 의 기대값은 바꾸지 않는다.
바꿔야 통과한다면 동작이 바뀐 것이므로 멈추고 원인을 찾는다.

## 검증

```bash
node_modules/.bin/vitest run src/api/httpError.test.ts src/services/network/errors.test.ts src/services/logncrash/errors.test.ts src/services/skm/client.test.ts
node_modules/.bin/tsc --noEmit
node_modules/.bin/vitest run
grep -rn "response.json()\|response.clone().json()" src --include='*.ts' | grep -v '\.test\.ts'
```

- 마지막 grep 은 `src/api/httpError.ts` 한 줄만 나와야 한다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `src/api/httpError.ts` | 수정 |
| `src/api/httpError.test.ts` | 수정 |
| `src/services/network/errors.ts` | 수정 |
| `src/services/logncrash/errors.ts` | 수정 |
| `src/services/skm/client.ts` | 수정 |
