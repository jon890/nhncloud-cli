---
id: resolver-boundary-empty-id
category: code-review
title: resolver/parser boundary 검증 (빈/공백 식별자가 API URL path 로 흘러감)
triggers: [resolver, 빈 ID, boundary]
tool_catchable: false
source: [PR47]
related: []
---

**증상**: `instanceId` / `volumeId` / `binaryKey` 같은 식별자를 trim·non-empty 검증 없이 `parseXxxPositional` 이 통과시킴.
  사용자가 빈 문자열 / 공백만 / 인용 부호 안 빈 값을 넘기면 그대로 `GET /servers//os-volume_attachments/` 또는 `GET /binaryGroups/<group>/binaries//download` 같은 깨진 URL 로 합성.
  서버 4xx 또는 더 나쁘게 path traversal 가까운 동작 발생.
  profile·region·target 해석 경계의 검증 패턴과 비대칭.
**Good**: `parseXxxPositional` 진입부에서 모든 path 식별자에 `assertNonEmpty(value, "<label>")` (trim 후 빈 거부) 가드.
  discriminated union + 오버로드와 함께 "필수 secondary" 도 같은 가드 적용.
**검출**: 신규 parser/input helper 추가 시 `grep -nE "throw new NhnCloudCliError.*가 필요|EXIT_PARAM_ERROR" src/commands src/services` 결과의 가드 다음에 trim 검증이 있는지 확인. 없으면 boundary 미보호.
**Why**: path parameter helper 가 향후 추가될 때마다 같은 boundary 가드 누락 위험 — 검증 책임을 caller 단편이 아니라 입력 해석 단일 지점에서 진다.
