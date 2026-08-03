# ADR-007: 공통 UAK OAuth client_credentials 토큰 교환 + 단기 캐시

- **결정**: UAK(id+secret) 를 Basic 인증으로 OAuth 에 보내 `access_token` 을 받아 캐시한다.
  - OAuth: `POST oauth.api.nhncloudservice.com/oauth2/token/create`, `grant_type=client_credentials`
  - `~/.nhncloud/cache/` 에 만료시각과 함께 저장, 만료 전 재사용
- **맥락**: Deploy·NCS·Log & Crash Search v3 인증은 정적 토큰이 아니라 공통 UAK로 발급한 단기 Bearer 토큰이다.
  [[adr-020]], [[adr-024]]가 서비스별 적용을 설명한다.
  - 공식 UAK 가이드는 Basic 인증과 `grant_type=client_credentials` 요청, `expires_in` 응답을 명시한다.
  - 호출마다 발급하면 OAuth 왕복이 매번 붙는다
- **대안 기각**: 정적 토큰 저장(만료로 곧 무효), 호출마다 발급(불필요한 OAuth 왕복).
- **적용 범위**: profile 공통 user-access-token 캐시를 Deploy·NCS·Log & Crash Search v3가 공유한다.
  Deploy는 `api-deploy.nhncloudservice.com`을 사용한다.
  OAuth는 `oauth.api.nhncloudservice.com`을 사용한다.
