# Phase 02 — resource 조회 3개

**Execution profile**: standard
**Status**: pending

---

## 목표

리소스 계층 조회 세 명령을 붙인다 — `apigateway resource list`, `resource parameters`, `resource responses`.

**범위 외**: stage 조회와 Swagger 는 Phase 3, `README.md` 와 `skills/` 갱신은 Phase 4 다.
리소스 수정(플러그인 적용)은 후속 plan `054-2` 다 — 경로가 `resource-paths/{id}`·`resource-methods/{id}` 로 갈라져 있고 PUT 이라 이 phase 범위가 아니다.

---

## 실행 전제

```bash
# cwd: <repo root>
# branch: feat/054-apigateway-read
set -e
test -f src/services/apigateway/client.ts
rg -q 'apigatewayHost' src/api/endpoints.ts
rg -q 'resolveApiGatewayClient' src/commands/apigateway/helpers.ts
```

Phase 1 산출물을 전제한다. 없으면 `PHASE_BLOCKED: Phase 1 산출물 부재` 를 보고하고 멈춘다.

---

## 실측으로 확정된 계약

| 엔드포인트 | 최상위 키 | paging |
|---|---|---|
| `GET .../services/{svc}/resources` | `resourceList` | **없음** |
| `GET .../services/{svc}/resources/{rid}/parameters` | `queryStringList`·`headerList`·`formDataList`·`requestBody`·`contentTypeList` | 없음 |
| `GET .../services/{svc}/resources/{rid}/responses` | `responseList`·`contentTypeList` | 없음 |

**`resources` 는 `paging` 객체가 없고 실측에서 68건을 한 번에 반환했다.**
공식 문서는 `page`·`limit`(기본 10) 을 전역 규칙처럼 서술하지만 이 엔드포인트에는 적용되지 않는다.
Phase 1 의 `listServices` 처럼 전수 수집 루프를 넣으면 존재하지 않는 `paging` 을 읽게 된다.

`resourceList` 항목 필드는 이렇다.

```
resourceId, apigwServiceId, parentPath, path,
methodType, methodName, methodDescription,
createdAt, updatedAt, resourcePluginList
```

**실측에서 `parentPath`·`methodType`·`methodName`·`methodDescription` 네 개가 모두 `null` 이었다.**
리소스 경로 항목(디렉터리 성격)에는 메서드 정보가 없어서다. 메서드 항목에는 값이 있다.
네 필드 모두 `string | null` 로 두고 가드도 null 을 허용한다.

`GET .../resources/{resourceId}` 단건 조회는 **존재하지 않는다.** 실측 404 이고 문서에도 없다.
이 API 는 메서드별로 라우팅해 지원하지 않는 메서드에 404 를 주며 `Allow` 헤더도 주지 않는다.

`parameters` 의 `requestBody` 는 객체이고 실측에서 `{ name: null, description: null, modelId: null }` 이었다.
`responses` 와 `parameters` 의 배열들은 실측에서 모두 빈 배열이었다 — 그 프로젝트가 쓰지 않는 기능이라서이고, 필드가 없다는 뜻이 아니다. 빈 배열과 누락을 구분해 가드를 짠다.

---

## 작업 항목 (4)

### 1. `src/services/apigateway/types.ts` — 리소스 타입 추가

`Resource`, `ResourceParameters`, `ResourceResponses` 와 각 타입 가드를 더한다.
Phase 1 에서 만든 파일에 추가하고 기존 서비스 타입은 건드리지 않는다.

nullable 네 필드는 `string | null` 이다. `resourcePluginList` 는 배열이고 항목 구조는 이 phase 범위에서 쓰지 않으므로 `unknown[]` 로 두거나 최소 가드만 둔다 — 플러그인 항목 구조는 쓰기 plan 이 확정한다.

### 2. `src/services/apigateway/client.ts` — 메서드 3개 추가

- `listResources(apigwServiceId)` — **전수 수집 루프를 넣지 않는다.** `paging` 이 없으므로 단일 호출로 `resourceList` 를 그대로 반환한다
- `getResourceParameters(apigwServiceId, resourceId)`
- `getResourceResponses(apigwServiceId, resourceId)`

Phase 1 이 정한 인증 헤더·`retry: 0`·`timeout: DEFAULT_TIMEOUT_MS`·`unwrapHeader` 를 그대로 따른다.

### 3. `src/commands/apigateway/resource.ts` — 명령 3개

인수는 위치 인수로 받는다.

```
apigateway resource list <service-id>
apigateway resource parameters <service-id> <resource-id>
apigateway resource responses <service-id> <resource-id>
```

옵션은 Phase 1 의 `service.ts` 와 동일하다 (`--region`·`--app-key`·`--profile`).

위치 인수는 `src/commands/parse-options.ts` 의 검증을 거쳐 trim 후 빈 값을 거부한다.
빈 식별자가 그대로 URL 에 들어가면 `/resources//parameters` 같은 깨진 경로가 만들어진다.

표 컬럼은 이렇게 둔다.

- `resource list` — `resourceId`·`path`·`methodType`·`methodName`·`updatedAt`. null 은 `-` 로 출력한다
- `parameters` — 배열이 여러 개라 종류별 건수 요약을 표로 내고 전체는 `--json` 으로 안내한다
- `responses` — `responseList` 항목을 표로 낸다

세 명령 모두 빈 결과가 정상이다. **빈 결과 메시지는 stdout 으로 내고 stderr 로 보내지 않는다.** `--quiet` 면 무출력이다.

`--quiet` 는 `resource list` 에서 `resourceId` 한 줄씩 낸다. `parameters`·`responses` 는 낼 식별자가 없어 무출력이다.

### 4. `src/index.ts` 등록과 테스트

`apigatewayCommand` 에 `resourceCommand` 를 붙인다.

`src/services/apigateway/client.test.ts` 에 세 메서드의 봉투 성공·실패 케이스를 더한다.
`vi.mock("ky")` 후 `.json()` 반환값을 주입하는 기존 방식을 따르고, reject value 는 production 의 `toNhnCloudCliError` 매핑을 그대로 흉내낸다 (HTTP 4xx → `EXIT_API_ERROR`, 401·403 → `EXIT_AUTH_ERROR`).

**`isSuccessful: false` 가 `EXIT_API_ERROR` 로 나가는 케이스를 메서드마다 넣는다.** 성공 mock 만 두면 봉투 검사 누락이 회귀해도 테스트가 초록으로 통과한다.

`parentPath` 가 `null` 인 응답이 가드를 통과하는 회귀 테스트도 넣는다 — 이 plan 이 막으려는 실패다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/services/apigateway/types.ts` | 수정 (리소스 타입·가드 추가) |
| `src/services/apigateway/client.ts` | 수정 (메서드 3개) |
| `src/services/apigateway/client.test.ts` | 수정 (케이스 추가) |
| `src/commands/apigateway/resource.ts` | 신규 |
| `src/index.ts` | 수정 (resourceCommand 등록) |

## 검증

```bash
# cwd: <repo root>
# branch: feat/054-apigateway-read
# shell: bash 또는 zsh — POSIX sh 로 실행하지 않는다 (함수 안에서 local 을 쓴다)
set -e
pnpm run build

# 1. resources 에 전수 수집 루프를 넣지 않았다 — 이 엔드포인트에는 paging 이 없다
test "$(rg -c 'paging' src/services/apigateway/client.ts)" -ge 1   # listServices 용은 남아 있다
rg -A 18 'async listResources' src/services/apigateway/client.ts | grep -vq 'paging'

# 2. nullable 네 필드를 string-only 로 좁히지 않았다
for f in parentPath methodType methodName methodDescription; do
  rg -q "$f" src/services/apigateway/types.ts
  test "$(rg -c "typeof obj\\[\"$f\"\\] === \"string\" &&" src/services/apigateway/types.ts 2>/dev/null || echo 0)" = "0"
done

# 3. 빈 결과를 stderr 로 보내지 않는다
test "$(rg -c 'stderr\.write.*없' src/commands/apigateway/ 2>/dev/null | wc -l | tr -d ' ')" = "0"

# 4. 명령 3개가 등록되고 위치 인수를 받는다
node dist/index.js apigateway resource --help | grep -q "list"
node dist/index.js apigateway resource --help | grep -q "parameters"
node dist/index.js apigateway resource --help | grep -q "responses"
node dist/index.js apigateway resource list --help | grep -q -- "--app-key"

# 5. 필수 위치 인수 누락은 API 호출 전에 종료 코드로 걸러진다
exit_code_of() { local c=0; "$@" >/dev/null 2>&1 || c=$?; echo "$c"; }
test "$(exit_code_of node dist/index.js apigateway resource list)" != "0"
test "$(exit_code_of node dist/index.js apigateway resource parameters svc-only)" != "0"

# 6. 봉투 실패 케이스가 메서드마다 있다
test "$(rg -c 'isSuccessful: false' src/services/apigateway/client.test.ts)" -ge 3

# 7. 타입·테스트
pnpm tsc --noEmit 2>&1 | grep -c '^src/' | grep -qx 0
pnpm test

# 8. 카탈로그가 3개 늘었다 (Phase 1 후 151 기준)
test "$(node dist/index.js commands --json | python3 -c 'import json,sys;print(len(json.load(sys.stdin)["commands"]))')" = "154"

git diff --check
```

## 의도 메모 (왜)

- 검증 1번이 `listResources` 에 `paging` 이 없음을 강제하는 이유는 문서가 `page`·`limit` 을 전역 규칙처럼 적어 두어 전수 수집 루프를 넣기 쉬운데, 실제 응답에는 `paging` 이 없어 그 코드가 죽거나 오동작하기 때문이다.
- nullable 네 필드를 검증 2번으로 못박는 이유는 리소스 경로 항목에 메서드 정보가 없어 실제 응답의 절반 이상이 null 이고, string-only 가드면 목록 전체가 거부되기 때문이다.
- 빈 결과를 stdout 으로 내는 이유는 `parameters`·`responses` 가 실측에서 전부 빈 배열이었고, 그것이 정상 상태이기 때문이다. 정상 빈 상태를 stderr 로 보내면 자동화가 오류로 오인한다.
- 리소스 단건 조회를 넣지 않는 이유는 그 경로가 없기 때문이다. 404 가 "경로 없음" 이 아니라 "그 메서드로는 없음" 을 뜻하는 API 라, 없는 것을 있다고 가정하기 쉽다.

## Blocked 조건

- Phase 1 산출물(`src/services/apigateway/client.ts`, `apigatewayHost`, `resolveApiGatewayClient`)이 없으면 `PHASE_BLOCKED: Phase 1 산출물 부재` 를 보고하고 멈춘다.
