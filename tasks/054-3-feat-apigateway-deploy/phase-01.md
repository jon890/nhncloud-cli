# Phase 01 — 쓰기 응답 타입·가드와 client 메서드 4개

**Execution profile**: standard

---

## 목표

스테이지 반영·배포·롤백의 API 호출과 배포 완료 대기를 `ApiGatewayClient` 에 추가한다.
결정 근거는 `docs/adr/031-apigateway-stage-deploy.md` 에 있다. 착수 전에 읽는다.

**범위 외**: 명령 추가는 phase 02 다. 배포 이력 삭제(`DELETE .../deploys/{deployId}`)와
스테이지 리소스 단건 수정(`PUT .../resources/{stageResourceId}`)은 이 plan 이 다루지 않는다.

---

## 배경 — 이 phase 가 존재하는 이유

세 엔드포인트의 응답 계약이 기존 조회와 다르다.

- 배포 요청 응답에는 배포 ID 도 상태도 없다. 공통 헤더만 온다.
- 롤백 응답의 문서 예시는 `customEndpointUrl` 인데, 같은 문서의 필드 표는 `customBackendEndpointUrl` 로 적어 서로 어긋난다.
- 기존 `isStageResource`(`src/services/apigateway/types.ts:334`)는 `customBackendEndpointUrl` 을 **필수**로 요구한다.
  롤백 응답에 그대로 쓰면 문서 예시가 맞을 때 성공 응답을 거부한다.

---

## 작업 항목 (4)

### 1. `src/services/apigateway/types.ts` — 쓰기 응답 전용 타입과 가드

`StageResource` 아래에 다음을 추가한다.

```ts
/**
 * 반영·롤백 응답의 stage resource. 조회 응답과 필드가 어긋나므로 출력에 쓰는 것만 요구한다
 * (문서 예시는 customEndpointUrl, 필드 표는 customBackendEndpointUrl 로 서로 다르다).
 */
export interface WrittenStageResource {
  stageResourceId: string;
  path: string;
  methodType: string | null;
  methodName: string | null;
  stageResourcePluginList: StageResourcePlugin[];
  [key: string]: unknown;
}
```

가드 `isWrittenStageResource` 를 `isStageResource` 옆에 추가한다.
요구 필드는 위 인터페이스의 다섯 개뿐이다.
`customBackendEndpointUrl`·`methodDescription`·`updatedAt` 을 **요구하지 않는다** — 출력에 쓰지 않기 때문이다.
기존 `isStageResource` 는 그대로 둔다. 조회 명령이 쓰고 있다.

`isNullableString` 은 이미 이 파일에 있다. 새로 만들지 않는다.

### 2. `src/services/apigateway/types.ts` — 배포 상태 상수

```ts
/** 스테이지 배포 상태. 공식 Enum 코드 문서 기준 세 값이다. */
export const DEPLOY_STATUS_COMPLETE = "COMPLETE";
export const DEPLOY_STATUS_FAILURE = "FAILURE";
export const DEPLOY_STATUS_DEPLOYING = "DEPLOYING";
```

`LatestDeployResult.deployStatus` 는 `string` 그대로 둔다.
서버가 문서에 없는 값을 주더라도 응답 자체를 거부하지 않기 위해서다.

### 3. `src/services/apigateway/client.ts` — 메서드 3개 추가

기존 메서드들과 같은 형태로 쓴다 — `ky` 사용, `headers: this.authHeaders()`, `retry: 0`,
`timeout: DEFAULT_TIMEOUT_MS`, `unwrapHeader(response)` 후 가드 검사,
`catch` 에서 `NhnCloudCliError` 는 그대로 던지고 나머지는 `toNhnCloudCliError(err)`.

**`importStageResources(apigwServiceId, stageId): Promise<WrittenStageResource[]>`**

- `PUT ${this.baseUrl}/services/{apigwServiceId}/stages/{stageId}/resources`
- **요청 본문이 없다.** 공식 문서에 Request Body 절이 없다. `json` 옵션을 주지 않는다.
- 응답 `stageResourceList` 를 `isWrittenStageResource` 로 검사해 반환한다.
- 배열이 아니거나 원소가 어긋나면 `"API Gateway 응답 형식 오류: stageResourceList 가 올바른 배열이 아닙니다."` 로
  `EXIT_API_ERROR` 를 던진다 (기존 `listStageResources` 문구와 같게 둔다).

**`createDeploy(apigwServiceId, stageId, body: { deployDescription?: string }): Promise<void>`**

- `POST ${this.baseUrl}/services/{apigwServiceId}/stages/{stageId}/deploys`
- `deployDescription` 이 있을 때만 본문에 넣는다. 없으면 빈 객체 `{}` 를 보낸다.
- 응답에는 공통 헤더뿐이라 `unwrapHeader` 만 하고 반환값이 없다.
  헤더 밖 필드를 읽으려 하지 않는다.

**`rollbackDeploy(apigwServiceId, stageId, deployId): Promise<WrittenStageResource[]>`**

- `POST ${this.baseUrl}/services/{apigwServiceId}/stages/{stageId}/deploys/{deployId}/rollback`
- 요청 본문이 없다.
- 응답 `stageResourceList` 를 `isWrittenStageResource` 로 검사해 반환한다.

경로 조각은 모두 `encodeURIComponent` 로 감싼다 (기존 메서드와 동일).

### 4. `src/services/apigateway/client.ts` — `waitForDeploy` 추가

```ts
async waitForDeploy(
  apigwServiceId: string,
  stageId: string,
  opts: { intervalMs?: number; timeoutMs: number; baselineDeployId: string | null },
): Promise<LatestDeployResult>
```

배포 요청 응답이 배포 ID 를 주지 않으므로, 호출 직전에 읽어 둔 ID 를 기준으로 완료를 판정한다.

- `intervalMs` 기본값은 이 파일에 상수로 둔다 (`DEFAULT_DEPLOY_POLL_INTERVAL_MS = 3000`).
  `src/services/instance/client.ts:716` 의 `waitForActive` 가 같은 형태다 — deadline 계산과
  `Math.min(intervalMs, remaining)` 대기를 그대로 따른다.
- 매 회차 `this.getLatestDeploy(apigwServiceId, stageId)` 를 호출한다.
- **종료 조건은 하나다 — `deployStatus` 가 `DEPLOYING` 이 아니게 되면 끝낸다.**
  `deployId` 는 판정에 쓰지 않는다. 서버가 새 ID 로 바꾸든 같은 ID 의 상태만 바꾸든
  `DEPLOYING` 을 벗어난 시점이 곧 결과가 나온 시점이고, 두 경우를 가릴 이유가 없다.
- `deployStatus` 가 문서에 없는 값이면 `DEPLOYING` 이 아니므로 종료 조건에 걸린다.
  상태 문자열을 그대로 담아 돌려주고 판정은 호출부가 한다.
- timeout 을 넘기면 마지막으로 본 `deployStatus` 와 `deployId` 를 담아
  `EXIT_API_ERROR` 로 던진다. 마지막 조회가 없었으면 그 사실을 적는다.
- `getLatestDeploy` 가 던지는 오류는 그대로 전파한다. 폴링 중 오류를 삼키지 않는다.

**`baselineDeployId` 를 왜 받는가** — 배포 이력이 하나도 없는 스테이지에서 `getLatestDeploy` 가
실패할 수 있어, 호출부가 `null` 을 넘길 수 있어야 한다. timeout 메시지에 "직전 배포 ID" 를
적어 사용자가 콘솔에서 대조할 수 있게 한다.

---

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm test
pnpm run build
git diff --check
```

정적 확인 — 아래가 모두 기대값과 같아야 한다.

```bash
# cwd: <repo root>
# 새 client 메서드 4개가 정의됐다
grep -c "async importStageResources\|async createDeploy\|async rollbackDeploy\|async waitForDeploy" src/services/apigateway/client.ts   # 4

# 쓰기 전용 가드가 조회 가드를 대체하지 않았다 (둘 다 남아 있다)
grep -c "export function isStageResource\b" src/services/apigateway/types.ts          # 1
grep -c "export function isWrittenStageResource\b" src/services/apigateway/types.ts   # 1

# 쓰기 가드가 어긋난 필드를 요구하지 않는다
sed -n '/export function isWrittenStageResource/,/^}/p' src/services/apigateway/types.ts | grep -c customBackendEndpointUrl   # 0

# 명령은 아직 늘지 않았다
node dist/index.js commands --json | python3 -c "import json,sys; print(len(json.load(sys.stdin)['commands']))"   # 167
```

테스트를 추가한다 — `src/services/apigateway/` 에 기존 테스트 파일이 있으면 거기에, 없으면
`client.test.ts` 를 새로 만든다. 최소 다음을 덮는다.

- `isWrittenStageResource` 가 `customEndpointUrl` 만 있는 롤백 응답 예시를 통과시킨다
- `isWrittenStageResource` 가 `customBackendEndpointUrl` 이 있는 조회형 응답도 통과시킨다
- `waitForDeploy` 가 `DEPLOYING` → `COMPLETE` 전이에서 결과를 돌려준다
- `waitForDeploy` 가 `FAILURE` 를 오류로 바꾸지 않고 그대로 돌려준다 (판정은 호출부 몫)
- `waitForDeploy` 가 timeout 을 넘기면 마지막 상태를 담아 `EXIT_API_ERROR` 로 던진다

`vitest` 의 가짜 타이머를 쓰거나 `intervalMs` 를 작게 주어 테스트가 실제로 기다리지 않게 한다.

---

## 특이사항 보고

phase 종료 시 아래를 team-lead 에 보고한다.

- pre-existing 문제 (이 phase 가 만들지 않은 것)
- 신규 deprecation
- 문서로 확정하지 못해 추측한 지점 — **특히 반영·롤백 응답의 실제 필드 구성**
- 범위 외 발견
