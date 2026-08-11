# Phase 02 — 쓰기 요청 타입, client 메서드 3개, 공용 헬퍼

**Execution profile**: standard

---

## 목표

API Gateway 쓰기 3개 엔드포인트를 `ApiGatewayClient` 에 추가하고,
명령 계층이 쓸 요청 타입과 헬퍼를 마련한다.
결정 근거는 `docs/adr/028-apigateway-write-api.md` 이고 이 phase 는 그 결정을 코드로 옮긴다.

**이 phase 는 실제 쓰기 API 를 호출하지 않는다.** 단위 테스트는 `ky` 를 mock 한다.
live 호출은 phase 05 의 수동 QA 절차에서 사용자가 수행한다.

**범위 외**: Commander 명령 등록은 phase 03·04 다. 스테이지 반영과 배포·롤백은 후속 plan 이다.

---

## 작업 항목 (4)

### 1. `src/services/apigateway/types.ts` — 쓰기 요청 타입과 수정 응답 가드

기존 조회 타입은 손대지 않고 아래를 추가한다.

```ts
export interface StageUpdateBody { backendEndpointUrl: string; stageDescription?: string }
export interface PluginInput { pluginType: string; pluginConfigJson?: Record<string, unknown>; delete?: boolean }
export interface PathPluginInput extends PluginInput { applyChildPath?: boolean }
export interface MethodPluginUpdateBody { methodName: string; methodDescription?: string; methodPluginList: PluginInput[] }
```

설정 가능한 플러그인 타입을 상수로 둔다. 경로와 메서드가 다르다.

- `PATH_PLUGIN_TYPES` — `CORS`, `SET_REQUEST_HEADER`, `SET_RESPONSE_HEADER`, `ADD_REQUEST_QUERY_PARAMETER`
- `METHOD_PLUGIN_TYPES` — `HTTP`, `MOCK`, `SET_REQUEST_HEADER`, `SET_RESPONSE_HEADER`, `ADD_REQUEST_QUERY_PARAMETER`

쓰기 응답에는 조회용 가드를 재사용하지 않는다. 두 응답의 필드 집합이 실제로 다르다.

스테이지 **수정 응답** 전용 타입 `UpdatedStage` 와 가드 `isUpdatedStage` 를 새로 만든다.
기존 `isStage` 를 재사용하면 안 된다 — 조회 응답에는 있는 `stageCustomUrl` 과
`stageAliasDomainList` 가 수정 응답에는 없어, 성공 응답이 가드에서 거부된다.
`isUpdatedStage` 가 요구하는 필드는 `stageId`·`apigwServiceId`·`regionCode`·`stageName`(nullable)·
`stageDescription`·`stageUrl`·`backendEndpointUrl`·`resourceUpdatedAt`·`createdAt`·`updatedAt` 과
배열 `stageCustomDomainList` 다. 나머지는 인덱스 시그니처로 흘린다.

플러그인 **수정 응답** 전용 타입 `UpdatedResource` 와 가드 `isUpdatedResource` 도 같은 이유로 만든다.
기존 `isResource` 를 재사용하면 안 된다.
그 가드는 `parentPath`·`methodType`·`methodName`·`methodDescription`·`createdAt`·`updatedAt`·
`resourcePluginList` 를 전부 필수로 요구하는데, `resource-paths`·`resource-methods` 응답이
그 일곱 필드를 같은 형태로 준다는 근거가 공식 문서에 없다(응답 예시가 잘려 있다).
스테이지에서 실제로 확인된 것과 같은 필드 축소가 일어나면
쓰기가 이미 성공한 뒤 CLI 가 응답 형식 오류로 끝나고, 사용자는 재적용을 시도한다.

`isUpdatedResource` 는 `resourceId`(string)와 `path`(string) 둘만 필수로 요구한다.
나머지는 optional 로 두고 인덱스 시그니처로 흘려, 서버가 필드를 줄여도 성공을 성공으로 보고한다.
출력에서 쓰는 필드는 값이 없을 때 대체 문자를 넣는다 — 조회 명령이 nullable 필드에 쓰는 방식과 같다.

### 2. `src/services/apigateway/client.ts` — 쓰기 메서드 3개

기존 조회 메서드와 같은 방식으로 `authHeaders()`·`DEFAULT_TIMEOUT_MS`·`toNhnCloudCliError` 를 쓴다.

```ts
async updateStage(apigwServiceId: string, stageId: string, body: StageUpdateBody): Promise<UpdatedStage>
async setPathPlugins(apigwServiceId: string, resourceId: string, pathPluginList: PathPluginInput[]): Promise<UpdatedResource[]>
async setMethodPlugins(apigwServiceId: string, resourceId: string, body: MethodPluginUpdateBody): Promise<UpdatedResource[]>
```

경로는 아래와 같다. 리소스 쓰기는 조회의 `resources` 가 아니라 별도 경로다.

- `PUT ${baseUrl}/services/{apigwServiceId}/stages/{stageId}`
- `PUT ${baseUrl}/services/{apigwServiceId}/resource-paths/{resourceId}`
- `PUT ${baseUrl}/services/{apigwServiceId}/resource-methods/{resourceId}`

경로 조각은 기존 조회 메서드처럼 `encodeURIComponent` 로 감싼다.

응답 처리는 세 메서드 모두 `unwrapHeader` 를 반드시 거친다.
이 API 는 권한 오류를 HTTP 200 에 `isSuccessful: false` 로 주므로
봉투를 검사하지 않으면 실패가 성공으로 보고된다.
`updateStage` 는 `stage` 키를 `isUpdatedStage` 로 좁히고,
플러그인 두 메서드는 `resourceList` 배열을 `isUpdatedResource` 로 좁힌다.
좁히기에 실패하면 `NhnCloudCliError(..., EXIT_API_ERROR)` 를 던진다.
쓰기 경로에서 조회용 `isStage`·`isResource` 를 호출하지 않는다.

catch 블록은 `if (error instanceof NhnCloudCliError) throw error;` 를 먼저 두고
그 뒤에 `toNhnCloudCliError(error)` 를 쓴다.

### 3. `src/commands/apigateway/helpers.ts` — 쓰기 공용 헬퍼 3개

```ts
export function requireYes(yes: boolean | undefined, operation: string): true
export async function readPluginConfigFile(path: string): Promise<unknown>
export function collectAffectedPaths(resources: Resource[], targetPath: string): Resource[]
```

- `requireYes` — `src/commands/loadbalancer/helpers.ts` 의 같은 이름 함수와 동일한 동작이다.
  `--yes` 가 없으면 `NhnCloudCliError` 를 `EXIT_PARAM_ERROR` 로 던진다.
  loadbalancer 에서 import 하지 않고 apigateway helpers 에 둔다 — 이 저장소는 서비스별로
  자체 helpers 를 갖고 서로 참조하지 않는다.
- `readPluginConfigFile` — 파일을 읽기 전에 `stat` 으로 일반 파일인지 확인하고,
  디렉터리나 없는 경로는 `EXIT_PARAM_ERROR` 로 거부한다.
  `JSON.parse` 결과를 `as` 로 단언하지 않고 `unknown` 으로 반환해 호출부가 가드로 좁힌다.
  파싱 실패 메시지에는 경로를 `JSON.stringify` 로 감싸 넣는다.
- `collectAffectedPaths` — `--dry-run` 이 쓸 영향 범위를 계산한다.
  `resource.path === targetPath` 이거나 `resource.path.startsWith(targetPath + "/")` 인 항목을 모은다.
  `targetPath` 가 `/` 인 경우 `"/" + "/"` 가 되어 아무것도 매칭되지 않으므로 전체를 반환한다.
  `startsWith(targetPath)` 만 쓰면 `/private` 이 `/private2` 를 삼키므로 구분자를 붙여 비교한다.

### 4. 테스트 — `src/services/apigateway/client.test.ts` 와 `src/commands/apigateway/helpers.test.ts`

기존 `client.test.ts` 의 mock 방식을 따른다. 메서드별로 아래 세 케이스를 넣는다.

- 성공 — 요청 URL·메서드·본문이 기대와 같고 좁혀진 값을 반환한다
- `header.isSuccessful: false` 인 HTTP 200 — `EXIT_API_ERROR` 로 던진다
- 응답 구조가 어긋남 — `isUpdatedStage`·`isResource` 좁히기 실패로 던진다

`updateStage` 성공 케이스의 응답 fixture 에는 `stageCustomUrl` 과 `stageAliasDomainList` 를
넣지 않는다. 문서의 수정 응답이 그 두 필드를 주지 않으며, 이 fixture 가 조회용 가드
재사용을 막는 회귀 테스트가 된다.

플러그인 두 메서드의 성공 fixture 는 `resourceList` 항목에 `resourceId` 와 `path` 만 담는다.
서버가 필드를 줄여도 성공을 성공으로 보고해야 하므로, 이 fixture 가 `isResource` 재사용을
막는 회귀 테스트가 된다. `isResource` 로 좁히면 이 케이스에서 실패한다.

`helpers.test.ts` 에는 `collectAffectedPaths` 의 경계를 넣는다 —
루트 `/` 입력, `/private` 대 `/private2` 구분, 정확히 일치하는 경로 포함.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/services/apigateway/types.ts` | 수정 |
| `src/services/apigateway/client.ts` | 수정 |
| `src/commands/apigateway/helpers.ts` | 수정 |
| `src/services/apigateway/client.test.ts` | 수정 |
| `src/commands/apigateway/helpers.test.ts` | 신규 |

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm test
pnpm run build

# 쓰기 메서드 3개가 모두 봉투를 검사한다 (isSuccessful=false 를 삼키지 않음)
test "$(grep -c 'unwrapHeader' src/services/apigateway/client.ts)" -ge "14"

# 쓰기 경로가 resource-paths / resource-methods 로 들어갔다
test "$(grep -c 'resource-paths' src/services/apigateway/client.ts)" -ge "1"
test "$(grep -c 'resource-methods' src/services/apigateway/client.ts)" -ge "1"

# 수정 응답 전용 가드 두 개가 정의되고 client 가 둘 다 쓴다
test "$(grep -c 'isUpdatedStage' src/services/apigateway/types.ts)" -ge "2"
test "$(grep -c 'isUpdatedResource' src/services/apigateway/types.ts)" -ge "2"
test "$(grep -c 'isUpdatedStage' src/services/apigateway/client.ts)" -ge "1"
test "$(grep -c 'isUpdatedResource' src/services/apigateway/client.ts)" -ge "1"

# 쓰기 메서드가 조회용 가드를 재사용하지 않는다 (ADR-028 결정)
# 세 쓰기 메서드 본문에서 isStage / isResource 호출이 0건이어야 한다.
# isUpdatedStage·isUpdatedResource 가 부분 일치로 잡히지 않게 앞 문자를 제한한다
# (macOS BSD grep 은 \b 지원이 불확실하므로 문자 클래스를 쓴다)
test "$(awk '/async (updateStage|setPathPlugins|setMethodPlugins)\(/,/^  }$/' src/services/apigateway/client.ts | grep -cE '(^|[^A-Za-z])(isStage|isResource)\(')" = "0"

# JSON 파싱 결과를 as 로 단언하지 않는다
test "$(grep -n 'JSON.parse' src/commands/apigateway/helpers.ts | grep -c ' as ')" = "0"

git diff --check
```

## 의도 메모 (왜)

- 봉투 검사를 세 메서드에 모두 넣는 이유는 이 API 가 권한 오류를 HTTP 200 으로 주기 때문이다.
  값을 쓰지 않더라도 봉투를 열지 않으면 실패한 쓰기가 성공으로 출력된다.
- 수정 응답 전용 가드를 새로 만드는 이유는 조회와 수정의 응답 필드가 실제로 다르기 때문이다.
  가드를 공유하려고 조회 쪽 필수 필드를 optional 로 풀면 조회 계약이 함께 약해진다.
- 플러그인 목록을 병합하지 않는 이유는 서버가 upsert 이기 때문이다.
  읽어서 다시 보내면 읽는 사이에 콘솔에서 바뀐 설정을 덮어쓴다.
- `collectAffectedPaths` 를 구분자까지 붙여 비교하는 이유는 접두 비교가
  형제 경로를 하위로 오인하면 `--dry-run` 이 실제보다 넓은 범위를 보고하기 때문이다.
