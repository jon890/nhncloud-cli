# ADR-021: 자격 변경 시 토큰 캐시 무효화 — 자격 지문 비교

- **결정**: 토큰 캐시 파일에 발급에 쓰인 자격의 **SHA-256 지문**을 함께 저장하고, 읽을 때 현재 자격의 지문과 비교해 다르면 캐시를 무효화(null 반환 → 재발급)한다.
  - OAuth 캐시 (User Access Key 교환 토큰): 지문 = `sha256(uakId:uakSecret)`
  - iaas Keystone 캐시: 지문 = `sha256(tenantId:username:password)` (region 은 파일명에 이미 포함)
  - OAuth 캐시 파일명을 `deploy-token-<profile>.json` → `user-access-token-<profile>.json` 으로 정정한다.
- **맥락**: 캐시가 `profile`(+region) 만으로 keying 되어 `configure` 로 자격을 교체해도 이전 자격으로 발급된 토큰이 만료(약 24h) 전까지 재사용됐다.
  - 그 결과 NCS·deploy 등 OAuth 인증 명령이 옛 토큰으로 호출돼 `10005 No permissions` 실패 (GitHub 이슈 #53).
  - deploy·ncs·logncrash 검색은 같은 계정 단위 User Access Key OAuth 토큰을 공유하므로([[adr-007]], [[adr-020]], [[adr-024]]) 파일명 `deploy-token` 이 실제 소유 범위를 잘못 표시했다.
- **대안 기각**:
  - `configure` 가 저장 시 캐시 삭제: `credentials.json` 을 직접 편집하는 경로는 커버하지 못한다.
  - 인증 실패(권한 오류) 응답 시 `forceRefresh` 재시도: 각 service client 를 재시도 로직으로 감싸야 해 변경 범위가 넓어진다. OAuth 토큰 자체는 유효(옛 자격으로 정상 발급)해 실패가 API 단에서만 드러나므로 client 마다 감지가 필요하다.
- **트레이드오프**: secret 평문이 아니라 해시만 저장하므로 캐시 파일이 노출돼도 자격이 새지 않는다(기존엔 access token 평문 저장 — 보안 개선).
- **적용 범위**: OAuth 캐시(deploy·ncs·logncrash 검색 공용)와 iaas Keystone 캐시 양쪽. 지문 필드가 없거나 옛 파일명인 구 캐시는 type 가드 실패로 null 이 되어 자연 재발급된다(하위호환 — [[adr-007]], [[adr-010]] 의 기존 재발급 복구와 동일 패턴).
