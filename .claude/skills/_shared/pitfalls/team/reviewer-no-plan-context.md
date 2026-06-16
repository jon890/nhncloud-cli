---
id: reviewer-no-plan-context
category: team
title: code-reviewer 에 plan 비자명 설계 결정 미전달
triggers: [reviewer, plan 컨텍스트]
tool_catchable: false
source: [plan###]
related: []
---

**증상**: code-reviewer 가 plan 컨텍스트 모르면 정상 helper 사용을 권장하다 설계 의도와 충돌 (false positive LOW 양산).
**왜**: team-lead 가 일일이 판정해야 함.

team-lead 의 검사 시작 메시지에 plan 의 비자명 결정 (helper 우회 사유 / 의도된 raw pattern / 의도된 placeholder 등) [[file-scope-inaccurate]] 줄 첨부.
