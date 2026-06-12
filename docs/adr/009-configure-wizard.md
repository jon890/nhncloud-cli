# ADR-009: configure 대화형 마법사 + 비대화형 flag + 연결 테스트

- **결정**: `nhncloud configure` 로 자격증명을 설정한다.
  - 대화형 (`@inquirer/prompts`) — profile → UAK(id/secret) → 서비스별 appkey/secret 순 입력
  - 비대화형 flag (`--uak-id` 등) — CI·자동화용. flag 가 하나라도 있으면 비대화형
  - 저장 전 연결 테스트 — UAK 는 OAuth 토큰 발급, logncrash 는 최소 검색으로 검증 (`--no-verify` 로 생략)
  - 기존 값과 머지 저장 (all-or-nothing), `credentials.json` 은 mode 0600
- **맥락**: 지금은 사용자가 JSON 을 손으로 편집해야 한다. dooray setup (ADR-016/018) 의 검증된 마법사 패턴을 재사용한다.
- **대안 기각**: 대화형만(자동화 불가), flag 만(첫 설정 UX 나쁨), 검증 없음(잘못된 키를 실제 명령에서야 발견).
- **트레이드오프**: `@inquirer/prompts` 의존성 추가. 대화형 첫 설정 UX 이득이 더 크다.

