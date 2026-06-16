# ADR-007: Deploy OAuth client_credentials 토큰 교환 + 단기 캐시

- **결정**: UAK(id+secret) 를 Basic 인증으로 OAuth 에 보내 `access_token` 을 받아 캐시한다.
  - OAuth: `POST oauth.api.nhncloudservice.com/oauth2/token/create`, `grant_type=client_credentials`
  - `~/.nhncloud/cache/` 에 만료시각과 함께 저장, 만료 전 재사용
- **맥락**: Deploy 인증은 정적 토큰이 아니라 단기 Bearer 토큰이다.
  - 실사용 스크립트 `nhn-deploy-trigger.sh` 로 확인 (공식 docs 는 "별도 발급" 으로만 표기)
  - 호출마다 발급하면 OAuth 왕복이 매번 붙는다
- **대안 기각**: 정적 토큰 저장(만료로 곧 무효), 호출마다 발급(불필요한 OAuth 왕복).
- **적용 범위**: 엔드포인트 함정 — Deploy 는 `api-deploy.nhncloudservice.com` (공식 docs 의 `api-tcd` 와 다른 현행 도메인). OAuth 는 `oauth.api.nhncloudservice.com`.

