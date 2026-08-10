# ADR-016: NCR Management API — 공통 UAK 정적 헤더 인증과 region 별 host (OAuth 교환 불요)

- **결정**: NCR(NHN Container Registry) Management API(레지스트리 조회)는 공통 UAK(`userAccessKey`)를 **정적 헤더로 직접 전송**한다. deploy 의 OAuth 토큰 교환([[adr-007]])을 쓰지 않으므로 토큰 캐시 계층이 없다.
  - 인증 헤더: `X-TC-AUTHENTICATION-ID: <uak-id>` 와 `X-TC-AUTHENTICATION-SECRET: <uak-secret>` ([[adr-004]] 의 공통 UAK 재사용 — 별도 ncr 비밀 없음).
  - host: region 별 `{region}-ncr.api.nhncloudservice.com` 정적 맵(`NCR_HOST`, [[adr-005]]·[[adr-013]] 의 region 맵 패턴 답습). IaaS region 과 별개 축이라 `--region` 옵션으로 받고 기본 `kr1`.
  - 경로: `GET /ncr/v2.0/appkeys/{appKey}/registries`(목록) / `.../registries/{registryNameOrId}`(조회). `appKey` 는 NCR 서비스 appkey — profile 의 `ncr` 블록(`{ appkey }`, [[adr-004]]) 또는 `--app-key` 옵션.
  - 응답: `header`(`isSuccessful`+숫자 `resultCode`, [[adr-006]])와 **나란히 named 필드**로 결과가 온다 — 목록은 `registries: [...]`, 단건은 `registry: {...}`. 표준 봉투의 `body` 가 **아니므로** `unwrap`(body 필수)이 아니라 `unwrapHeader`(헤더만 검사)를 쓰고 named 필드를 직접 읽는다. 레지스트리 필드는 Harbor 파생 snake_case(`name`·`project_id`·`repo_count`·`uri`·`private_uri`·`registry_id` 등).
- **맥락**: NCR 은 CNCF Harbor 를 NHN 이 래핑한 서비스다. public Management API 는 레지스트리(프로젝트)·정책(보호/정리/웹훅) 관리만 제공하고 **이미지/태그(artifact) 목록 조회 endpoint 가 없다**(콘솔 UI 전용). 이미지/태그는 별도 데이터플레인 API 우회가 필요해 범위를 분리한다([[adr-017]] 참조 — 실측 결과 Docker Registry v2 `_catalog` 는 admin 전용 401 이라 Harbor REST `/api/v2.0` 경로를 채택).
- **실측 확정 (2026-06-12, playground 자격증명 실호출)**: 당초 봇차단으로 pending 이던 항목을 실호출로 확정.
  - 인증 헤더 `X-TC-AUTHENTICATION-ID/SECRET` 표기 그대로 200 — 교정 불요.
  - host `kr1-ncr.api.nhncloudservice.com` 200 확인.
  - `appKey` = NCR 서비스 appkey(레지스트리 식별자 아님).
  - **응답 형태**: `{ header, registries: [...] }`(목록) / `{ header, registry: {...} }`(단건) — `body` 없는 named 필드. 당초 "봉투 `body` 안 배열" 가정이 틀려 첫 머지(PR #26)의 `unwrap→body` 가 "body 없음" 으로 실패 → hotfix 로 `unwrapHeader`+named 필드 직접 읽기로 정정.
- **대안 기각**:
  - deploy OAuth 토큰 교환 재사용 — NCR 은 UAK 를 정적 헤더로 직접 받으므로 토큰 교환이 불필요한 복잡도. `x-nhn-authorization: Bearer` 도 지원하나 정적 헤더가 더 단순.
  - IaaS Keystone 토큰([[adr-010]]) — NCR 은 OpenStack 이 아니라 Harbor 라 Keystone 무관.
  - ncr 블록에 secret 저장 — 인증 비밀은 공통 UAK secret 이라 ncr 블록은 appkey 만 둔다(중복 비밀 방지).
- **트레이드오프**: NCR region 축이 IaaS region 과 분리돼 region 맵이 하나 더 는다. host 가 실제로 다른 도메인이라 분리가 정직하다.

