---
id: four-face-guard-missing
category: plan
title: 새 불변식 도입 시 4면 가드 누락
triggers: [4면 가드, 불변식, 캐시 스키마]
tool_catchable: false
source: []
related: []
---

**증상**: 캐시 스키마에 새 필드를 추가했지만 일부 read 경로에만 가드를 두고 writer를 빠뜨린다.
**왜**: 같은 불변식이 다른 표면에서 깨짐 (cache writer 드랍 / resolver 통과 / formatter 미반영 / config schema 미반영 등).

**4면 검사 체크리스트** (load-bearing 불변식인 경우 필수):
1. **Schema / Type**: 해당 서비스 `types.ts`, `src/config/types.ts`나 캐시 구현의 type guard에 정의
2. **Config / credential reader & writer**: `src/config/`의 읽기와 쓰기에서 새 필드를 처리하고 원자적으로 저장
3. **Resolver / Mapper**: 입력 매퍼가 새 필드를 드랍하지 않는지 (`grep` 확인)
4. **Command / Formatter**: 사용자 가시 출력에서 일관 처리

**Self-check**: load-bearing 불변식 도입 시 4면 가드 모두 phase 작업 목록에 명시?
