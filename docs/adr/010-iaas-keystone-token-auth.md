# ADR-010: IaaS Keystone 토큰 인증과 region 별 compute endpoint 캐시

- **결정**: NHN Cloud Instance(OpenStack Nova v2 호환) 인증은 Keystone v2 token 발급으로 처리하고, profile·region 단위로 캐시한다.
  - 발급: `POST api-identity-infrastructure.nhncloudservice.com/v2.0/tokens`
    - body: `{ auth: { tenantId, passwordCredentials: { username, password } } }`
  - 호출: `X-Auth-Token: <tokenId>` 헤더
  - 캐시: `~/.nhncloud/cache/iaas-token-<profile>-<region>.json` 에 `{ tokenId, expiresAt, computeEndpoint }`
  - `iaas` 자격증명 블록은 instance 외에도 IaaS 서비스가 공유한다 ([[adr-004]])
- **맥락**: instance API 는 logncrash·deploy 와 또 다른 세 번째 인증 모델이다 (Keystone).
  - 호출마다 token 을 새로 받으면 매번 발급 왕복이 붙는다.
  - region 별 compute endpoint 는 정적 host 맵(ADR-005)으로 구성해 token 과 함께 캐시한다.
- **대안 기각**:
  - 호출마다 발급 — 불필요한 왕복.
  - 자격증명 파일에 token 직접 저장 — 만료 관리를 사용자에게 떠넘김.
  - Keystone v3 — NHN 은 v2 로 발급한다. v3 도 가능하지만 표준화 이득 없음.
- **트레이드오프**:
  - password 는 NHN 콘솔 IAM 의 API 비밀번호 — 사용자가 로그인 비번과 혼동할 수 있어 configure 마법사·docs 에서 명시한다.
  - username 은 NHN Cloud 계정 이메일 **또는 IAM 계정 ID(사번)** 이다. tenantId 와 비슷한 32자리 hex "API 사용자 ID"(UUID)가 아니다 — 이를 username 으로 넣으면 Keystone 이 `Could not find user` 401 을 반환한다. (실측: 사번으로 발급 성공)

