# Phase 01 — endpoint·자격증명·client 골격과 service 조회 2개

**Execution profile**: standard
**Status**: pending

---

## 목표

API Gateway 서비스 계층을 신설하고 `apigateway service list` 와 `apigateway service get` 두 명령을 붙인다.
이 phase 가 인증·endpoint·봉투 처리를 확정해 Phase 2·3 이 메서드만 추가하면 되게 만든다.

**범위 외**: resource 조회는 Phase 2, stage 조회와 Swagger 는 Phase 3, `README.md` 와 `skills/` 갱신은 Phase 4 다.
쓰기 명령(플러그인 적용·스테이지 수정·배포)은 후속 plan `054-2` 다. 이 phase 에서 POST·PUT·DELETE 를 구현하지 않는다.

---

## 실행 전제

```bash
# cwd: <repo root>
# branch: feat/054-apigateway-read
set -e
test "$(git branch --show-current)" = "feat/054-apigateway-read"
test -f docs/adr/027-apigateway-read-api.md
test ! -d src/services/apigateway
```

`docs/adr/027-apigateway-read-api.md` 가 이 phase 의 결정 근거다. 없으면 `PHASE_BLOCKED: ADR-027 부재` 를 보고하고 멈춘다.

---

## 실측으로 확정된 계약 (추측하지 말 것)

실제 appkey 로 호출해 확인한 사실이다. 문서에 없거나 문서가 틀린 항목이 섞여 있다.

| 항목 | 값 |
|---|---|
| host | `https://{region}-apigateway.api.nhncloudservice.com` (region kr1·kr2·kr3) |
| 인증 헤더 | **`X-NHN-Authorization: Bearer <token>`** |
| 토큰 | 공통 UAK OAuth `access_token` 재사용 (ADR-007 캐시 그대로) |
| appKey | 경로 파라미터 `/v2.0/appkeys/{appKey}/...` |
| 봉투 | `header.isSuccessful` / `resultCode` / `resultMessage` |

**표준 `Authorization: Bearer` 를 쓰면 유효한 토큰이어도 `403100000 Permission denied` 가 온다.**
공식 문서가 헤더 이름을 적지 않아 표준 헤더로 가정했다가 원인 파악에 시간을 썼다. `logncrash/client.ts:112` 와 같은 헤더를 쓴다.

경로가 없으면 HTTP 404 `4041007 URL Not Found`, 권한 오류는 HTTP 200 에 `isSuccessful: false` 로 온다.

---

## 작업 항목 (5)

### 1. `src/api/endpoints.ts` — APIGATEWAY_HOST 맵과 `apigatewayHost(region)`

`NCS_HOST` 와 `ncsHost(region)`(같은 파일)의 형태를 그대로 따른다. 미등록 region 은 사용 가능 목록 안내와 함께 `EXIT_PARAM_ERROR` 를 던진다.

```
kr1: kr1-apigateway.api.nhncloudservice.com
kr2: kr2-apigateway.api.nhncloudservice.com
kr3: kr3-apigateway.api.nhncloudservice.com
```

세 region 모두 실호출로 동작을 확인했다. NCS 와 달리 kr2 도 있다.

### 2. `src/services/apigateway/types.ts` — 응답 타입과 타입 가드

`apigwServiceList` 항목과 단건 `apigwService` 의 필드는 실측으로 확정됐다.

```
apigwServiceId, apigwServiceAlias, apigwServiceName, apigwServiceDescription,
apigwDomain, appKey, regionCode, serverGroupId, dedicatedId,
createdAt, updatedAt, apigwServiceTypeCode
```

`paging` 은 `{ limit, page, totalCount }` 다.

**`dedicatedId` 는 실측에서 `null` 이었다.** 타입은 `string | null`, 가드는 `typeof v === "string" || v === null` 로 둔다.
string-only 가드를 쓰면 null 하나가 응답 전체를 "형식 오류" 로 거부한다. 이 저장소는 Glance `image.name`(PR #12)과 Cinder `isVolume`(PR #22)에서 같은 실수를 두 번 했다.

나머지 필드도 외부 응답이므로 optional·nullable 가능성을 `src/services/blockstorage/types.ts` 의 `Volume` 가드와 같은 결로 판단한다.

### 3. `src/services/apigateway/client.ts` — ApiGatewayClient

`src/services/ncs/client.ts` 의 구조를 따른다. 생성자는 `(accessToken, region, appKey)` 다.

- 인증 헤더는 `X-NHN-Authorization` (위 표 참조)
- `retry: 0` 과 `timeout: DEFAULT_TIMEOUT_MS` 를 `src/api/timeout.ts` 에서 import 해 모든 요청에 붙인다 (ADR-026)
- 봉투는 `unwrapHeader` 로 검사한다. 응답 본문이 `body` 가 아니라 named 필드(`apigwServiceList`·`apigwService`)라 `unwrap` 이 아니라 `unwrapHeader` 를 쓴다 — `ncs/client.ts` 와 같은 이유다
- catch 는 `if (err instanceof NhnCloudCliError) throw err;` 후 `toNhnCloudCliError(err)`

이 phase 의 메서드는 두 개다.

- `listServices(params: { page?: number; limit?: number })` — `paging` 을 반환하므로 **전수 수집**한다. `limit` 최대 1000 이고 `paging.totalCount` 로 종료를 판정한다
- `getService(apigwServiceId: string)` — 단건. 최상위 키가 `apigwService` 로 목록과 다르다

### 4. `src/commands/apigateway/` — helpers 와 service 명령

`src/commands/ncs/helpers.ts:209` 의 `resolveNcsClient` 를 그대로 본떠 `resolveApiGatewayClient(opts)` 를 만든다.
profile 해석 → 공통 UAK 로드 → OAuth 토큰 → appKey 해석 → client 생성 순서이고 **spinner 시작 전**에 호출한다.

appKey 해석은 `--app-key` > profile 의 `apigateway.appkey` 순이다. 없으면 `EXIT_CONFIG_ERROR` 와 설정 안내를 낸다.

`service.ts` 에 `list` 와 `get` 을 정의한다. 옵션은 `ncr/tags.ts:18-19` 와 같은 형태다.

```
--region <region>   API Gateway region (기본: kr1)
--app-key <key>     API Gateway appKey (profile 의 apigateway.appkey 보다 우선)
--profile <name>    사용할 profile 이름
```

출력은 `src/formatters/` 로 표·`--json`·`--quiet` 세 모드를 모두 지원한다.
`--quiet` 는 `apigwServiceId` 한 줄씩 낸다 — 후속 명령이 이 id 를 인수로 받으므로 체이닝 진입점이다.

표 컬럼은 `apigwServiceId`·`apigwServiceName`·`apigwDomain`·`regionCode`·`createdAt` 다. 전체 필드는 `--json` 으로 안내한다.

### 5. `src/index.ts` 등록과 `configure` 옵션

`ncsCommand` 등록부(`src/index.ts:297-304`)와 같은 형태로 `apigatewayCommand` 를 만들어 `serviceCommand` 를 붙이고 `program.addCommand` 한다.

`src/commands/configure.ts` 에 `--apigateway-appkey <key>` 를 추가한다. 통합 명령이라 **다섯 곳을 함께 고쳐야 한다** — 옵션 타입, Commander `.option`, `runNonInteractive` 변환, 비대화형 빈-가드, `hasFlag` OR-체인. 한 곳만 빠지면 신규 옵션 단독 호출이 대화형으로 빠지거나 "설정할 항목 없음" 으로 잘못 종료된다.

`src/config/types.ts` 는 **고치지 않는다.** `ServiceCredential` 이 이미 `appkey?: string` 을 갖고 `ProfileCredentials` 가 `[service: string]` 인덱스라 `apigateway` 블록이 타입 변경 없이 들어간다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/api/endpoints.ts` | 수정 (APIGATEWAY_HOST, `apigatewayHost`) |
| `src/services/apigateway/types.ts` | 신규 |
| `src/services/apigateway/client.ts` | 신규 |
| `src/services/apigateway/client.test.ts` | 신규 |
| `src/commands/apigateway/helpers.ts` | 신규 |
| `src/commands/apigateway/service.ts` | 신규 |
| `src/commands/configure.ts` | 수정 (appkey 옵션 5곳) |
| `src/index.ts` | 수정 (명령 등록) |

## 검증

```bash
# cwd: <repo root>
# branch: feat/054-apigateway-read
# shell: bash 또는 zsh — POSIX sh 로 실행하지 않는다 (함수 안에서 local 을 쓴다)
set -e

# 1. 인증 헤더가 표준 Authorization 이 아니다 — 표준을 쓰면 403 이다
rg -q '"X-NHN-Authorization"' src/services/apigateway/client.ts
test "$(rg -c '"Authorization":' src/services/apigateway/client.ts 2>/dev/null || echo 0)" = "0"

# 2. timeout·retry 를 공용 모듈에서 가져와 모든 요청에 붙였다 (ADR-026)
rg -q 'from "\.\./\.\./api/timeout\.js"' src/services/apigateway/client.ts
test "$(rg -c 'timeout: DEFAULT_TIMEOUT_MS' src/services/apigateway/client.ts)" = "$(rg -c 'retry: 0' src/services/apigateway/client.ts)"

# 3. nullable 가드 — dedicatedId 를 string-only 로 좁히지 않았다
rg -q 'dedicatedId' src/services/apigateway/types.ts
test "$(rg -c 'typeof obj\["dedicatedId"\] === "string" &&' src/services/apigateway/types.ts 2>/dev/null || echo 0)" = "0"

# 4. api/ 레이어 역류 없음
test "$(rg -c 'from "\.\./commands/' src/api/ 2>/dev/null | wc -l | tr -d ' ')" = "0"

# 5. 명령이 등록됐고 옵션 세 개가 붙었다
pnpm run build
node dist/index.js apigateway --help | grep -q "service"
node dist/index.js apigateway service list --help | grep -q -- "--region"
node dist/index.js apigateway service list --help | grep -q -- "--app-key"
node dist/index.js apigateway service get --help | grep -q -- "--profile"

# 6. configure 가 새 appkey 옵션을 노출한다
node dist/index.js configure --help | grep -q -- "--apigateway-appkey"

# 7. 자격증명 없이 호출하면 API 호출 전에 설정 오류로 끝난다
exit_code_of() { local c=0; "$@" >/dev/null 2>&1 || c=$?; echo "$c"; }
test "$(exit_code_of node dist/index.js apigateway service list --profile __no_such_profile__)" != "0"

# 8. 타입·테스트
pnpm tsc --noEmit 2>&1 | grep -c '^src/' | grep -qx 0
pnpm test

# 9. 명령 카탈로그가 2개 늘었다 (기준 149)
test "$(node dist/index.js commands --json | python3 -c 'import json,sys;print(len(json.load(sys.stdin)["commands"]))')" = "151"

git diff --check
```

## 의도 메모 (왜)

- 인증 헤더를 검증 1번으로 못박는 이유는 공식 문서에 헤더 이름이 없어 표준 `Authorization` 으로 쓰기 쉽고, 그 경우 403 이 나는데 권한 문제로 오진되기 때문이다.
- `unwrap` 이 아니라 `unwrapHeader` 를 쓰는 이유는 응답 본문이 `body` 가 아니라 named 필드라서다. NCS 가 같은 이유로 같은 선택을 했다.
- `listServices` 만 전수 수집하는 이유는 이 엔드포인트에만 `paging` 이 있기 때문이다. Phase 2 의 `resources` 는 `paging` 이 없어 단일 호출이다.
- `--quiet` 가 `apigwServiceId` 를 내는 이유는 Phase 2·3 의 모든 명령이 그 id 를 첫 인수로 받기 때문이다. 여기서 빠지면 체이닝이 끊긴다.

## Blocked 조건

- `docs/adr/027-apigateway-read-api.md` 가 없으면 `PHASE_BLOCKED: ADR-027 부재` 를 보고하고 멈춘다.
- `src/services/apigateway/` 가 이미 있으면 `PHASE_BLOCKED: 선행 변경 확인 필요` 를 보고하고 멈춘다.
