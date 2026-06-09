# Phase 01 — blockstorage endpoint 해석 확장: BLOCKSTORAGE host 맵 + blockStorageEndpoint

## 목표

`volume list/get/create` 가 호출할 **Block Storage 서비스 endpoint** 를 기존 IaaS 토큰 흐름에 얹는다.

이 기능의 난이도는 명령 자체가 아니라 **endpoint 해석을 compute 외 type(volumev2) 으로 확장**하는 데 있다.
010(image endpoint 확장, ADR-013 도입) 과 013(network host 추가) 이 같은 패턴으로 `getIaasToken`·iaas-token 캐시를 이미 넓혀 둔다.
017 은 그 구조 위에 **host 한 개(blockstorage)** 를 더한다.

phase-01 은 **endpoint 확장만** 한다 (volume 명령은 phase-02, instance volume attach/detach 는 phase-03).
선행 분리한 이유: endpoint 해석이 keystone/token-store 구조 변경을 동반하고, 명령보다 회귀 위험이 크기 때문이다.

## 선행 의존 (반드시 먼저 머지된 상태에서 시작)

- **010 phase-01** — `getIaasToken` 반환·iaas-token 캐시에 `imageEndpoint` 를 더하고 멀티서비스 host 맵 패턴(ADR-013)을 도입한 선행 작업.
- **013(network endpoint 확장) phase-01** — 같은 캐시 구조에 `networkEndpoint`(network host)를 더한 선행 작업.
  - ⚠️ 현재 `tasks/013-feat-network-list/` 폴더는 아직 생성되지 않았다(ROADMAP 백로그에만 존재).
    013 task 폴더를 먼저 생성·구현하거나, 010 패턴만으로 진행할지 사용자에게 확정한 뒤 시작한다.
  - 본 phase 는 010·013 이 확립한 "한 토큰 캐시에 type 별 endpoint 를 함께 보관" 구조를 전제로 작성됐다.

`getIaasToken` 의 반환은 이미 `{ tokenId, computeEndpoint, imageEndpoint, networkEndpoint }` 형태일 것이다.
017 은 여기에 `blockStorageEndpoint` 를 더한다.

## 핵심 설계 결정 — 정적 맵 노선 유지 (ADR-005 / ADR-013 연장)

- service catalog type 이 compute 가 아니라 **`volumev2`**(OpenStack Cinder v2). 하지만 같은 Keystone 토큰(`X-Auth-Token`)을 재사용한다.
- region 별 block storage host 도 compute·image·network 와 같은 정적 맵 방식으로 추가한다 (catalog 동적 파싱은 ADR-013 에서 이미 기각).
- **경로는 compute 와 같은 모양** — `/v2/{tenantId}/volumes`. image(Glance, tenant 없음)와 다르다.
  block storage 는 host 만 다르고 tenant segment 를 **포함**한다.
- `getIaasToken` 의 반환·캐시에 `blockStorageEndpoint` 를 더한다 (compute·image·network 와 한 토큰 캐시에 함께 보관).

## 확정 사항 (docs 확인 완료 — 이 부분은 실측 불요)

- host: `<region>-api-block-storage-infrastructure.nhncloudservice.com`
- 경로: `/v2/{tenantId}/volumes` (compute 와 동일하게 tenantId **포함**)
- catalog type: `volumev2`

> attach/detach 의 Nova `os-volume_attachments` 지원 여부 실측은 phase-03 에서 한다.
> phase-01 의 block storage host/경로는 docs 확정이라 실측 불요. 다만 첫 실제 호출(phase-02)에서 200 이 안 오면 그 시점에 host 패턴을 재확인한다.

## 변경 파일 (3개)

1. `src/api/endpoints.ts` — `BLOCKSTORAGE_HOST` 맵 + `blockStorageHost(region)` 추가
2. `src/api/keystone.ts` — `getIaasToken` 반환에 `blockStorageEndpoint` 추가 + 캐시 read/write 에 반영
3. `src/cache/token-store.ts` — `IaasTokenCache` 에 `blockStorageEndpoint` 필드 추가 + 가드·read·write 확장

## 회피 항목 (code-review-pitfalls 사전 확인)

- **4-2 (같은 목록 여러 곳 정의 → 동기화 누락)**: region 코드(kr1/kr2/kr3/jp1)가 이제 `INSTANCE_HOST`·`IMAGE_HOST`·`NETWORK_HOST`·새 `BLOCKSTORAGE_HOST` **3~4 맵에 중복**된다. 한쪽에 region 추가 시 다른 쪽 누락 위험 → 모든 host 맵의 region key 집합이 일치하는지 성공 기준 grep 으로 강제 검증한다.
- **9-1 (exit code 리터럴 금지)**: `blockStorageHost` 미등록 region 에러는 `EXIT_PARAM_ERROR` **상수** 사용(`instanceHost` 와 동일 패턴, 숫자 리터럴·주석 금지).
- **1-2 (spinner leak)**: phase-01 은 명령이 없어 spinner 무관 — phase-02 에서 적용.
- **2-1 / type 변경 → tsc**: 캐시 구조(interface) 변경 = type 변경 → 성공 기준에 `pnpm tsc --noEmit` 필수.
- **캐시 하위호환**: 기존 캐시 파일에는 `blockStorageEndpoint` 가 없다. `isIaasTokenCache` 가드가 이를 **필수**로 요구하면, 구버전 캐시는 가드 실패 → `null` 반환 → 토큰 재발급으로 자연 복구된다(설계상 OK, 손상 아님). 010·013 이 이미 같은 동작이므로 주석 한 줄로 일관성만 유지한다.

## 작업 상세

### 1. `src/api/endpoints.ts`

`IMAGE_HOST`·`NETWORK_HOST` 맵 **뒤** 에 block storage host 맵과 helper 를 추가한다.

```ts
/**
 * region → Block Storage(Cinder volumev2) API host 맵 (ADR-013, ADR-005 연장).
 * block storage 는 compute 와 다른 host 지만 같은 Keystone 토큰을 재사용한다.
 * 경로는 compute 와 동일하게 /v2/{tenantId}/... 형태(tenant 포함) — image(Glance)와 다르다.
 * region key 집합은 INSTANCE_HOST(및 IMAGE/NETWORK_HOST)와 일치해야 한다 (모두 IaaS region).
 */
const BLOCKSTORAGE_HOST: Record<string, string> = {
  kr1: "kr1-api-block-storage-infrastructure.nhncloudservice.com",
  kr2: "kr2-api-block-storage-infrastructure.nhncloudservice.com",
  kr3: "kr3-api-block-storage-infrastructure.nhncloudservice.com",
  jp1: "jp1-api-block-storage-infrastructure.nhncloudservice.com",
};

/**
 * region 에 해당하는 Block Storage API host 를 반환한다.
 * 미등록 region 은 EXIT_PARAM_ERROR.
 */
export function blockStorageHost(region: string): string {
  const host = BLOCKSTORAGE_HOST[region];
  if (!host) {
    throw new NhnCloudCliError(
      `지원하지 않는 region 입니다: "${region}". 사용 가능한 region: ${Object.keys(BLOCKSTORAGE_HOST).join(", ")}`,
      EXIT_PARAM_ERROR,
    );
  }
  return host;
}
```

> region key 집합은 위 다른 host 맵과 정확히 같아야 한다 — 성공 기준 grep 으로 검증.

### 2. `src/api/keystone.ts`

(a) import 에 `blockStorageHost` 추가 (기존 `instanceHost, imageHost, networkHost` 옆):

```ts
import { keystoneIdentityUrl, instanceHost, imageHost, networkHost, blockStorageHost } from "./endpoints.js";
```

(b) 반환 타입에 `blockStorageEndpoint` 추가 (010·013 이 더한 필드 옆):

```ts
): Promise<{
  tokenId: string;
  computeEndpoint: string;
  imageEndpoint: string;
  networkEndpoint: string;
  blockStorageEndpoint: string;
}> {
```

(c) 캐시 hit 경로에서도 `blockStorageEndpoint` 를 전달:

```ts
  if (!forceRefresh) {
    const cached = await readIaasToken(profile, iaas.region);
    if (cached !== null) {
      return {
        tokenId: cached.tokenId,
        computeEndpoint: cached.computeEndpoint,
        imageEndpoint: cached.imageEndpoint,
        networkEndpoint: cached.networkEndpoint,
        blockStorageEndpoint: cached.blockStorageEndpoint,
      };
    }
  }
```

(d) host 구성 — block storage 는 **compute 와 같은 tenant 포함 경로**:

```ts
  // block storage(Cinder volumev2): 같은 토큰 재사용, host 만 다르고 경로는 compute 와 동일(tenant 포함).
  const blockStorageEndpoint =
    `https://${blockStorageHost(iaas.region)}/v2/${encodeURIComponent(iaas.tenantId)}`;
```

(e) write·return 에 `blockStorageEndpoint` 포함:

```ts
  if (!forceRefresh) {
    await writeIaasToken(profile, iaas.region, {
      tokenId,
      expiresAt,
      computeEndpoint,
      imageEndpoint,
      networkEndpoint,
      blockStorageEndpoint,
    });
  }

  return { tokenId, computeEndpoint, imageEndpoint, networkEndpoint, blockStorageEndpoint };
```

### 3. `src/cache/token-store.ts`

(a) `IaasTokenCache` interface 에 `blockStorageEndpoint` 추가:

```ts
interface IaasTokenCache {
  tokenId: string;
  expiresAt: string; // ISO 8601
  computeEndpoint: string;
  imageEndpoint: string;
  networkEndpoint: string;
  blockStorageEndpoint: string;
}
```

(b) 가드에 `blockStorageEndpoint` 검사 추가:

```ts
function isIaasTokenCache(val: unknown): val is IaasTokenCache {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj["tokenId"] === "string" &&
    typeof obj["expiresAt"] === "string" &&
    typeof obj["computeEndpoint"] === "string" &&
    typeof obj["imageEndpoint"] === "string" &&
    typeof obj["networkEndpoint"] === "string" &&
    typeof obj["blockStorageEndpoint"] === "string"
  );
}
```

> 하위호환: 구버전 캐시는 `blockStorageEndpoint` 가 없어 가드 실패 → `readIaasToken` 이 `null` 반환 → 토큰 재발급으로 자연 복구(손상 아님). 010·013 의 `imageEndpoint`·`networkEndpoint` 와 동일 동작 — 가드 위 주석을 그대로 잇는다.

(c) `readIaasToken` 반환 타입·반환 객체에 `blockStorageEndpoint` 추가:

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
  blockStorageEndpoint: string;
} | null> {
```

```ts
    return {
      tokenId: parsed.tokenId,
      expiresAt: parsed.expiresAt,
      computeEndpoint: parsed.computeEndpoint,
      imageEndpoint: parsed.imageEndpoint,
      networkEndpoint: parsed.networkEndpoint,
      blockStorageEndpoint: parsed.blockStorageEndpoint,
    };
```

(d) `writeIaasToken` data 타입·저장 객체에 `blockStorageEndpoint` 추가:

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
    blockStorageEndpoint: string;
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
    blockStorageEndpoint: data.blockStorageEndpoint,
  };
```

> `resolveInstanceClient`(instance/helpers.ts)는 phase-01 에서 건드리지 않는다 — `getIaasToken` 의 추가 반환 필드(`blockStorageEndpoint`)는 destructuring 에서 무시되므로 컴파일·동작 모두 깨지지 않는다. block storage endpoint 를 client 에 넘기는 작업(resolveVolumeClient)은 phase-02 에서 한다.

## 성공 기준 (검증 명령 + 기대값)

```bash
# cwd: <repo root 또는 worktree>

# 1. 타입 체크 — 캐시 interface·getIaasToken 반환 변경 → 필수 (2-1)
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l
# 기대: 0

# 2. 빌드 성공
pnpm build
# 기대: dist/index.js 생성, exit 0

# 3. 기존 instance 명령 회귀 없음 (endpoint 확장이 기존 흐름을 안 깨는지)
node dist/index.js instance --help 2>&1 | grep -Ec "list|get|create|delete"
# 기대: 4 (volume 명령은 phase-02 에서 등록 — 여기선 미등록)

# 4. 모든 host 맵의 region key 집합 일치 (4-2 동기화 — 3~4 맵)
node -e "const s=require('fs').readFileSync('src/api/endpoints.ts','utf8'); const re=/(INSTANCE_HOST|IMAGE_HOST|NETWORK_HOST|BLOCKSTORAGE_HOST)[^{]*\{([^}]*)\}/g; const keys={}; let m; while((m=re.exec(s))){keys[m[1]]=(m[2].match(/\b(kr1|kr2|kr3|jp1)\b/g)||[]).sort().join(',');} const vals=Object.values(keys); const allSame=vals.length>=2 && vals.every(v=>v===vals[0]); console.log(allSame ? 'MATCH' : 'MISMATCH:'+JSON.stringify(keys));"
# 기대: MATCH (BLOCKSTORAGE_HOST 가 다른 host 맵과 같은 region 집합)

# 5. blockStorageHost 미등록 region 에러가 EXIT_PARAM_ERROR 상수 사용 (9-1)
grep -nE "blockStorageHost" src/api/endpoints.ts >/dev/null && grep -nE "NhnCloudCliError\([^,]+,\s*[0-9]+" src/api/endpoints.ts | wc -l
# 기대: 0 (숫자 리터럴 exit code 없음)

# 6. getIaasToken 반환에 blockStorageEndpoint 포함
grep -c "blockStorageEndpoint" src/api/keystone.ts
# 기대: 3 이상 (반환 타입 + 캐시 hit + write/return)

# 7. 캐시 가드가 blockStorageEndpoint 검사
grep -c 'blockStorageEndpoint' src/cache/token-store.ts
# 기대: 5 이상 (interface·guard·read 타입·read 반환·write)

# 8. block storage 경로가 tenant 포함(/v2/${...tenantId}) 형태 — image(tenant 없음)와 구분
grep -nE "blockStorageHost\(iaas\.region\).*tenantId" src/api/keystone.ts
# 기대: 1건 (tenant segment 포함 — compute 와 같은 모양)
```

## 수동 확인

- `pnpm tsc --noEmit` 가 0 인지(캐시 구조 변경은 build 만으론 type 검증 안 됨 — tsup/esbuild 는 type-check skip).
- 기존 캐시 파일(`~/.nhncloud/cache/iaas-token-*.json`)이 있으면 1회 무효화되어 재발급되는지(정상 — 손상 아님). 자격증명이 있으면 `node dist/index.js instance list` 가 여전히 동작하는지 확인.
