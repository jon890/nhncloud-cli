---
id: decision-surface-sweep-incomplete
category: plan
title: 결정이나 CLI 표면을 폐지한 뒤 살아 있는 문서 표현을 덜 훑음
triggers: [결정 변경, 옵션 폐지, 문서 sweep]
tool_catchable: false
source: [plan064, plan065]
related: [revise-string-change-cascade-missing, path-migration-agents-missing]
---

**증상**: 옵션, 위치 인수나 설정을 폐지하면서 결정 ADR만 고치고 같은 동작을 설명하는 PRD, 흐름, 구조 문서와 공개 가이드에는 이전 표현이 남는다. 내부 식별자만 검색하면 `<target>`이나 `[target]` 같은 사용자 표면 표기를 놓친다.

**Good**: 결정 변경 직후 검색어와 범위를 두 축으로 나눠 훑는다.

- 검색어: 제거한 함수·타입·옵션·설정 키와 도움말·명령 시그니처의 사용자 표면 표기
- 범위: `docs/prd.md`, `docs/flow.md`, `docs/code-architecture.md`, `docs/adr/`, `README.md`, `skills/`, `AGENTS.md`, 코드와 task

검색 결과는 현재 동작 설명, 역사적 결정 기록, 같은 문자열의 다른 의미로 분류한다. 현재 설명은 고치고, ADR의 역사적 본문은 보존하되 대체 범위를 표시하며, 동명이의어는 수정하지 않는다.

**검출**:

```bash
rg -n -- "--<removed-option>|RemovedType|removedSetting|<removed-arg>|\[removed-arg\]" \
  docs README.md skills AGENTS.md src tasks
```

실제 변경에 맞는 내부 식별자와 사용자 표면 표기를 각각 넣는다.

**Self-check**: 없앤 내부 식별자와 사용자 표면 표현을 모두 검색했는가? `docs/prd.md`와 공개 가이드가 범위에 들어갔는가? ADR의 역사와 현재 동작 설명을 구분했는가?

**Why**: plan064에서는 `--app-key` 제거를 ADR에만 반영해 현재 동작 문서가 남았고, plan065에서는 내부 식별자를 검색했지만 `<target>` 표기를 쓰던 PRD를 놓쳤다. 두 사례의 공통 원인은 결정이 노출되는 문서 표면을 완결적으로 정의하지 않은 것이다.

관련: [[revise-string-change-cascade-missing]], [[path-migration-agents-missing]]
