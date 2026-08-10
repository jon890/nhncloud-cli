---
id: cache-consistency
category: code-review
title: 캐시 일관성
triggers: [캐시, 일관성, 파일 분리]
tool_catchable: false
source: []
related: []
---

**증상**: `~/.nhncloud/cache/` 쓰기 후 읽기 시 부분 쓰기 / 스키마 불일치 노출.
**Good**: write 는 원자적으로 한다 (temp 파일에 쓴 뒤 `rename`). read 는 schema 검증(타입 가드)과 자격 지문 비교를 함께 한다 (ADR-021 — 자격이 바뀐 캐시는 만료 전에도 버린다).
**검출**: `grep -nE "writeFile\(" src/cache/token-store.ts` 각 호출에 `rename` 이 동반되는지 확인. temp 쓰기만 있고 `rename` 이 없으면 부분 쓰기 노출.
