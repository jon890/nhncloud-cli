---
id: write-command-executor-live-call
category: plan
title: 쓰기 작업(resize/attach/create/delete) plan — live 실측 자율 실행 대신 표준 설계 + 수동 QA + 정정 loop
triggers: [write 명령, executor, live call]
tool_catchable: false
source: [plan###]
related: []
---

**증상**: 새 명령이 실제 클라우드 리소스를 변경(쓰기)하는데, phase-01 이 "실제 호출로 동작 확정(실측)" 을 executor 작업으로 둔다. executor 가 자율로 리소스를 생성/변경/삭제하면 비용·다운타임·되돌리기 어려움이 발생한다(사용자 자원).

**Good**: 쓰기 plan 은 (a) **동작을 docs/표준으로 확정**한다(예: OpenStack Nova v2 resize 2단계는 표준 — VERIFY_RESIZE 후 confirm/revert, ADR-010 으로 NHN=Nova v2 확립). (b) **코드는 가능한 동작 분기 모두에 견고**하게 작성(예: fire-and-return + 사용자 `get` 확인 → 자동/수동 confirm 어느 쪽도 사용자를 가두지 않음). (c) **live 쓰기 실측은 수동 QA(사용자)** 로 남긴다 — executor 자율 실행 금지. (d) **QA contingency loop** 한 줄: "QA 가 표준 추론과 어긋나면 PR review-fix 로 명령 surface·카운트·docs 정정". build-with-teams 의 자동 성공 기준은 자격증명 없이 검증되는 부분(tsc/build/help/exit code)만 두고, live 부분은 "수동 QA" 절로 분리한다.

**Self-check**: 이 명령이 쓰기 작업인가? phase-01 의 "실측" 이 executor 자율 live 호출을 요구하는가 → 수동 QA 로 바꾸고 동작은 docs/표준 근거로 확정했는가? 코드가 동작 분기 양쪽에 견고한가? 표준 추론이 틀릴 때의 정정 loop 가 문서화됐는가?

**Why**: PR #19 (plan014) — `instance resize` 는 쓰기 작업이라 사용자 정책상 live 호출을 수동 QA 로 남기고, Nova v2 표준 + ADR-010 근거로 (B) 수동 confirm 확정, 코드는 (A)/(B) 양쪽 견고. plan017(volume attach/detach)·018(floating ip create/delete) 등 쓰기 plan 마다 재발.

> **변형 (backlog "선행 의존" hedge stale)**: 백로그 plan 의 phase 가 "선행 task X 폴더가 아직 없으니 먼저 만들라/사용자 확인하라" 같은 hedge 를 담는데, 실행 시점엔 X 가 **이미 머지돼 base 에 존재**하는 경우. executor 가 그 hedge 를 보고 halt 하거나 엉뚱하게 선행 폴더 신설을 시도할 위험. team-lead 가 실행 전 grep 으로 선행이 base 에 있는지 확인하고 hedge 를 "이미 머지 완료 — 검증: grep ≥1" 로 교체한다. PR #22(plan017) — phase-01 이 013(network)을 "아직 없음" 으로 기술했으나 이미 머지됨.
