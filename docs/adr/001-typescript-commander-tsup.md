# ADR-001: TypeScript + Commander.js + tsup

- **결정**: dooray-cli 와 동일 스택 (TypeScript + Commander.js + tsup 단일 번들 + vitest).
- **맥락**: 검증된 CLI 기반을 재사용해 PoC 속도를 높인다. 사용자가 Node 생태계 선호.
- **대안 기각**: Go(공식 gophercloud 재사용 가능하나 PaaS REST 와 거리), Python(openstackclient 참고용이나 PaaS 와 무관).

