---
id: decision-docs-in-phase
category: plan
title: backlog task 의 phase 가 결정 docs(adr/CLAUDE/flow/code-architecture) 편집을 묶음 → 갱신 시점 분리 위반
triggers: [decision, docs, phase 본문]
tool_catchable: false
source: [PR16, PR17]
related: []
---

**증상**: 미리 만들어 둔(backlog) task 의 phase-01 이 코드 + `docs/adr/NNN-slug.md`(ADR 본문) + `AGENTS.md`(카운트·표) + `docs/flow.md` + `docs/code-architecture.md` 편집을 한 phase 작업 목록에 묶어 executor 에게 지시한다.
planning SKILL "갱신 시점 분리" 표는 이 6개를 **결정 docs = planning 단계 즉시 반영(team-lead docs-first)** 으로 규정하고, phase 안 편집을 critic REVISE / docs-verifier VIOLATION 사유로 본다. 묶으면 executor in-phase 편집 + team-lead out-of-loop 편집이 겹쳐 이중 편집·소유권 모호가 된다.

**Good**: build-with-teams 로 backlog task 를 돌릴 때 **team-lead 가 실행 전에 결정 docs 를 phase 에서 떼어내 docs-first commit 으로 분리**하고, phase 변경 파일을 코드(+ 마지막 phase 의 README/SKILL)만 남긴다. 신규 ADR 동반 task 는 거의 항상 이 분리가 필요하다 — backlog 라 회고 이전 작성이면 phase 본문이 옛 구조(docs 묶음)일 수 있으니 plan{N} 마다 선제 확인한다.

**Self-check**: phase 변경 파일에 `docs/adr/`/AGENTS.md/flow.md/code-architecture.md 가 있는가? 있으면 team-lead docs-first 로 이관하고 phase 는 코드 전용으로 줄였는가? 성공 기준의 결정-docs grep(ADR grep·카운트 grep)도 phase 에서 빼 docs-verifier 로 이관했는가?

**Why**: PR #16 (plan012) critic MAJOR — phase-01 이 ADR-014 + AGENTS.md + flow + code-architecture 편집을 묶어 pitfall [[new-command-docs-required-skip]]·갱신 시점 분리와 충돌. team-lead docs-first 분리로 해소. plan012~019 처럼 일괄 생성된 backlog task 군은 모두 같은 구조라 매 plan 재발 가능 — 실행 전 선제 분리.

> **변형 (실측 의존 결정 docs)**: 결정 docs 내용이 phase 의 **실측 확정값**(예: endpoint host, API 가 받는 id 종류)에 의존하면, team-lead 가 docs-first 를 코드 phase **이전**이 아니라 **이후**(실측값 반영 후) 별도 commit 으로 작성한다. 소유권(team-lead)은 유지, 타이밍만 코드 뒤로. commit 순서: feat(코드) → docs(결정) → docs(공개). repo 의 ADR-013(image)·ADR-013 보강(network)이 실측 후 작성된 선례 — PR #17(plan013).
