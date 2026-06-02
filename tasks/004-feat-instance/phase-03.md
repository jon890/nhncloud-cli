# Phase 3: InstanceClient (list/get/create/delete + waitForActive)

## 컨텍스트

`nhncloud instance` 구현 중. Phase 1(iaas 타입+configure) + 2(keystone token·캐시) 완료.
이 phase 는 OpenStack Nova v2 호환 Compute API 를 호출하는 InstanceClient 와 ACTIVE 폴링 helper 를 만든다.

먼저 아래 문서를 읽어라:

- `docs/flow.md` — instance 흐름 (인증, 명령 시그니처, create 비동기 + --wait 폴링)
- `docs/adr.md` — ADR-010

API 스펙 (NHN Instance, base `https://<region>-api-instance-infrastructure.nhncloudservice.com/v2/<tenantId>`):

- 공통 헤더: `X-Auth-Token: <tokenId>`
- `GET /servers/detail` — 목록 (basic + 상세 필드 포함)
- `GET /servers/{id}` — 단건
- `POST /servers` — 생성. body `{ server: { name, flavorRef, imageRef, networks: [{uuid}], key_name?, security_groups?: [{name}], "NHN-EXT-ATTR:ephemeral_disk_size"?, "NHN-EXT-ATTR:protect"? } }`. 응답 `{ server: { id, ... } }` 즉시 (BUILD 상태)
- `DELETE /servers/{id}` — 삭제 (204 No Content)
- 응답은 OpenStack 표준 — NHN 봉투 없음. `unwrap` 사용하지 않는다.

기존 코드 참조:

- `src/api/keystone.ts` (`getIaasToken`), `src/api/httpError.ts` (`toNhnCloudCliError`)
- `src/services/deploy/client.ts` (서비스 client 패턴 참조)

## 목표

InstanceClient 4 메소드 + ACTIVE 폴링.

## 작업 목록

- [ ] `src/services/instance/types.ts`
  - `interface Server { id: string; name: string; status: string; addresses: Record<string, Array<{addr: string; version: number}>>; flavor: {id: string}; image: {id: string}; ... }`
  - `interface CreateServerParams { name; flavorRef; imageRef; networks: string[]; keyName?; securityGroups?: string[]; ephemeralDiskSize?: number; protect?: boolean }`
- [ ] `src/services/instance/client.ts`
  - `class InstanceClient { constructor(tokenId: string, computeBase: string) }`
  - `list(): Promise<Server[]>` — GET /servers/detail
  - `get(id): Promise<Server>` — GET /servers/{id}
  - `create(params): Promise<Server>` — POST /servers. body 의 NHN 확장 필드는 `params.ephemeralDiskSize` / `params.protect` 가 정의됐을 때만 포함
  - `delete(id): Promise<void>` — DELETE /servers/{id}
  - `waitForActive(id, opts: {intervalMs?: number; timeoutMs: number}): Promise<Server>` — `get` 폴링, status==="ACTIVE" + `addresses` 에 IP 1개 이상이면 반환. timeout 시 마지막 status 포함한 `NhnCloudCliError(EXIT_API_ERROR)`
  - 모든 호출 catch 는 `toNhnCloudCliError`

## 성공 기준

```bash
# cwd: <레포 루트>
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l   # 기대: 0
ls src/services/instance/types.ts src/services/instance/client.ts
grep -c "X-Auth-Token" src/services/instance/client.ts   # 기대: >=1
grep -cE "/servers/detail|POST.*servers|DELETE.*servers" src/services/instance/client.ts   # 기대: >=3
grep -c "waitForActive" src/services/instance/client.ts                                      # 기대: >=1
grep -cE "NHN-EXT-ATTR:ephemeral_disk_size|NHN-EXT-ATTR:protect" src/services/instance/client.ts   # 기대: >=2
# 봉투(unwrap) 사용 금지 — OpenStack 표준 응답
grep -c "unwrap" src/services/instance/client.ts   # 기대: 0
# 이중 단언 금지
grep -nE "as unknown as " src/services/instance/   # 기대: 0건
```

## 주의사항

- 응답은 OpenStack 표준 (`{ servers: [...] }` / `{ server: {...} }`). `envelope.unwrap` 사용 금지.
- create body 의 NHN 확장 필드 (`NHN-EXT-ATTR:ephemeral_disk_size`/`protect`) 는 미정의 시 payload 에서 제외 (포함 시 NHN 측 검증 실패 가능).
- `waitForActive` 의 interval 기본 5000ms, timeout 은 호출자 인자.
- 인증 실패(401/403) 시 token 만료 가능성 — 본 phase 는 단순 throw, token refresh 는 호출자(command)가 결정.

## Blocked 조건

- Phase 1·2 산출물 부재 시: `PHASE_BLOCKED: 이전 phase 미완`
