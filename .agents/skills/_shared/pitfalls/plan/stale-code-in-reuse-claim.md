---
id: stale-code-in-reuse-claim
category: plan
title: "기존 X 패턴과 동일" 이라 적고 코드 블록은 **수정 전 옛 버전**을 보여줌 + bot 차단 docs 를 "확정" 으로 단언
triggers: [stale code, 재사용, 코드]
tool_catchable: false
source: [PR21]
related: []
---

**증상 A (stale code in reuse-claim)**: plan 이 `(011 의 parsePositiveInt 패턴과 동일)` 처럼 기존 helper 재사용을 주장하면서, 보여준 코드 블록은 그 helper 가 **이미 고친 옛 버전**(예: regex 대신 `Number()`)이다. executor 가 literal 복사하면 이전에 잡았던 결함(4-4 등)이 재도입된다 — 주장↔코드 모순.
**증상 B (bot-blocked docs 확정)**: docs 가 봇차단(WebFetch 제한)인데 endpoint 경로(단/복수)·응답 형태·필드 타입을 "(확정)" 으로 단언. AGENTS.md "API 스펙 확인 절차"(추측 머지 금지)와 충돌.
**증상 C ([[decision-docs-in-phase]] 헤딩 잔존 모순)**: [[decision-docs-in-phase]] 분리를 적용하며 "team-lead docs-first" 노트는 넣었으나 옛 섹션 헤딩 `## 내부 docs 반영 (이 phase 안에서)` 를 안 고쳐 두 지시가 정면 충돌.

**Good**:
- A: "동일" 주장 시 **실제 파일을 grep 으로 열어 현재(수정 후) 코드를 그대로 복사**한다. `import`·helper·가드는 reference 파일의 라인을 인용. literal 단일 줄 import 는 "기존 블록에 merge(교체 금지)" 로 명시.
- B: bot 차단 docs 항목은 "(확정)" → **"실측 pending — 수동 QA 1차 호출로 확정"** 으로 격하하고 ⚠️ 표시. 쓰기 작업이면 어차피 수동 QA([[write-command-executor-live-call]])라 거기서 함께 확정. 코드는 분기 양쪽에 견고하게 + 어긋날 때의 review-fix 경로 명시.
- C: [[decision-docs-in-phase]] 적용 시 **옛 헤딩까지** `## ... (team-lead docs-first — executor 범위 밖)` 로 고친다 (노트만 추가하지 말 것).

**Self-check**: "기존 X 와 동일/재사용" 주장의 코드가 실제 파일과 1:1 인가(grep 대조)? 새 타입 검증이 기존 가드보다 **과하게 엄격**하지 않은가(number|string 관용)? bot 차단 docs 를 "확정" 으로 단언한 곳이 있는가? [[decision-docs-in-phase]] 분리에서 옛 헤딩이 "이 phase 안에서" 로 남아 있는가?

**Why**: PR #21 (plan016) critic 4 MAJOR — parsePositiveInt 옛 약화 버전 재도입(A) · binaryKey number 강제(과엄격) · download 응답/endpoint "확정"(B) · 내부 docs 헤딩 모순(C). 모두 reference 코드 grep 대조 + 실측 pending 격하 + 헤딩 통일로 해소. "기존 패턴 재사용" + "bot 차단 API" plan 마다 재발.
