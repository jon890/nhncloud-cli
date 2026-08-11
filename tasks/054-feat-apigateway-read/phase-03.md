# Phase 03 — stage 조회 5개와 Swagger export

**Execution profile**: standard
**Status**: pending

---

## 목표

스테이지 계층 조회 다섯 명령을 붙인다 — `stage list`, `stage swagger`, `stage resources`, `stage deploy list`, `stage deploy latest`.

**범위 외**: `README.md` 와 `skills/` 갱신은 Phase 4 다.
스테이지 수정·배포 실행·롤백은 후속 plan `054-2` 다 — `PUT .../stages/{stageId}` 와 `POST .../stages/{stageId}/deploys` 는 운영 리소스를 바꾸므로 수동 QA 가 필요하다.

---

## 실행 전제

```bash
# cwd: <repo root>
# branch: feat/054-apigateway-read
set -e
rg -q 'listResources' src/services/apigateway/client.ts
test -f src/commands/apigateway/resource.ts
```

Phase 1·2 산출물을 전제한다. 없으면 `PHASE_BLOCKED: 선행 phase 미완` 을 보고하고 멈춘다.

---

## 실측으로 확정된 계약

| 엔드포인트 | 최상위 키 | paging |
|---|---|---|
| `GET .../services/{svc}/stages` | `stageList` | **있음** |
| `GET .../stages/{sid}/swagger` | `swaggerData` | 없음 |
| `GET .../stages/{sid}/resources` | `stageResourceList` | **없음** |
| `GET .../stages/{sid}/deploys` | `stageDeployHistoryList` | **있음** |
| `GET .../stages/{sid}/deploys/latest` | `latestStageDeployResult` | 없음 |

`stageList` 항목은 중첩 배열 두 개를 갖는다.

```
stageId, apigwServiceId, regionCode, stageName, stageDescription,
stageUrl, backendEndpointUrl, resourceUpdatedAt, createdAt, updatedAt, stageCustomUrl,
stageCustomDomainList[{ customDomain, createdAt }],
stageAliasDomainList[{ aliasDomain, createdAt }]
```

**`stageName` 은 실측에서 `null` 이었다.** `string | null` 로 둔다.

`stageResourceList` 항목은 Phase 2 의 `resourceList` 와 필드가 비슷하지만 다른 타입이다 — `stageResourceId`·`customBackendEndpointUrl`·`stageResourcePluginList` 를 갖는다.
**`methodType`·`methodName`·`methodDescription`·`customBackendEndpointUrl` 이 실측에서 null 이었다.**
`resourceList` 타입을 재사용하지 않고 별도 타입을 만든다.

`stageDeployHistoryList` 항목은 `deployId`·`stageId`·`deployedAt`·`rollbackAt`·`deployDescription`·`isBase` 다.
**`rollbackAt` 이 실측에서 null 이었다** (롤백하지 않은 배포). `isBase` 는 boolean 이다.

`latestStageDeployResult` 는 단일 객체이고 `deployStatus` 를 추가로 가지며 `stageResourceList` 를 중첩으로 담는다.

`GET .../stages/{stageId}` 단건 조회는 **존재하지 않는다** (실측 404, 문서에도 없음).
스테이지 정보는 `stage list` 로 얻는다.

`resourceUpdatedAt` 은 배포 시점이 아니라 **최근 스테이지에 리소스를 가져온 일시**다. 배포 시점은 `deployedAt` 이다. 표 컬럼 설명에서 혼동하지 않게 적는다.

---

## 작업 항목 (5)

### 1. `src/services/apigateway/types.ts` — 스테이지 타입 추가

`Stage`, `StageResource`, `DeployHistory`, `LatestDeployResult` 와 각 가드를 더한다.

중첩 배열(`stageCustomDomainList`·`stageAliasDomainList`·`stageResourcePluginList`)도 가드를 둔다. 빈 배열이 정상이다.

`StageResource` 를 Phase 2 의 `Resource` 와 **분리한다.** 필드가 겹쳐 보여도 `stageResourceId` 와 `customBackendEndpointUrl` 이 있어 다른 타입이다. 한 타입으로 합치면 어느 쪽에도 정확하지 않은 가드가 된다.

### 2. `src/services/apigateway/client.ts` — 메서드 5개 추가

- `listStages(apigwServiceId)` — `paging` 있음, **전수 수집**
- `getStageSwagger(apigwServiceId, stageId)` — `swaggerData` 를 그대로 반환한다. 내부 구조는 Swagger 정의라 해석하지 않는다
- `listStageResources(apigwServiceId, stageId)` — `paging` 없음, 단일 호출
- `listDeploys(apigwServiceId, stageId)` — `paging` 있음, **전수 수집**
- `getLatestDeploy(apigwServiceId, stageId)` — 단건

`swaggerData` 는 사용자 데이터를 그대로 통과시키는 값이므로 타입 가드는 "객체인지" 만 확인하고 내부는 검증하지 않는다. 과한 가드는 유효한 Swagger 를 거부한다.

### 3. `src/commands/apigateway/stage.ts` — 명령 4개

```
apigateway stage list <service-id>
apigateway stage swagger <service-id> <stage-id>   [--output <file>] [--force]
apigateway stage resources <service-id> <stage-id>
```

`stage swagger` 의 `--output` 은 `src/commands/nks/cluster.ts:417` 의 kubeconfig 저장을 따른다.

- 미지정이면 stdout 으로 JSON 을 낸다
- 지정하면 파일로 저장한다. 저장 실패는 `EXIT_PARAM_ERROR` 로 경로와 errno 를 담아 알린다
- 기존 파일은 기본적으로 덮어쓰지 않고 `EXIT_PARAM_ERROR` 로 종료한다. `--force` 를 지정한 경우에만 덮어쓴다. `deploy download` 의 `--force` 관례를 따른다

**파일 저장 경로에 사용자 입력이 들어가므로 `basename` 을 적용하지 않는다** — `--output` 은 사용자가 직접 준 경로라 그대로 쓰는 것이 맞다. 서버 응답에서 온 파일명을 쓰는 경우와 다르다.

표 컬럼은 이렇게 둔다.

- `stage list` — `stageId`·`stageName`·`stageUrl`·`backendEndpointUrl`·`resourceUpdatedAt`. null 은 `-`
- `stage resources` — `stageResourceId`·`path`·`methodType`·`customBackendEndpointUrl`·`updatedAt`

`--quiet` 는 `stage list` 가 `stageId`, `stage resources` 가 `stageResourceId` 를 한 줄씩 낸다.
`stage swagger` 는 `--quiet` 여도 Swagger 본문이 데이터이므로 stdout 으로 낸다 — `--output` 지정 시에는 저장 경로만 낸다.

### 4. `src/commands/apigateway/deploy.ts` — 명령 2개

```
apigateway stage deploy list <service-id> <stage-id>
apigateway stage deploy latest <service-id> <stage-id>
```

4단 경로다. `loadbalancer ipacl target list` 와 `ncs template version list` 가 같은 깊이의 선례다.

표 컬럼은 `deploy list` 가 `deployId`·`deployedAt`·`isBase`·`deployDescription`, `latest` 가 `deployId`·`deployStatus`·`deployedAt`·`isBase` 다.
`latest` 의 중첩 `stageResourceList` 는 건수만 요약하고 전체는 `--json` 으로 안내한다.

`--quiet` 는 `deployId` 를 낸다.

### 5. `src/index.ts` 등록과 테스트

`apigatewayCommand` 에 `stageCommand` 를 붙이고, `stageCommand` 에 `deployCommand` 를 붙인다.

`client.test.ts` 에 다섯 메서드의 봉투 성공·실패 케이스를 더한다.
`stageName` 이 null 인 응답, `rollbackAt` 이 null 인 배포 이력이 가드를 통과하는 회귀 테스트를 넣는다.

`listStages` 와 `listDeploys` 의 **전수 수집이 두 페이지를 실제로 모으는지** 단언한다 — `paging.totalCount` 가 `limit` 보다 큰 mock 을 주고 `ky.get` 이 두 번 호출되는지 확인한다. 한 페이지만 mock 하면 루프가 없어도 통과한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/services/apigateway/types.ts` | 수정 (스테이지·배포 타입) |
| `src/services/apigateway/client.ts` | 수정 (메서드 5개) |
| `src/services/apigateway/client.test.ts` | 수정 (케이스 추가) |
| `src/commands/apigateway/stage.ts` | 신규 |
| `src/commands/apigateway/deploy.ts` | 신규 |
| `src/index.ts` | 수정 (stage·deploy 등록) |

## 검증

```bash
# cwd: <repo root>
# branch: feat/054-apigateway-read
# shell: bash 또는 zsh — POSIX sh 로 실행하지 않는다 (함수 안에서 local 을 쓴다)
set -e
pnpm run build

# 1. paging 있는 것만 전수 수집한다
rg -A 18 'async listStages' src/services/apigateway/client.ts | grep -q 'paging'
rg -A 18 'async listDeploys' src/services/apigateway/client.ts | grep -q 'paging'
rg -A 14 'async listStageResources' src/services/apigateway/client.ts | grep -vq 'paging'

# 2. StageResource 를 Resource 와 분리했다
rg -q 'stageResourceId' src/services/apigateway/types.ts
rg -q 'isStageResource|StageResource' src/services/apigateway/types.ts

# 3. nullable 필드를 string-only 로 좁히지 않았다
for f in stageName rollbackAt customBackendEndpointUrl; do
  rg -q "$f" src/services/apigateway/types.ts
  test "$(rg -c "typeof obj\\[\"$f\"\\] === \"string\" &&" src/services/apigateway/types.ts 2>/dev/null || echo 0)" = "0"
done

# 4. swaggerData 내부를 과하게 검증하지 않는다 — 유효한 Swagger 를 거부하면 안 된다
test "$(rg -c 'swaggerData\["paths"\]|swaggerData\["info"\]' src/services/apigateway/types.ts 2>/dev/null || echo 0)" = "0"

# 5. 명령 등록과 4단 경로
node dist/index.js apigateway stage --help | grep -q "list"
node dist/index.js apigateway stage --help | grep -q "swagger"
node dist/index.js apigateway stage --help | grep -q "resources"
node dist/index.js apigateway stage deploy --help | grep -q "latest"
node dist/index.js apigateway stage swagger --help | grep -q -- "--output"
node dist/index.js apigateway stage swagger --help | grep -q -- "--force"

# 6. 필수 위치 인수 누락은 API 호출 전에 걸러진다
exit_code_of() { local c=0; "$@" >/dev/null 2>&1 || c=$?; echo "$c"; }
test "$(exit_code_of node dist/index.js apigateway stage list)" != "0"
test "$(exit_code_of node dist/index.js apigateway stage swagger svc-only)" != "0"
test "$(exit_code_of node dist/index.js apigateway stage deploy latest svc-only)" != "0"

# 7. 전수 수집이 2페이지를 모으는 단언이 있다
rg -q 'toHaveBeenCalledTimes\(2\)|두 페이지|2회' src/services/apigateway/client.test.ts

# 8. 봉투 실패 케이스 누적 (Phase 2 의 3건 + 이번 5건)
test "$(rg -c 'isSuccessful: false' src/services/apigateway/client.test.ts)" -ge 8

# 9. 타입·테스트
pnpm tsc --noEmit 2>&1 | grep -c '^src/' | grep -qx 0
pnpm test

# 10. 카탈로그가 stage·deploy 그룹 2개와 leaf 5개만큼 늘었다 (Phase 2 후 157 기준)
test "$(node dist/index.js commands --json | python3 -c 'import json,sys;print(len(json.load(sys.stdin)["commands"]))')" = "164"

git diff --check
```

## 의도 메모 (왜)

- 검증 1번이 엔드포인트별 pagination 비대칭을 강제하는 이유는 같은 서비스 안에서 세 개는 `paging` 이 있고 두 개는 없어서, 일괄 적용하면 어느 쪽이든 틀리기 때문이다.
- `StageResource` 를 분리하는 이유는 필드가 겹쳐 보여 재사용하고 싶어지는데, `stageResourceId` 와 `customBackendEndpointUrl` 때문에 실제로는 다른 타입이기 때문이다. 합치면 두 쪽 모두에 부정확한 가드가 된다.
- `swaggerData` 내부를 검증하지 않는 이유는 그 값이 사용자가 정의한 Swagger 라서다. 가드를 조이면 유효한 정의를 형식 오류로 거부한다.
- 전수 수집을 2페이지 mock 으로 단언하는 이유는 한 페이지만 mock 하면 루프가 없어도 테스트가 통과해 회귀를 못 잡기 때문이다.
- 이 phase 로 조회 표면이 완성되므로, 후속 쓰기 plan 은 여기서 만든 client 에 PUT·POST 메서드만 더하면 된다.

## Blocked 조건

- Phase 1·2 산출물이 없으면 `PHASE_BLOCKED: 선행 phase 미완` 을 보고하고 멈춘다.
