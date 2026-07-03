# Phase 01 — NKS 기반 + supports / cluster list

## 목표

NKS endpoint/auth/client 골격을 추가하고, 최소 읽기 명령 `nks supports` 와 `nks cluster list` 를 동작시킨다.

- 검증: `pnpm tsc --noEmit`, `pnpm run build`, `pnpm test`.
- help 검증: `node dist/index.js nks --help` stdout 에 `supports` 와 `cluster` 가 포함된다.
- help 검증: `node dist/index.js nks supports --help` stdout 에 `supports` 가 포함된다.
- help 검증: `node dist/index.js nks cluster list --help` stdout 에 `cluster` 와 `list` 가 포함된다.
- 자격증명 가능 시 실측: `node dist/index.js nks supports --json` 가 200 응답을 반환한다.

## 선행

구현 전 `docs/adr/019-nks-container-infra-api.md` 를 읽는다.
NKS는 NHN 공통 봉투가 아니라 OpenStack 계열 평면 JSON/무본문 응답이다.
`src/services/nks/client.ts` 에서 `unwrap` / `unwrapHeader` 를 호출하지 않는다.

공식 API 기준:

- <https://docs.nhncloud.com/ko/Container/NKS/ko/public-api/>
- NKS는 `GET /v1/supports`, `GET /v1/clusters` 에 `OpenStack-API-Version: container-infra latest` 와 `X-Auth-Token` 을 요구한다.

## 구현 항목

### 1. endpoint/cache/auth

- `src/api/endpoints.ts`
  - `NKS_HOST` 맵 추가: `kr1`, `kr2`, `kr3`, `jp1`.
  - `nksHost(region)` 추가.
  - region 오류 메시지는 기존 IaaS host helper 와 같은 `EXIT_PARAM_ERROR`.
- `src/cache/token-store.ts`
  - `IaasTokenCache` 에 `nksEndpoint` 추가.
  - 가드에 `nksEndpoint` 를 요구해 구버전 캐시는 null 반환 후 자연 재발급.
  - `readIaasToken` / `writeIaasToken` 반환·입력 타입에 `nksEndpoint` 추가.
- `src/api/keystone.ts`
  - `nksEndpoint = https://${nksHost(region)}/v1`.
  - 반환값과 캐시 쓰기에 `nksEndpoint` 추가.

### 2. NKS service

- `src/services/nks/types.ts`
  - Phase 1 최소 타입: `NksClusterSummary`, `NksSupports`.
  - 응답 가드: `clusters` 배열, `supported_k8s` 객체, `supported_event_type` 객체.
- `src/services/nks/client.ts`
  - constructor: `tokenId`, `nksEndpoint`.
  - 공통 header:
    - `X-Auth-Token`
    - `OpenStack-API-Version: container-infra latest`
  - `supports()`: `GET /supports`.
  - `listClusters()`: `GET /clusters`.
  - `nksEndpoint` 는 이미 `/v1` 을 포함하므로 service method 는 `/v1/supports` 처럼 버전을 다시 붙이지 않는다.
  - `retry: 0`, `timeout: 30_000`.
  - HTTP 에러는 `toNhnCloudCliError`.

### 3. command

- `src/commands/nks/helpers.ts`
  - `resolveNksClient({ profile, region })`.
  - profile 의 `iaas` credential 을 읽고 `getIaasToken` 호출.
- `src/commands/nks/supports.ts`
  - `nhncloud nks supports`.
  - 기본 table 은 Kubernetes version 과 지원 여부를 출력한다.
  - event type 은 `--json` 에서 raw 객체로 출력한다.
- `src/commands/nks/cluster.ts`
  - cluster subcommand container 생성.
  - `list` 만 Phase 1에서 구현.
  - 기본 table 컬럼: `uuid`, `name`, `status`, `health_status`, `node_count`, `kube_tag`.
- `src/index.ts`
  - `nks` command group 등록.

### 4. tests

- `src/services/nks/client.test.ts`
  - `supports()` 평면 JSON 성공.
  - `listClusters()` 평면 JSON 성공.
  - `OpenStack-API-Version` header 포함 단언.
  - 봉투 응답만 들어오면 형식 오류를 던지는 테스트를 둔다.
  - 형식 불일치 시 `EXIT_API_ERROR`.
- HTTP 401/403 mock 은 `toNhnCloudCliError` 매핑 유지.

### 5. task 상태

- `tasks/030-feat-nks/index.json` 에서 Phase 1 `status` 를 `completed` 로, `current_phase` 를 `2` 로 갱신한다.

## 회피 항목

- `grep -rnE "unwrap|unwrapHeader" src/services/nks` → 0건.
- `grep -rn "OpenStack-API-Version" src/services/nks src/commands/nks` → header 존재.
- `grep -rn "nksEndpoint" src/api src/cache src/commands/nks` → cache/read/write/resolve 모두 포함.
- `grep -rnE "nksEndpoint\\}/v1|nksEndpoint \\+ .*/v1" src/services/nks` → 0건.
- `grep -rnE "NhnCloudCliError\\([^,]+,\\s*[0-9]+" src/services/nks src/commands/nks` → 0건.

## 완료 조건

1. `pnpm tsc --noEmit` 0.
2. `pnpm run build` 정상.
3. `pnpm test` 정상.
4. `node dist/index.js nks --help` stdout 에 `supports` 와 `cluster` 가 포함된다.
5. `node dist/index.js nks supports --help` stdout 에 `supports` 가 포함된다.
6. `node dist/index.js nks cluster list --help` stdout 에 `cluster` 와 `list` 가 포함된다.
7. index.json 은 Phase 2 대기 상태로 갱신.

## 변경 파일 (정확)

- `src/api/endpoints.ts`
- `src/api/keystone.ts`
- `src/cache/token-store.ts`
- `src/services/nks/types.ts`
- `src/services/nks/client.ts`
- `src/services/nks/client.test.ts`
- `src/commands/nks/helpers.ts`
- `src/commands/nks/supports.ts`
- `src/commands/nks/cluster.ts`
- `src/index.ts`
- `tasks/030-feat-nks/index.json`

## 커밋

```bash
git commit -m "feat(nks): add base client and read commands"
```
