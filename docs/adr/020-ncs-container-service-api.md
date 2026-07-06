# ADR-020: NCS API — Deploy OAuth 토큰 재사용 + appkey 경로 + region host

- **결정**: NCS(NHN Container Service)는 Deploy 와 같은 UAK OAuth Bearer 토큰을 재사용한다.
  endpoint 는 region 별 `{region}-ncs.api.nhncloudservice.com` 의 `/ncs/v1.0` 이고 appkey 를 경로에 포함한다.
  - `endpoints.ts` 에 `NCS_HOST` 맵과 `ncsHost(region)` 를 추가한다.
    공식 docs 가 제시한 region 은 판교(`kr1`)·광주(`kr3`)뿐이다 — `kr2`·`jp1` 은 없다.
  - 인증 헤더는 `x-nhn-authorization: Bearer <token>` 이다.
    Deploy 는 대문자 `X-NHN-AUTHORIZATION` 표기지만 HTTP 헤더는 대소문자 무시라 실질 동일하다.
  - appkey 는 profile 의 `ncs` 자격증명 블록(`ServiceCredential.appkey`) 또는 `--app-key` override 로 받아
    모든 경로 `/ncs/v1.0/appkeys/{appKey}/...` 에 넣는다(NCR·logncrash 와 동일).
  - NCS 응답은 NHN 공통 `{ header, body }` 봉투이고 `header.resultCode` 는 숫자다(Log & Crash 형).
    기존 envelope helper([[adr-006]], 숫자·문자 둘 다 수용)로 unwrap 한다.
    모든 API 가 HTTP 200 으로 응답하고 성공·실패는 `header` 로만 판별한다 — HTTP status 로 에러 분기하지 않는다.
- **맥락**: NCS 는 Container 카테고리지만 NKS(Keystone `X-Auth-Token`)·NCR(정적 UAK 헤더 / Harbor Basic Auth)와 또 다른 인증이다.
  Deploy 와 같은 공통 IAM OAuth(`oauth.api.nhncloudservice.com`)로 발급한 Bearer 토큰을 쓴다([[adr-007]]).
  UAK OAuth 토큰은 서비스가 아니라 계정 단위(`client_credentials`)라 Deploy 와 같은 profile 토큰 캐시를 그대로 공유한다.
- **대안 기각**:
  - **NKS·NCR 인증 재사용**: NCS 는 Keystone `X-Auth-Token` 도, NCR 정적 헤더도 아니다.
    UAK OAuth Bearer 토큰이므로 Deploy 계열(`api/oauth.ts`)로 붙인다.
  - **payload 전 필드 flag 화**: workload·template 생성 body 는 `loadBalancing`·`autoScaler`·`schedule`·`containers` 등 중첩이 깊다.
    전부 flag 로 펼치면 CLI 표면이 과도해진다.
    복잡한 쓰기는 `--file <json>` 을 기본 입력으로 삼는다([[adr-019]] NKS 선례와 동일 — 별도 결정 아님).
- **트레이드오프**:
  - region 은 공식 docs 가 제시한 `kr1`(판교)·`kr3`(광주)만 지원한다.
    다른 region 은 실측 200 응답 또는 docs 갱신 후 별도로 추가한다.
  - workload 는 비동기다(`status` Pending → Running).
    `workload create` 는 `--wait` 로 폴링하고 기본은 즉시 반환한다([[adr-011]] instance create 선례).
  - `malware.enabled` 의 String(`"true"`)/Boolean 여부, `internalLoadBalancing.enalbed` docs 오타 여부는
    구현 phase 에서 실제 호출로 확정한다(추측한 채로 머지하지 않는다).
