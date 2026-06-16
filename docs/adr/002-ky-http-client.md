# ADR-002: ky (HTTP 클라이언트)

- **결정**: 모든 HTTP 호출은 `ky` 인스턴스 통과.
- **맥락**: retry·timeout·에러 분기 정책을 한 곳에서 통일. dooray-cli 검증됨.
- **대안 기각**: axios(번들 큼), node-fetch/got(정책 일관성 약함).

