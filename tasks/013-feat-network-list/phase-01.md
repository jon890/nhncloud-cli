# Phase 01 — network endpoint 해석 확장: NETWORK host 맵 + networkEndpoint

## 목표

`network list`(VPC) · `subnet list`(서브넷)가 호출할 **network 서비스 endpoint** 를 기존 IaaS 토큰 흐름에 얹는다.

이 기능의 난이도는 명령 자체가 아니라 **endpoint 해석을 compute·image 외 type(network)으로 확장**하는 데 있다.
명령군은 instance 와 다른 서비스(VPC)지만, 인증은 같은 Keystone 토큰(`X-Auth-Token`)을 그대로 재사용한다 — 새 토큰을 발급하지 않는다.

phase-01 은 **endpoint 확장만** 한다(VPC/subnet 조회 명령은 phase-02). 선행 분리한 이유:
endpoint 해석이 keystone/token-store 구조 변경을 동반하고, 명령보다 회귀 위험이 크기 때문이다.

## 선행 의존 — 010(`tasks/010-feat-instance-images`) phase-01

이 phase 는 010 의 phase-01 이 세운 **IaaS 멀티 서비스 endpoint 해석 패턴 위에 한 줄 더 얹는** 작업이다.
010 phase-01 이 먼저 다음을 만들어 둔 상태를 전제한다.

- `endpoints.ts` 에 type 별 정적 host 맵(`INSTANCE_HOST` 외에 `IMAGE_HOST`)이 추가됨.
- `getIaasToken` 이 단일 `computeEndpoint` 가 아니라 **여러 endpoint(`computeEndpoint`·`imageEndpoint`)를 함께 반환**하도록 확장됨.
- `IaasTokenCache`(token-store.ts)가 추가 endpoint 필드를 보관하도록 확장됨.

> **착수 전 확인**: 010 phase-01 이 머지/적용됐는지 본다. `grep -c "imageEndpoint" src/api/keystone.ts` 가 0 이면 010 endpoint 확장이 아직 없는 것 — 그때는 이 phase 를 멈추고 사용자에게 "010 phase-01 선행 필요" 로 보고한다(blocked). 동일 구조를 이 phase 가 처음부터 새로 만들지 않는다(010 과 패턴 일관 유지).

## 핵심 설계 결정 — 정적 맵 노선 유지 (ADR-005/ADR-013 연장)

- service catalog type 이 compute·image 가 아니라 **`network`**. 하지만 같은 Keystone 토큰(`X-Auth-Token`)을 재사용한다 — 새 토큰 불필요.
- region 별 network host 도 compute·image 와 같은 정적 맵 방식으로 추가한다(catalog 동적 파싱은 기각 — 근거는 ADR-013, phase-03 에서 network 까지 보강).
- `getIaasToken` 의 반환·캐시에 `networkEndpoint` 를 더한다. compute·image·network 세 endpoint 를 한 토큰 캐시에 함께 보관한다.
- **경로에 tenantId 없음**: compute 는 `/v2/{tenantId}/servers`, network(VPC)는 NHN 고유 `/v2.0/vpcs`·`/v2.0/vpcsubnets` 로 **tenant segment 가 없다**. `networkEndpoint` 는 `https://<host>/v2.0` 형태(tenant 미포함).

## 미확인 항목 — 구현 전 실측(실제 호출로 endpoint 확인). 추측 구현 금지

다음은 docs 만으로 확정하지 못했다. **코드를 고치기 전에 실제 호출로 확인**한 뒤 확정한다.

1. **network host 패턴** — `<region>-api-network-infrastructure.nhncloudservice.com` 으로 **추정**이나 미확인.
   - compute 는 `<region>-api-instance-infrastructure...`, image 는 `<region>-api-image-infrastructure...` 이므로 network 는 `network-infrastructure` 일 것으로 본다.
   - 확인 방법(둘 중 가능한 쪽):
     - (a) Keystone 토큰 발급 응답의 `access.serviceCatalog` 에서 `type == "network"` endpoint 의 publicURL 을 1회 덤프해 실제 host 를 읽는다.
       (덤프는 일회성 확인용 — catalog 상시 파싱을 코드에 넣는 게 아니다.)
     - (b) 추정 host 로 `GET /v2.0/vpcs` 를 `X-Auth-Token` 으로 직접 호출해 200 이 오는지 확인.
2. **`/v2.0/vpcs` 경로의 tenant 유무 재확인** — VPC 는 `/v2.0/vpcs`(tenant segment 없음)로 **추정**이나, image 와 마찬가지로 실측으로 못 박는다.
   - 위 (b) 호출 시 tenant 없는 `/v2.0/vpcs` 와 tenant 포함 경로 중 어느 쪽이 200 인지 확인한다.
   - 확정된 경로 형태를 `networkEndpoint` 구성에 그대로 반영한다.

> 실측으로도 host/경로가 확정 안 되면 phase 를 멈추고 사용자에게 보고한다(blocked). 추측한 채로 구현·머지하지 않는다(CLAUDE.md "API 스펙 확인 절차").

## 변경 파일 (3개)

1. `src/api/endpoints.ts` — `NETWORK_HOST` 맵 + `networkHost(region)` 추가 (실측 확정 host 패턴 반영)
2. `src/api/keystone.ts` — `getIaasToken` 반환에 `networkEndpoint` 추가 + 캐시 read/write 에 반영
3. `src/cache/token-store.ts` — `IaasTokenCache` 에 `networkEndpoint` 필드 추가 + 가드·read·write 확장

## 회피 항목 (code-review-pitfalls 사전 확인)

- **4-2 (같은 목록 여러 곳 정의 → 동기화 누락)**: region 코드(kr1/kr2/kr3/jp1)가 `INSTANCE_HOST`·`IMAGE_HOST`·새 `NETWORK_HOST` **세 맵에 중복**된다. 한쪽에 region 추가 시 다른 쪽 누락 위험 → 세 맵의 key 집합이 일치하는지 성공 기준 grep 으로 강제 검증한다. (이상적으로는 region 목록을 단일 배열에서 파생하나, 010 의 최소 변경 노선을 따라 동기화 검증으로 가드.)
- **9-1 (exit code 리터럴 금지)**: `networkHost` 미등록 region 에러는 `EXIT_PARAM_ERROR` **상수** 사용(`instanceHost`·`imageHost` 와 동일 패턴, 숫자 리터럴·주석 금지).
- **1-2 (spinner leak)**: phase-01 은 명령이 없어 spinner 무관 — phase-02 에서 적용.
- **2-1 / type 변경 → tsc**: 캐시 구조(interface) 변경 = type 변경 → 성공 기준에 `pnpm tsc --noEmit` 필수(tsup 은 type-check 우회).
- **캐시 하위호환**: 기존 캐시 파일에는 `networkEndpoint` 가 없다. `isIaasTokenCache` 가드가 `networkEndpoint` 를 **필수**로 요구하면, 구버전 캐시(010 적용 후·013 적용 전 캐시 포함)는 가드 실패 → `null` 반환 → 토큰 재발급으로 자연 복구된다(설계상 OK, 손상 아님). 010 이 남긴 동일 주석 옆에 한 줄 보탠다.

## 작업 상세

### 1. `src/api/endpoints.ts`

`IMAGE_HOST` 맵(010 이 추가) **뒤** 에 network host 맵과 helper 를 추가한다. **host 패턴은 위 실측으로 확정한 값**을 쓴다(아래는 추정 — 실측 결과로 교체).

```ts
/**
 * region → network(NHN VPC) API host 맵 (ADR-013, ADR-005 연장).
 * network 서비스는 compute·image 와 다른 host 지만 같은 Keystone 토큰을 재사용한다.
 * NHN VPC 는 raw Neutron(/v2.0/networks)이 아니라 NHN 고유 /v2.0/vpcs·/v2.0/vpcsubnets 다.
 * region key 집합은 INSTANCE_HOST·IMAGE_HOST 와 일치해야 한다 (셋 다 IaaS region).
 */
const NETWORK_HOST: Record<string, string> = {
  // ⚠️ 실측 확정 전까지 추정값 — phase-01 실측 후 확정값으로 교체
  kr1: "kr1-api-network-infrastructure.nhncloudservice.com",
  kr2: "kr2-api-network-infrastructure.nhncloudservice.com",
  kr3: "kr3-api-network-infrastructure.nhncloudservice.com",
  jp1: "jp1-api-network-infrastructure.nhncloudservice.com",
};

/**
 * region 에 해당하는 network API host 를 반환한다.
 * 미등록 region 은 EXIT_PARAM_ERROR.
 */
export function networkHost(region: string): string {
  const host = NETWORK_HOST[region];
  if (!host) {
    throw new NhnCloudCliError(
      `지원하지 않는 region 입니다: "${region}". 사용 가능한 region: ${Object.keys(NETWORK_HOST).join(", ")}`,
      EXIT_PARAM_ERROR,
    );
  }
  return host;
}
```

### 2. `src/api/keystone.ts`

> 아래는 **010 phase-01 적용 후 상태**(반환·캐시에 `imageEndpoint` 가 이미 있는 상태)를 전제로 한 추가 diff 다. `imageEndpoint` 가 들어간 자리마다 `networkEndpoint` 를 나란히 더한다.

(a) import 에 `networkHost` 추가:

```ts
import { keystoneIdentityUrl, instanceHost, imageHost, networkHost } from "./endpoints.js";
```

(b) 반환 타입에 `networkEndpoint` 추가:

```ts
export async function getIaasToken(
  profile: string,
  iaas: IaasCredential,
  forceRefresh = false,
): Promise<{
  tokenId: string;
  computeEndpoint: string;
  imageEndpoint: string;
  networkEndpoint: string;
}> {
```

(c) 캐시 hit 경로에서도 `networkEndpoint` 를 전달:

```ts
  if (!forceRefresh) {
    const cached = await readIaasToken(profile, iaas.region);
    if (cached !== null) {
      return {
        tokenId: cached.tokenId,
        computeEndpoint: cached.computeEndpoint,
        imageEndpoint: cached.imageEndpoint,
        networkEndpoint: cached.networkEndpoint,
      };
    }
  }
```

(d) host 구성 — compute·image·network. **network 경로는 tenant segment 없음**(NHN VPC, 실측 확정):

```ts
  const host = instanceHost(iaas.region);
  const computeEndpoint = `https://${host}/v2/${encodeURIComponent(iaas.tenantId)}`;

  // image(Glance v2): 같은 토큰 재사용, host 만 다르다 (010).
  const imageEndpoint = `https://${imageHost(iaas.region)}/v2`;

  // network(NHN VPC): 같은 토큰 재사용, host 만 다르다. tenant segment 없음.
  // ⚠️ host 패턴·tenant 유무는 phase-01 실측으로 확정 — 아래는 tenant 없는 추정 경로
  const networkEndpoint = `https://${networkHost(iaas.region)}/v2.0`;
```

(e) write·return 에 `networkEndpoint` 포함:

```ts
  if (!forceRefresh) {
    await writeIaasToken(profile, iaas.region, {
      tokenId,
      expiresAt,
      computeEndpoint,
      imageEndpoint,
      networkEndpoint,
    });
  }

  return { tokenId, computeEndpoint, imageEndpoint, networkEndpoint };
```

### 3. `src/cache/token-store.ts`

> 마찬가지로 010 phase-01 적용 후(`imageEndpoint` 필드가 이미 있는) 상태에 `networkEndpoint` 를 나란히 더한다.

(a) `IaasTokenCache` interface 에 `networkEndpoint` 추가:

```ts
interface IaasTokenCache {
  tokenId: string;
  expiresAt: string; // ISO 8601
  computeEndpoint: string;
  imageEndpoint: string;
  networkEndpoint: string;
}
```

(b) 가드에 `networkEndpoint` 검사 추가:

```ts
function isIaasTokenCache(val: unknown): val is IaasTokenCache {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj["tokenId"] === "string" &&
    typeof obj["expiresAt"] === "string" &&
    typeof obj["computeEndpoint"] === "string" &&
    typeof obj["imageEndpoint"] === "string" &&
    typeof obj["networkEndpoint"] === "string"
  );
}
```

> 하위호환: 구버전 캐시는 `networkEndpoint` 가 없어 가드 실패 → `readIaasToken` 이 `null` 반환 → 토큰 재발급으로 자연 복구(손상 아님). 010 이 남긴 주석 옆에 한 줄 보탠다.

(c) `readIaasToken` 반환 타입·반환 객체에 `networkEndpoint` 추가:

```ts
export async function readIaasToken(
  profile: string,
  region: string,
): Promise<{
  tokenId: string;
  expiresAt: string;
  computeEndpoint: string;
  imageEndpoint: string;
  networkEndpoint: string;
} | null> {
```

```ts
    return {
      tokenId: parsed.tokenId,
      expiresAt: parsed.expiresAt,
      computeEndpoint: parsed.computeEndpoint,
      imageEndpoint: parsed.imageEndpoint,
      networkEndpoint: parsed.networkEndpoint,
    };
```

(d) `writeIaasToken` data 타입·저장 객체에 `networkEndpoint` 추가:

```ts
export async function writeIaasToken(
  profile: string,
  region: string,
  data: {
    tokenId: string;
    expiresAt: string;
    computeEndpoint: string;
    imageEndpoint: string;
    networkEndpoint: string;
  },
): Promise<void> {
```

```ts
  const cache: IaasTokenCache = {
    tokenId: data.tokenId,
    expiresAt: data.expiresAt,
    computeEndpoint: data.computeEndpoint,
    imageEndpoint: data.imageEndpoint,
    networkEndpoint: data.networkEndpoint,
  };
```

> `resolveInstanceClient`(helpers.ts)는 phase-01 에서 건드리지 않는다 — `getIaasToken` 의 추가 반환 필드(`networkEndpoint`)는 destructuring 에서 무시되므로 컴파일·동작 모두 깨지지 않는다. network endpoint 를 client 에 넘기는 작업은 phase-02 의 새 `resolveNetworkClient` 에서 한다.

## 성공 기준 (검증 명령 + 기대값)

```bash
# cwd: <repo root 또는 worktree>

# 0. 선행 의존 확인 — 010 endpoint 확장이 적용된 상태여야 함
grep -c "imageEndpoint" src/api/keystone.ts
# 기대: 1 이상 (0 이면 010 phase-01 선행 필요 — blocked 보고)

# 1. 타입 체크 — 캐시 interface·getIaasToken 반환 변경 → 필수
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l
# 기대: 0

# 2. 빌드 성공
pnpm build
# 기대: dist/index.js 생성, exit 0

# 3. 기존 instance 명령 회귀 없음 (endpoint 확장이 기존 흐름을 안 깨는지)
node dist/index.js instance --help 2>&1 | grep -Ec "list|get|create|delete"
# 기대: 4 (network/subnet 은 phase-02 에서 별도 명령군으로 등록 — instance 하위 아님)

# 4. INSTANCE_HOST·IMAGE_HOST·NETWORK_HOST 의 region key 집합 일치 (4-2 동기화)
#    `<NAME>: Record<...> = { ... }` 선언만 매칭(함수 안의 NAME[region] 접근은 제외)
node -e "const s=require('fs').readFileSync('src/api/endpoints.ts','utf8'); const re=/(INSTANCE_HOST|IMAGE_HOST|NETWORK_HOST):\s*Record<[^>]*>\s*=\s*\{([^}]*)\}/g; const keys={}; let m; while((m=re.exec(s))){keys[m[1]]=(m[2].match(/\b(kr1|kr2|kr3|jp1)\b/g)||[]).sort().join(',');} const vals=Object.values(keys); console.log(vals.length===3 && vals.every(v=>v===vals[0]) ? 'MATCH' : 'MISMATCH:'+JSON.stringify(keys));"
# 기대: MATCH

# 5. networkHost 미등록 region 에러가 EXIT_PARAM_ERROR 상수 사용 (9-1)
grep -nE "networkHost" src/api/endpoints.ts >/dev/null && grep -nE "NhnCloudCliError\([^,]+,\s*[0-9]+" src/api/endpoints.ts | wc -l
# 기대: 0 (숫자 리터럴 exit code 없음)

# 6. getIaasToken 반환에 networkEndpoint 포함
grep -c "networkEndpoint" src/api/keystone.ts
# 기대: 3 이상 (반환 타입 + 캐시 hit + host 구성/write/return)

# 7. 캐시 가드가 networkEndpoint 검사
grep -c 'networkEndpoint' src/cache/token-store.ts
# 기대: 5 이상 (interface·guard·read 타입·read 반환·write)

# 8. network 경로에 tenant segment 없음 (NHN VPC) — networkEndpoint 가 /v2.0 로 끝남(tenantId 미포함)
grep -nE "networkEndpoint\s*=" src/api/keystone.ts
# 기대: `https://${networkHost(...)}/v2.0` (encodeURIComponent(iaas.tenantId) 가 없어야 함)
```

## 수동 확인 (실측 — 자격증명 필요, 사용자/구현자 직접 수행)

```bash
# network host 패턴 + /v2.0/vpcs tenant 유무 실측 (구현 전 1회).
# 개인 식별 정보는 placeholder — 실제 토큰/region 으로 치환해 실행.
#   <region>: kr1 등,  <token>: Keystone 발급 X-Auth-Token

# (a) 추정 host + tenant 없는 경로 — 200 이면 추정 확정
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "X-Auth-Token: <token>" \
  "https://<region>-api-network-infrastructure.nhncloudservice.com/v2.0/vpcs"
# 기대: 200 (아니면 host/경로 추정 오류 → 아래 (b) 로 catalog 확인)

# (b) Keystone catalog 에서 type==network 의 publicURL 실제 host 확인 (일회성 덤프)
#     토큰 발급 응답 JSON 에서: access.serviceCatalog[] | type=="network" | endpoints[0].publicURL
# 확정 host/경로를 endpoints.ts NETWORK_HOST + keystone.ts networkEndpoint 에 반영

# (c) subnet 경로도 같은 host 에서 확인
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "X-Auth-Token: <token>" \
  "https://<region>-api-network-infrastructure.nhncloudservice.com/v2.0/vpcsubnets"
# 기대: 200
```

실측으로 host 패턴·tenant 유무를 확정한 뒤에야 코드의 추정값을 확정값으로 교체한다.
