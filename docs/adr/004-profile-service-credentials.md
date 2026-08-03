# ADR-004: profile 공통 UAK + 서비스별 자격증명 블록

- **결정**: profile 아래에 공통 `userAccessKey`(개인 UAK) 1개 + 서비스별 블록(`logncrash` 등)을 둔다.
  - `userAccessKey` — deploy·ncs·logncrash 검색 등 OAuth 서비스가 공유 (개인/계정 단위, [[adr-007]], [[adr-024]])
  - 서비스 블록 — 서비스 고유 appkey 등 프로젝트 단위 값
- **맥락**: NHN Cloud 는 서비스마다 인증이 다르다.
  - Log & Crash Search v3 — appkey + 공통 UAK OAuth 토큰 (`X-NHN-Authorization: Bearer`, [[adr-024]])
  - Deploy — UAK 로 OAuth 토큰 교환 후 `X-NHN-AUTHORIZATION: Bearer`
  - UAK 는 한 번 설정하면 여러 OAuth 서비스가 공유하므로 서비스 밑이 아니라 profile 공통으로 올린다.
- **대안 기각**: UAK 를 서비스 블록(`deploy.uakId`) 에 중첩(OAuth 서비스 늘면 UAK 중복), 전역 단일 키(서비스별 appkey 현실과 불일치).
