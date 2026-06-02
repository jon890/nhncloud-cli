# Phase 2: Keystone token + region endpoint 캐시 (api/keystone.ts)

## 컨텍스트

`nhncloud instance` 구현 중. Phase 1 에서 `iaas` 자격증명 타입과 configure 확장 완료.
이 phase 는 Keystone v2 토큰 발급 + region 별 compute endpoint 결정 + 캐시를 만든다. instance client 와 configure verify 가 모두 사용한다.

먼저 아래 문서를 읽어라:

- `docs/adr.md` — ADR-010 (Keystone 인증·캐시), ADR-005 (region 분기 endpoint)
- `docs/data-schema.md` — 토큰 캐시 파일 (`iaas-token-<profile>-<region>.json`) 구조
- `docs/flow.md` — instance 인증 흐름

기존 코드 참조:

- `src/api/oauth.ts` — deploy OAuth 발급+캐시 패턴 (구조 mirror)
- `src/cache/token-store.ts` — token 파일 0600 read/write helper (확장하거나 generic 화)
- `src/api/endpoints.ts` (instance 용 region 분기 host 추가), `src/api/httpError.ts`

## API 스펙 (ADR-010 단일 소스)

- Keystone 발급: `POST https://api-identity-infrastructure.nhncloudservice.com/v2.0/tokens`
  - body: `{ auth: { tenantId, passwordCredentials: { username, password } } }`
  - 응답: `{ access: { token: { id, expires, tenant }, serviceCatalog: [...] } }`
- region → compute host: `kr1-api-instance-infrastructure.nhncloudservice.com` 등 (kr1/kr2/kr3/jp1)
- compute base URL: `https://<host>/v2/<tenantId>`

## 목표

iaas 자격증명 → token + compute base URL 반환 + 단기 캐시.

## 작업 목록

- [ ] `src/cache/token-store.ts` 확장
  - 기존 deploy-token write/read 는 유지
  - iaas 용 `readIaasToken(profile, region): Promise<{tokenId, expiresAt, computeBase} | null>`
  - `writeIaasToken(profile, region, data): Promise<void>` (mode 0o600, 디렉터리 mode 0o700)
- [ ] `src/api/endpoints.ts` 확장
  - `keystoneIdentityUrl()` — `https://api-identity-infrastructure.nhncloudservice.com/v2.0/tokens` 상수
  - `instanceHost(region: string): string` — region 맵 (`kr1`/`kr2`/`kr3`/`jp1`). 미등록 region 은 `NhnCloudCliError(EXIT_PARAM_ERROR, 사용 가능 region 안내)`
- [ ] `src/api/keystone.ts`
  - `getIaasToken(profile, iaas: IaasCredential, forceRefresh?: boolean): Promise<{tokenId, computeBase}>`
    - 캐시(profile + region) 만료 전이면 재사용
    - 아니면 POST identity 발급 → 응답에서 `access.token.id` + `access.token.expires` + region 의 compute base 조립 (`https://<instanceHost(region)>/v2/<tenantId>`) → 캐시 후 반환
  - 실패 시 `toNhnCloudCliError` (401/403 → AUTH)
  - `forceRefresh=true` 는 캐시 우회 (configure verify 용 — code-review-pitfalls 의 cache-bypass 패턴)

## 성공 기준

```bash
# cwd: <레포 루트>
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l   # 기대: 0
ls src/api/keystone.ts
grep -c "api-identity-infrastructure.nhncloudservice.com" src/api/keystone.ts   # 기대: 1
grep -c "instanceHost" src/api/endpoints.ts                                       # 기대: >=1
grep -cE "kr1|kr2|kr3|jp1" src/api/endpoints.ts                                    # 기대: >=4
grep -c "forceRefresh" src/api/keystone.ts                                        # 기대: >=1
grep -c "mode: 0o600" src/cache/token-store.ts                                    # 기대: >=2 (deploy + iaas)
# 이중 단언 금지
grep -nE "as unknown as " src/api/keystone.ts src/cache/token-store.ts            # 기대: 0건
```

## 주의사항

- HTTP 는 `ky` 전용. 응답 parse 후 `as Type` 즉시 단언 금지 — 최소 typeof 가드 (CLI5).
- token expires 판정에 약간의 여유(예: 60초 buffer) 둬 경계 만료 회피.
- 캐시 파일명: `iaas-token-<profile>-<region>.json` — region 별 분리 (다른 region 호출이 서로 무효화하지 않게).
- HTTPS POST body 의 `password` 는 로그·에러 메시지에 절대 노출 금지.

## Blocked 조건

- Phase 1 의 `IaasCredential` 타입 부재 시: `PHASE_BLOCKED: phase 1 먼저 필요`
