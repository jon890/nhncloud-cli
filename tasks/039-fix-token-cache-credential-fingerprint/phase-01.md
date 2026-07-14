# Phase 01 — 토큰 캐시 자격 지문 저장·비교 + OAuth 캐시 파일명 정정

## 목표

토큰 캐시가 발급 자격(User Access Key / iaas)이 바뀌면 stale 토큰을 재사용하지 않도록,
캐시에 자격 SHA-256 지문을 저장하고 읽을 때 현재 자격 지문과 비교해 다르면 무효화한다 (ADR-021).
OAuth 캐시 파일명을 `deploy-token-<profile>.json` → `user-access-token-<profile>.json` 으로 정정한다.

- 검증: `pnpm tsc --noEmit`, `pnpm run build`, `pnpm test`.
- 회귀 재현 테스트: 지문 불일치 시 `readToken`/`readIaasToken` 이 `null` 반환.

## 선행 (실측 확정 — 재검증 불요)

- 원인: `token-store.ts` OAuth 캐시(`tokenCachePath`, 97–99행)가 `profile` 만으로, iaas 캐시가 `profile`+`region` 만으로 keying. `configure` 저장(`configure.ts` `saveAndVerify` 138–152행)은 캐시 무효화를 하지 않음.
- 공개 시그니처 불변 — cascade 없음:
  - `getAccessToken(profile, uakId, uakSecret, forceRefresh)` (oauth.ts:28) — 호출부 `deploy/helpers.ts:14`, `ncs/helpers.ts:60`, `configure-verify.ts:23·105`. 자격 인자를 이미 받으므로 호출부 변경 불요.
  - `getIaasToken(profile, iaas, forceRefresh)` (keystone.ts:47) — 호출부 `iaas.ts:20`, `configure-verify.ts:45`. `iaas` 를 이미 받으므로 변경 불요.
  - 시그니처가 바뀌는 함수는 `token-store.ts` 내부의 `readToken`/`writeToken`/`readIaasToken`/`writeIaasToken` 뿐이고, 이들은 `oauth.ts`·`keystone.ts` 안에서만 호출된다 (grep 확인: `rg -n 'readToken|writeToken|readIaasToken|writeIaasToken' src/`).
- verify 경로는 `forceRefresh=true` 로 캐시 읽기·쓰기를 모두 건너뛰므로(configure-verify.ts) 지문 변경의 영향을 받지 않는다 (cache-bypass-in-verify-helper 유지).

## 구현 항목

### 1. token-store.ts — 지문 helper

`node:crypto` import 에 `createHash` 추가 (기존 `randomBytes` 와 함께).

```ts
/** 발급 자격의 SHA-256 지문. 캐시 무효화 비교용 — 자격 평문을 저장하지 않는다 (ADR-021). */
export function credentialFingerprint(material: string): string {
  return createHash("sha256").update(material).digest("hex");
}
```

### 2. token-store.ts — OAuth 캐시 (파일명 정정 + credentialHash)

- `tokenCachePath`: `deploy-token-${profile}.json` → `user-access-token-${profile}.json`.
- `TokenCache` interface 에 `credentialHash: string` 추가 (필수 — data-schema.md 단일 소스와 1:1, 옵션 분기 금지).
- `isTokenCache`: `typeof obj["credentialHash"] === "string"` 조건 추가.
- `readToken(profile, credentialHash)` — 인자에 `credentialHash: string` 추가. 만료 검사 통과 후 `parsed.credentialHash !== credentialHash` 이면 `null` 반환(자격 변경). 반환 타입은 기존 `{ accessToken, expiresAt }` 유지.
- `writeToken(profile, accessToken, expiresAt, credentialHash)` — 인자에 `credentialHash: string` 추가, 저장 객체에 포함.

### 3. token-store.ts — iaas 캐시 (credentialHash)

- `IaasTokenCache` interface 에 `credentialHash: string` 추가.
- `isIaasTokenCache`: `credentialHash` 문자열 조건 추가.
- `readIaasToken(profile, region, credentialHash)` — 인자 추가. 만료 통과 후 지문 불일치 시 `null`. 반환 타입(endpoint 묶음)은 유지.
- `writeIaasToken(profile, region, data)` — `data` 타입에 `credentialHash: string` 추가, 저장 객체에 포함.

> 하위호환: 구 캐시(지문 필드 없음 / 옛 파일명)는 type 가드 실패 또는 파일 부재로 `null` → 자연 재발급. 24행 기존 주석과 동일 패턴 — 구 `deploy-token-*.json` 파일은 별도 삭제하지 않는다(무시되어 방치, 무해).

### 4. oauth.ts — 지문 주입

`getAccessToken` 안에서:

```ts
const credentialHash = credentialFingerprint(`${uakId}:${uakSecret}`);
```

- 캐시 읽기: `readToken(profile, credentialHash)`.
- 캐시 쓰기(비 forceRefresh): `writeToken(profile, raw.access_token, expiresAt, credentialHash)`.

### 5. keystone.ts — 지문 주입

`getIaasToken` 안에서:

```ts
const credentialHash = credentialFingerprint(`${iaas.tenantId}:${iaas.username}:${iaas.password}`);
```

- 캐시 읽기: `readIaasToken(profile, iaas.region, credentialHash)`.
- 캐시 쓰기(비 forceRefresh): `writeIaasToken(profile, iaas.region, { tokenId, expiresAt, credentialHash, computeEndpoint, ... })`.

### 6. tests — `src/cache/token-store.test.ts` (신규)

`CACHE_DIR` 이 모듈 로드 시 `homedir()` 로 고정되므로 `node:os` 의 `homedir` 를 per-run temp dir 로 mock 한다 (`skill-install.test.ts` 의 mkdtemp 패턴 참조 + `vi.hoisted`).

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const home = vi.hoisted(() => ({ dir: "" }));
vi.mock("node:os", async (orig) => {
  const actual = await orig<typeof import("node:os")>();
  return { ...actual, homedir: () => home.dir };
});

beforeAll(async () => { home.dir = await mkdtemp(path.join(tmpdir(), "ncc-token-")); });
afterAll(async () => { await rm(home.dir, { recursive: true, force: true }); });
```

테스트 케이스(OAuth + iaas 각각 최소):

- write 후 **같은 지문**으로 read → 저장 토큰 반환.
- write 후 **다른 지문**으로 read → `null` (자격 변경 시 무효화 — 이슈 #53 회귀 가드).
- 만료 시각 과거로 write → read `null` (기존 만료 로직 유지).
- 파일명이 `user-access-token-<profile>.json` 인지 확인(옛 `deploy-token` 미생성).

expiresAt 은 미래(+1h) ISO 문자열로 만들어 만료 버퍼(60s)를 넘긴다.

### 7. task 상태

- `tasks/039-fix-token-cache-credential-fingerprint/index.json` Phase 1 `completed`, `status` `completed`.

## 회피 항목 (code-review self-check)

- **on-disk-schema-multiple-options**: `credentialHash` 를 두 interface 에 **필수 단일 구조**로 단정 (data-schema.md 와 1:1). "있어도 되고 없어도" 옵션 분기 금지.
- **cache-bypass-in-verify-helper**: verify 경로(`forceRefresh=true`)는 지문 비교 이전에 캐시를 건너뛴다 — 변경으로 이 우회가 깨지지 않는지 `grep -n "forceRefresh" src/api/oauth.ts src/api/keystone.ts` 로 확인.
- **type-optional-cascade-grep-missing**: `readToken`/`readIaasToken` 반환 타입은 바꾸지 않는다(내부 비교만) → 호출부 cascade 없음. 변경 전 `rg -n 'readToken|writeToken|readIaasToken|writeIaasToken' src/` 로 호출부가 token-store 내부 소비자(oauth/keystone)뿐인지 재확인.
- **function-signature-unverified**: 위 선행에 grep 확인한 호출부 시그니처대로만 수정. `getAccessToken`/`getIaasToken` 공개 시그니처는 건드리지 않는다.
- 리터럴 exit code 금지 — 이 phase 는 신규 throw 없음(무효화는 null 반환). 확인: 새 `NhnCloudCliError` 추가 없음.

## 완료 조건

1. `pnpm tsc --noEmit` 0.
2. `pnpm run build` 정상.
3. `pnpm test` 정상 (token-store.test.ts 지문 일치/불일치/만료 케이스 포함).
4. `rg -n "deploy-token" src/` → 0건 (파일명 정정 완료). `rg -n "user-access-token" src/cache/token-store.ts` → 1건 이상.
5. `rg -n "credentialHash" src/cache/token-store.ts src/api/oauth.ts src/api/keystone.ts` → 각 파일에 존재.
6. index.json Phase 1 completed.

## 변경 파일 (정확)

- `src/cache/token-store.ts`
- `src/api/oauth.ts`
- `src/api/keystone.ts`
- `src/cache/token-store.test.ts` (신규)
- `tasks/039-fix-token-cache-credential-fingerprint/index.json`

## 커밋

```bash
git commit -m "fix(cache): invalidate token cache on credential change via fingerprint (#53)"
```

## 실측 검증 (자격증명 있을 때 — 선택)

1. 임의 profile 로 `nhncloud ncs template list` 1회(캐시 생성).
2. `nhncloud configure --profile <p> --uak-id <새 id> --uak-secret <새 secret>` 로 교체.
3. 같은 `nhncloud ncs template list` 재실행 → 10005 없이 재발급되어 동작.
