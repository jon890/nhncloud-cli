# Phase 01 — endpoint 해석 확장: IMAGE host 맵 + imageEndpoint

## 목표

`instance images` 가 호출할 **image 서비스 endpoint** 를 기존 IaaS 토큰 흐름에 얹는다.

이 기능의 난이도는 명령 자체가 아니라 **endpoint 해석을 compute 외 type(image) 으로 확장**하는 데 있다.
기존 코드(`endpoints.ts` / `keystone.ts`)는 compute host 만 정적 맵으로 갖고,
Keystone 응답의 serviceCatalog 를 파싱하지 않는다(ADR-005 가 catalog 동적 파싱을 기각).

phase-01 은 **endpoint 확장만** 한다 (image 조회 명령은 phase-02). 선행 분리한 이유:
endpoint 해석이 keystone/token-store 구조 변경을 동반하고, 명령보다 회귀 위험이 크기 때문이다.

## 핵심 설계 결정 — 정적 맵 노선 유지 (ADR-005 연장)

- service catalog type 이 compute 가 아니라 **`image`**(Glance v2). 하지만 같은 Keystone 토큰(`X-Auth-Token`)을 재사용한다.
- region 별 image host 도 compute 와 같은 정적 맵 방식으로 추가한다 (catalog 동적 파싱은 기각 — 근거는 phase-03 의 ADR-013).
- `getIaasToken` 의 반환·캐시에 `imageEndpoint` 를 더한다. compute·image 두 endpoint 를 한 토큰 캐시에 함께 보관한다.

## 미확인 항목 — 구현 전 실측(실제 호출로 endpoint 확인). 추측 구현 금지

다음 두 가지는 docs 만으로 확정하지 못했다. **코드를 고치기 전에 실제 호출로 확인**한 뒤 확정한다.

1. **image host 패턴** — `<region>-api-image-infrastructure.nhncloudservice.com` 으로 **추정**이나 미확인.
   - compute 는 `<region>-api-instance-infrastructure...` 이므로 image 는 `instance` 자리가 `image` 일 것으로 본다.
   - 확인 방법(둘 중 가능한 쪽):
     - (a) Keystone 토큰 발급 응답의 `access.serviceCatalog` 에서 `type == "image"` endpoint 의 publicURL 을 1회 덤프해 실제 host 를 읽는다.
       (덤프는 일회성 확인용 — catalog 상시 파싱을 코드에 넣는 게 아니다.)
     - (b) 추정 host 로 `GET /v2/images?limit=1` 을 `X-Auth-Token` 으로 직접 호출해 200 이 오는지 확인.
2. **`/v2/images` 경로의 tenant 유무** — compute 는 `/v2/{tenantId}/servers`, image(Glance)는 `/v2/images` 로 **tenant segment 가 없다고 추정**이나 미확인.
   - 위 (b) 호출 시 tenant 없는 `/v2/images` 와 tenant 포함 `/v2/{tenantId}/images` 중 어느 쪽이 200 인지 확인.
   - 확정된 경로 형태를 `imageEndpoint` 구성에 그대로 반영한다.

> 실측으로도 host/경로가 확정 안 되면 phase 를 멈추고 사용자에게 보고한다(blocked). 추측한 채로 구현·머지하지 않는다(CLAUDE.md "API 스펙 확인 절차").

## 변경 파일 (3개)

1. `src/api/endpoints.ts` — `IMAGE_HOST` 맵 + `imageHost(region)` 추가 (실측 확정 host 패턴 반영)
2. `src/api/keystone.ts` — `getIaasToken` 반환에 `imageEndpoint` 추가 + 캐시 read/write 에 반영
3. `src/cache/token-store.ts` — `IaasTokenCache` 에 `imageEndpoint` 필드 추가 + 가드·read·write 확장

## 회피 항목 (code-review-pitfalls 사전 확인)

- **4-2 (같은 목록 두 곳 정의 → 동기화 누락)**: region 코드(kr1/kr2/kr3/jp1)가 `INSTANCE_HOST` 와 새 `IMAGE_HOST` **두 맵에 중복**된다. 한쪽에 region 추가 시 다른 쪽 누락 위험 → 두 맵의 key 집합이 일치하는지 성공 기준 grep 으로 강제 검증한다. (이상적으로는 region 목록을 단일 배열에서 파생하나, 최소 변경 우선 — 동기화 검증으로 가드.)
- **9-1 (exit code 리터럴 금지)**: `imageHost` 미등록 region 에러는 `EXIT_PARAM_ERROR` **상수** 사용(`instanceHost` 와 동일 패턴, 숫자 리터럴·주석 금지).
- **1-2 (spinner leak)**: phase-01 은 명령이 없어 spinner 무관 — phase-02 에서 적용.
- **2-1 / type 변경 → tsc**: 캐시 구조(interface) 변경 = type 변경 → 성공 기준에 `pnpm tsc --noEmit` 필수.
- **캐시 하위호환**: 기존 캐시 파일에는 `imageEndpoint` 가 없다. `isIaasTokenCache` 가드가 `imageEndpoint` 를 **필수**로 요구하면, 구버전 캐시는 가드 실패 → `null` 반환 → 토큰 재발급으로 자연 복구된다(설계상 OK, 손상 아님). 이 동작을 주석으로 남긴다.

## 작업 상세

### 1. `src/api/endpoints.ts`

`INSTANCE_HOST` 맵 **뒤** 에 image host 맵과 helper 를 추가한다. **host 패턴은 위 실측으로 확정한 값**을 쓴다(아래는 추정 — 실측 결과로 교체).

```ts
/**
 * region → image(Glance v2) API host 맵 (ADR-013, ADR-005 연장).
 * image 서비스는 compute 와 다른 host 지만 같은 Keystone 토큰을 재사용한다.
 * region key 집합은 INSTANCE_HOST 와 일치해야 한다 (둘 다 IaaS region).
 */
const IMAGE_HOST: Record<string, string> = {
  // ⚠️ 실측 확정 전까지 추정값 — phase-01 실측 후 확정값으로 교체
  kr1: "kr1-api-image-infrastructure.nhncloudservice.com",
  kr2: "kr2-api-image-infrastructure.nhncloudservice.com",
  kr3: "kr3-api-image-infrastructure.nhncloudservice.com",
  jp1: "jp1-api-image-infrastructure.nhncloudservice.com",
};

/**
 * region 에 해당하는 image API host 를 반환한다.
 * 미등록 region 은 EXIT_PARAM_ERROR.
 */
export function imageHost(region: string): string {
  const host = IMAGE_HOST[region];
  if (!host) {
    throw new NhnCloudCliError(
      `지원하지 않는 region 입니다: "${region}". 사용 가능한 region: ${Object.keys(IMAGE_HOST).join(", ")}`,
      EXIT_PARAM_ERROR,
    );
  }
  return host;
}
```

### 2. `src/api/keystone.ts`

(a) import 에 `imageHost` 추가:

```ts
import { keystoneIdentityUrl, instanceHost, imageHost } from "./endpoints.js";
```

(b) 반환 타입에 `imageEndpoint` 추가:

```ts
export async function getIaasToken(
  profile: string,
  iaas: IaasCredential,
  forceRefresh = false,
): Promise<{ tokenId: string; computeEndpoint: string; imageEndpoint: string }> {
```

(c) 캐시 hit 경로에서도 `imageEndpoint` 를 전달:

```ts
  if (!forceRefresh) {
    const cached = await readIaasToken(profile, iaas.region);
    if (cached !== null) {
      return {
        tokenId: cached.tokenId,
        computeEndpoint: cached.computeEndpoint,
        imageEndpoint: cached.imageEndpoint,
      };
    }
  }
```

(d) host 구성 — compute 와 image 둘 다. **image 경로의 tenant 유무는 실측 확정값 반영**:

```ts
  const host = instanceHost(iaas.region);
  const computeEndpoint = `https://${host}/v2/${encodeURIComponent(iaas.tenantId)}`;

  // image(Glance v2): 같은 토큰 재사용, host 만 다르다.
  // ⚠️ tenant segment 유무는 phase-01 실측으로 확정 — 아래는 tenant 없는 추정 경로
  const imageEndpoint = `https://${imageHost(iaas.region)}/v2`;
```

(e) write·return 에 `imageEndpoint` 포함:

```ts
  if (!forceRefresh) {
    await writeIaasToken(profile, iaas.region, {
      tokenId,
      expiresAt,
      computeEndpoint,
      imageEndpoint,
    });
  }

  return { tokenId, computeEndpoint, imageEndpoint };
```

### 3. `src/cache/token-store.ts`

(a) `IaasTokenCache` interface 에 `imageEndpoint` 추가:

```ts
interface IaasTokenCache {
  tokenId: string;
  expiresAt: string; // ISO 8601
  computeEndpoint: string;
  imageEndpoint: string;
}
```

(b) 가드에 `imageEndpoint` 검사 추가:

```ts
function isIaasTokenCache(val: unknown): val is IaasTokenCache {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj["tokenId"] === "string" &&
    typeof obj["expiresAt"] === "string" &&
    typeof obj["computeEndpoint"] === "string" &&
    typeof obj["imageEndpoint"] === "string"
  );
}
```

> 하위호환: 구버전 캐시는 `imageEndpoint` 가 없어 가드 실패 → `readIaasToken` 이 `null` 반환 → 토큰 재발급으로 자연 복구(손상 아님). 가드 위에 한 줄 주석으로 남긴다.

(c) `readIaasToken` 반환 타입·반환 객체에 `imageEndpoint` 추가:

```ts
export async function readIaasToken(
  profile: string,
  region: string,
): Promise<{
  tokenId: string;
  expiresAt: string;
  computeEndpoint: string;
  imageEndpoint: string;
} | null> {
```

```ts
    return {
      tokenId: parsed.tokenId,
      expiresAt: parsed.expiresAt,
      computeEndpoint: parsed.computeEndpoint,
      imageEndpoint: parsed.imageEndpoint,
    };
```

(d) `writeIaasToken` data 타입·저장 객체에 `imageEndpoint` 추가:

```ts
export async function writeIaasToken(
  profile: string,
  region: string,
  data: { tokenId: string; expiresAt: string; computeEndpoint: string; imageEndpoint: string },
): Promise<void> {
```

```ts
  const cache: IaasTokenCache = {
    tokenId: data.tokenId,
    expiresAt: data.expiresAt,
    computeEndpoint: data.computeEndpoint,
    imageEndpoint: data.imageEndpoint,
  };
```

> `resolveInstanceClient`(helpers.ts)는 phase-01 에서 건드리지 않는다 — `getIaasToken` 의 추가 반환 필드(`imageEndpoint`)는 destructuring 에서 무시되므로 컴파일·동작 모두 깨지지 않는다. image endpoint 를 client 에 넘기는 작업은 phase-02 에서 한다.

## 성공 기준 (검증 명령 + 기대값)

```bash
# cwd: <repo root 또는 worktree>

# 1. 타입 체크 — 캐시 interface·getIaasToken 반환 변경 → 필수
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l
# 기대: 0

# 2. 빌드 성공
pnpm build
# 기대: dist/index.js 생성, exit 0

# 3. 기존 instance 명령 회귀 없음 (endpoint 확장이 기존 흐름을 안 깨는지)
node dist/index.js instance --help 2>&1 | grep -Ec "list|get|create|delete"
# 기대: 4 (images 는 phase-02 에서 등록 — 여기선 0)

# 4. IMAGE_HOST 와 INSTANCE_HOST 의 region key 집합 일치 (4-2 동기화)
node -e "const s=require('fs').readFileSync('src/api/endpoints.ts','utf8'); const re=/(INSTANCE_HOST|IMAGE_HOST)[^{]*\{([^}]*)\}/g; const keys={}; let m; while((m=re.exec(s))){keys[m[1]]=(m[2].match(/\b(kr1|kr2|kr3|jp1)\b/g)||[]).sort().join(',');} console.log(keys.INSTANCE_HOST===keys.IMAGE_HOST ? 'MATCH' : 'MISMATCH:'+JSON.stringify(keys));"
# 기대: MATCH

# 5. imageHost 미등록 region 에러가 EXIT_PARAM_ERROR 상수 사용 (9-1)
grep -nE "imageHost" src/api/endpoints.ts >/dev/null && grep -nE "NhnCloudCliError\([^,]+,\s*[0-9]+" src/api/endpoints.ts | wc -l
# 기대: 0 (숫자 리터럴 exit code 없음)

# 6. getIaasToken 반환에 imageEndpoint 포함
grep -c "imageEndpoint" src/api/keystone.ts
# 기대: 3 이상 (반환 타입 + 캐시 hit + write/return)

# 7. 캐시 가드가 imageEndpoint 검사
grep -c 'imageEndpoint' src/cache/token-store.ts
# 기대: 5 이상 (interface·guard·read 타입·read 반환·write)

# 8. 실측 게이트 (필수 — estimate 로 완료 금지) — 추정값 주석이 남아 있으면 실측 미수행
grep -c "실측 확정 전까지 추정값\|⚠️ 실측" src/api/endpoints.ts src/api/keystone.ts 2>/dev/null | awk -F: '{s+=$2} END{print s}'
# 기대: 0 (실측으로 host/경로 확정 후 추정 경고 주석 제거 — estimate 잔존 금지)
```

**실측 강제 절차 (MAJOR — estimate 완료 금지)**:
phase-01 은 image host 패턴·`/v2/images` tenant 유무를 **실제 호출로 확정**한 뒤에만 완료로 본다.

1. `playground_dev` profile 의 iaas 자격증명으로 실측한다 (이 profile 에 tenantId·username·password·region 존재 — 확인됨). GET /v2/images 는 읽기 전용이라 부작용 없음.
   - Keystone 토큰 발급 → 추정 host `https://<region>-api-image-infrastructure.nhncloudservice.com/v2/images?limit=1` 을 `X-Auth-Token` 으로 호출해 HTTP status 확인.
   - 200 이 아니면 (b) Keystone catalog 응답의 `type=="image"` publicURL 을 1회 덤프해 실제 host·경로 확정.
2. 확정된 host 패턴·tenant 유무를 `endpoints.ts` IMAGE_HOST + `keystone.ts` imageEndpoint 에 반영하고 **`⚠️ 실측 확정 전까지 추정값` 경고 주석을 제거**한다 (성공 기준 #8 이 이를 검증).
3. 실측 결과(확정 host·경로·HTTP status)를 team-lead 보고 + PR 본문에 기록한다.
4. **자격증명 접근 불가 등으로 실측 자체가 불가능하면 estimate 로 완료하지 말고 `PHASE_BLOCKED: image endpoint 실측 불가 — 자격증명/네트워크 확인 필요` 로 보고**한다 (추측 머지 금지, CLAUDE.md API 스펙 절차).

## 수동 확인 (실측 — 자격증명 필요, 사용자/구현자 직접 수행)

```bash
# image host 패턴 + /v2/images tenant 유무 실측 (구현 전 1회).
# 개인 식별 정보는 placeholder — 실제 토큰/region 으로 치환해 실행.
#   <region>: kr1 등,  <token>: Keystone 발급 X-Auth-Token

# (a) 추정 host + tenant 없는 경로 — 200 이면 추정 확정
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "X-Auth-Token: <token>" \
  "https://<region>-api-image-infrastructure.nhncloudservice.com/v2/images?limit=1"
# 기대: 200 (아니면 host/경로 추정 오류 → 아래 (b) 로 catalog 확인)

# (b) Keystone catalog 에서 type==image 의 publicURL 실제 host 확인 (일회성 덤프)
#     토큰 발급 응답 JSON 에서: access.serviceCatalog[] | type=="image" | endpoints[0].publicURL
# 확정 host/경로를 endpoints.ts IMAGE_HOST + keystone.ts imageEndpoint 에 반영
```

실측으로 host 패턴·tenant 유무를 확정한 뒤에야 코드의 추정값을 확정값으로 교체한다.
