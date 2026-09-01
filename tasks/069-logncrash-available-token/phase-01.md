# Phase 01: 조회 토큰 명령과 검색 전 차단 구현

**Execution profile**: standard

---

## 목표

공식 Search v3 `available-token` 응답을 CLI로 노출한다.
`search`와 `export`의 각 검색 요청 직전에 조회 토큰을 확인하고, 잔량이 0 이하면 검색 호출을 보내지 않은 채 추정 대기 시간을 안내한다.

**범위 외**: 자동 대기와 자동 재시도, 검색 호출 비용 예측, 새 설정·캐시·의존성, 500 적응형 기간 분할, 429 봉투 판별과 부분 결과 보존 정책은 바꾸지 않는다.
관측한 1.6 token/s는 서버 계약으로 단정하지 않고 추정 안내에만 사용한다.
양수 잔량은 검색 비용이 충분하다는 뜻으로 해석하지 않는다.
관리 문서와 공개 가이드는 planning 문서 커밋 `c0463d0`에서 먼저 갱신됐다.
구현이 문서 계약과 다르면 문서를 임의로 되돌리지 말고 Blocked 조건을 따른다.

---

## 작업 항목 (5)

### 1. 공식 조회 토큰 endpoint와 응답 가드를 추가한다

`src/services/logncrash/types.ts`에 다음 응답 타입과 가드를 추가한다.

```typescript
export interface AvailableTokenResult {
  availableToken: number;
}

export function isAvailableTokenResult(value: unknown): value is AvailableTokenResult
```

가드는 `availableToken`이 유한한 안전 정수인지 검사한다.
누락, 문자열, `NaN`, 무한대와 소수는 거부한다.

`src/services/logncrash/client.ts`에 다음 메서드를 추가한다.

```typescript
availableToken(): Promise<AvailableTokenResult>
```

기존 `endpointFor("logncrash")`, `readHeaders()`, `ky`, `DEFAULT_TIMEOUT_MS`, `unwrap()`과 `toLogncrashError()`를 재사용한다.
요청은 `GET /v3/{encodedAppkey}/logs/available-token`, retry 0이며 JSON body를 보내지 않는다.
봉투를 벗긴 뒤 응답 가드를 통과하지 못하면 `EXIT_API_ERROR`인 `NhnCloudCliError`를 던진다.
공식 명세의 정수 필드를 문자열로 넓혀 받지 않는다.

### 2. 추정 상태와 `available-token` 명령을 구현한다

`src/services/logncrash/token.ts`를 추가하고 다음 순수 계약을 구현한다.

```typescript
export interface AvailableTokenStatus {
  availableToken: number;
  estimatedWaitSeconds: number | null;
}

export function availableTokenStatus(availableToken: number): AvailableTokenStatus
export function assertAvailableSearchToken(status: AvailableTokenStatus): void
```

잔량이 양수이면 `estimatedWaitSeconds`는 `null`이다.
0 이하면 `Math.ceil((1 - availableToken) / 1.6)`을 사용한다.
`assertAvailableSearchToken`은 0 이하일 때 현재 잔량, 초 단위 추정값, 1.6 token/s가 관측값이라는 사실,
자동으로 기다리지 않는다는 사실과 `nhncloud logncrash available-token` 재확인 명령을 담은 `NhnCloudCliError(EXIT_API_ERROR)`를 던진다.

`src/commands/logncrash/available-token.ts`에 `availableTokenCommand`를 추가한다.
`--profile <name>`을 받고 `resolveLogncrashClient()`로 client를 만든 뒤 spinner의 try/catch 안에서 `client.availableToken()`을 호출한다.
음수와 0도 정상 조회 결과이므로 이 명령 자체는 실패시키지 않는다.
출력 계약은 다음과 같다.

- 기본 table: 남은 조회 토큰과 양수까지 추정 대기 시간(초). 양수이면 대기 불필요로 표시한다.
- `--json`: `{ availableToken, estimatedWaitSeconds }`. 양수이면 `estimatedWaitSeconds`는 `null`이다.
- `--quiet`: `availableToken` 숫자 한 줄만 출력한다.

### 3. search와 export의 모든 검색 요청 앞에 잔량 확인을 연결한다

`src/commands/logncrash/helpers.ts`에 client를 받아 `availableToken()`을 호출하고
`availableTokenStatus()`와 `assertAvailableSearchToken()`을 적용하는 공통 비동기 helper를 추가한다.
잔량 조회 오류를 잡거나 다른 오류로 바꾸지 않아 fail-closed로 원래 오류를 보존한다.

`src/commands/logncrash/search.ts`는 spinner의 기존 try/catch 안에서 `cursorSearch()` 직전에 공통 helper를 호출한다.
0 이하이거나 잔량 조회가 실패하면 `cursorSearch()`를 호출하지 않는다.
실제 `cursorSearch()`가 반환한 429와 500의 기존 안내는 유지한다.

`src/commands/logncrash/export.ts`는 모든 `scrollStart()`와 `scrollNext()` 직전에 공통 helper를 호출한다.
첫 요청, 500 뒤 분할 재시도, 다음 창과 다음 페이지가 모두 대상이다.
preflight가 첫 호출 전에 실패하면 빈 temp 파일을 정리하고 부분 파일을 만들지 않는다.
일부 결과 뒤 실패하면 기존 `<output>.partial` 보존과 이어받기 안내를 유지한다.
500이면 기존 checkpoint 되돌리기와 적응형 분할을 유지하고, 실제 429면 기존처럼 분할하지 않는다.

### 4. Commander 트리와 에이전트 help에 새 명령을 등록한다

`src/index.ts`에서 `availableTokenCommand`를 `logncrash` 그룹에 등록한다.
Log & Crash 에이전트 흐름은 조회 토큰 확인을 첫 단계로 보여 준 뒤 search와 export를 안내한다.
명령 순서는 `available-token`, `search`, `send`, `export`로 둔다.

빌드 뒤 `node dist/index.js commands --json`에서 `logncrash available-token`이 정확히 한 번 나오고,
전체 명령 카탈로그가 170개에서 171개로 늘어나는지 확인한다.
실제 `--help`의 설명과 옵션이 planning에서 갱신한 `README.md`와
`skills/nhncloud-cli/references/logncrash.md`의 사용 흐름과 일치해야 한다.

### 5. 정상·실패·출력·회귀 경계를 테스트한다

다음 대상 테스트를 추가하거나 갱신한다.

- `src/services/logncrash/client.test.ts`: GET 경로, encoded appkey, Bearer 헤더, retry와 timeout, 정상 음수 정수, 잘못된 필드 타입, 봉투 실패, access token 부재를 검증한다.
- `src/services/logncrash/token.test.ts`: 양수·0·음수의 정확한 반올림, 1.6 token/s 추정 표기, 종료 코드 1과 자동 대기 부재를 검증한다.
- `src/commands/logncrash/available-token.test.ts`: 기본, JSON, quiet 출력과 profile 전달, 음수 성공, API 오류에서 spinner 종료를 검증한다.
- `src/commands/logncrash/search.test.ts`: preflight가 검색보다 먼저 실행되고 0 이하와 조회 오류에서 검색을 호출하지 않으며, 양수와 기존 429·500 흐름은 유지되는지 검증한다.
- `src/commands/logncrash/export.test.ts`: 모든 시작·계속 요청의 preflight 순서, 첫 차단 시 파일 없음, 중간 차단 시 부분 파일, 500 분할과 429 보존을 검증한다.

기존 mock client에는 `availableToken`을 명시적으로 추가한다.
테스트가 preflight를 우연히 건너뛰도록 기본값 없는 느슨한 이중 단언을 추가하지 않는다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/services/logncrash/types.ts` | 수정: 공식 availableToken 응답 타입과 가드 |
| `src/services/logncrash/client.ts` | 수정: Search v3 available-token GET 메서드 |
| `src/services/logncrash/client.test.ts` | 수정: endpoint, 인증, 응답 가드 회귀 |
| `src/services/logncrash/token.ts` | 추가: 추정 시간과 0 이하 차단 계약 |
| `src/services/logncrash/token.test.ts` | 추가: 계산과 오류 메시지 단위 테스트 |
| `src/commands/logncrash/helpers.ts` | 수정: search와 export 공통 preflight helper |
| `src/commands/logncrash/available-token.ts` | 추가: 조회 토큰 출력 명령 |
| `src/commands/logncrash/available-token.test.ts` | 추가: 세 출력 모드와 오류 흐름 |
| `src/commands/logncrash/search.ts` | 수정: cursor 검색 직전 preflight |
| `src/commands/logncrash/search.test.ts` | 수정: 차단과 기존 오류 회귀 |
| `src/commands/logncrash/export.ts` | 수정: 각 scroll 요청 직전 preflight |
| `src/commands/logncrash/export.test.ts` | 수정: 분할·페이지·부분 파일과 preflight 결합 회귀 |
| `src/index.ts` | 수정: 명령 등록과 Log & Crash 에이전트 흐름 |
| `tasks/069-logncrash-available-token/index.json` | 수정: 검증 완료 뒤 task 상태를 `completed`로 변경 |

## 검증

```bash
# cwd: <레포 루트>
node_modules/.bin/vitest run src/services/logncrash/client.test.ts src/services/logncrash/token.test.ts src/commands/logncrash/available-token.test.ts src/commands/logncrash/search.test.ts src/commands/logncrash/export.test.ts
node_modules/.bin/tsc --noEmit
node_modules/.bin/vitest run --passWithNoTests
node_modules/.bin/tsup --config tsup.config.ts
node dist/index.js commands --json
node dist/index.js logncrash available-token --help
git diff --check
```

모든 명령은 종료 코드 0이어야 하고 전체 테스트가 통과해야 한다.
명령 카탈로그는 171개이며 `logncrash available-token`이 정확히 한 번 포함돼야 한다.

출력과 잔재도 기계적으로 확인한다.

```bash
# cwd: <레포 루트>
test "$(node dist/index.js commands --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const c=JSON.parse(s).commands;process.stdout.write(String(c.length))})')" -eq 171
test "$(node dist/index.js commands --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const c=JSON.parse(s).commands.filter(x=>x.path==="logncrash available-token");process.stdout.write(String(c.length))})')" -eq 1
rg -n "available-token|estimatedWaitSeconds|1\.6" README.md docs skills/nhncloud-cli/references/logncrash.md src tasks/069-logncrash-available-token
! rg -n "available-token.*포함하지|available-token.*노출하지|회복은 초당 1개|호출당 약 1,000|서버가 남은 시간을 알려주지 않아" docs README.md skills/nhncloud-cli
```

네 검사는 모두 종료 코드 0이어야 한다.

마지막으로 `tasks/069-logncrash-available-token/index.json`의 `status`를 `completed`로 바꾸고,
`current_phases`를 `1`로 유지한다.
phase 파일과 `phases` 배열은 같은 커밋에서 일치해야 한다.

## 의도 메모

- 공식 endpoint가 이미 같은 host와 인증 봉투를 쓰므로 새 HTTP나 인증 계층을 만들지 않는다.
- raw 잔량과 파생 추정값을 분리하면 `--quiet`은 자동화용 숫자를 유지하고 JSON은 계산 근거를 함께 제공한다.
- 매 요청 preflight는 export가 첫 페이지 뒤 음수로 내려간 상태에서 다음 페이지를 보내는 것을 막는다.
- 조회 실패를 강행으로 바꾸지 않으면 비용이 큰 검색 전에 세운 안전 조건이 예외 경로에서도 유지된다.
- 추정값은 잔량이 양수가 되는 시점만 나타낸다. 공식 비용 산정식이 없으므로 임의 검색의 성공 시점을 약속하지 않는다.
- 새 설정과 장기 상태가 없으므로 `docs/data-schema.md`는 수정하지 않는다.

## Blocked 조건

- 공식 v3 명세가 `GET /v3/{appkey}/logs/available-token` 또는 정수 `availableToken`과 다르면 `PHASE_BLOCKED: 공식 available-token 계약 변경`을 출력하고 종료한다.
- planning 문서 커밋 `c0463d0`의 ADR-036이 자동 대기 배제, 0 이하 차단 또는 1.6 token/s 추정과 다르면 `PHASE_BLOCKED: 관리 문서 계약 불일치`를 출력하고 종료한다.
- 기존 500 분할이나 429 부분 결과 보존을 유지하면서 매 요청 preflight를 넣을 수 없으면 해당 정책을 삭제하지 말고 `PHASE_BLOCKED: export 오류 경계 결합 불가`를 출력하고 종료한다.
