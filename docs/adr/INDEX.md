# ADR Index — nhncloud-cli 기술 결정 기록

ADR-NNN 내용은 `docs/adr/NNN-*.md` 로 찾는다(번호 glob — slug 몰라도 매칭).
아래 목록 링크 또는 번호로 직접 파일을 읽는다.
전체 통독 대신 필요한 ADR 만 읽는다(ADR-018).

예시: `ADR-007` 내용이 필요하면 `docs/adr/007-*.md` glob 으로 파일을 열면 된다.

## ADR 목록

- [ADR-001](001-typescript-commander-tsup.md): TypeScript + Commander.js + tsup
- [ADR-002](002-ky-http-client.md): ky (HTTP 클라이언트)
- [ADR-003](003-profile-credentials-json.md): profile 기반 자격증명 — JSON + credentials/config 분리
- [ADR-004](004-profile-service-credentials.md): profile 안 서비스별 자격증명 블록
- [ADR-005](005-endpoint-hardcoded-map.md): 엔드포인트 하드코딩 맵 (gov 제외)
- [ADR-006](006-nhn-response-envelope.md): NHN 공통 응답 봉투 정규화
- [ADR-007](007-deploy-oauth-token-cache.md): Deploy OAuth client_credentials 토큰 교환 + 단기 캐시
- [ADR-008](008-deploy-named-target-config.md): deploy 좌표 named target (config) + UAK/좌표 분리
- [ADR-009](009-configure-wizard.md): configure 대화형 마법사 + 비대화형 flag + 연결 테스트
- [ADR-010](010-iaas-keystone-token-auth.md): IaaS Keystone 토큰 인증 + region 별 compute endpoint 캐시
- [ADR-011](011-instance-create-boot-volume.md): Instance 발급 — boot-from-volume 필수 + POST 축약 응답
- [ADR-012](012-instance-userdata-base64.md): instance create user_data — base64 주입 + 65535 인코딩 후 한도
- [ADR-013](013-iaas-multi-service-endpoint.md): IaaS 멀티 서비스 endpoint 해석 — image·network·blockstorage catalog host 맵 추가 (정적 맵 유지)
- [ADR-014](014-logncrash-collector-host.md): Log & Crash collector — 검색과 별도 host + appkey-only 인증(secret 불요)
- [ADR-015](015-deploy-binary-transfer.md): deploy 바이너리 전송 — ky multipart 업로드 + 봉투 우회 파일 스트림 다운로드
- [ADR-016](016-ncr-management-api.md): NCR Management API — 공통 UAK 정적 헤더 인증 + region 별 host (OAuth 교환 불요)
- [ADR-017](017-ncr-images-harbor-rest.md): NCR 이미지/태그 조회 — Harbor REST /api/v2.0 우회 + UAK Basic Auth (Docker v2 _catalog 기각)
- [ADR-018](018-harness-docs-directory.md): 하네스 누적 docs 디렉터리 구조 — 단일 파일 → 파일 per 항목 + INDEX (ADR·pitfalls)
