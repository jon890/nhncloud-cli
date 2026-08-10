---
id: noninteractive-interactive-duplication
category: code-review
title: non-interactive / interactive 분기 동일 가드 inline 중복
triggers: [nonInteractive, 중복, 옵션]
tool_catchable: false
source: [PR43]
related: []
---

**증상**: 한 명령이 두 입력 모드 (플래그 기반 non-interactive vs 프롬프트 기반 interactive — `src/commands/configure.ts` 의 `runNonInteractive`:321 과 `runInteractive`:164) 를 가지면서 동일한 사전 검사 시퀀스 (검증, 경고, 확인 등) 를 양쪽에 inline 으로 중복. 후속 변경 시 한쪽만 갱신되어 모드 간 동작이 달라지는 회귀 위험.
**Good**: orchestrator helper 로 추출 (예: `checkAndGuardDropped(oldBody, newBody, attachments, noConfirm)`), 두 분기에서 한 줄로 호출. helper 내부에서 검사 → 경고 → 확인 → throw 순서를 단일 정의.
**검출**: 한 명령 파일 안에서 같은 helper 가 2회 이상 호출되면서 사이에 비슷한 입력 준비 (`(... ?? []).map`) 가 반복되면 후보.
**Why**: PR #43 review — 한 명령의 non-interactive 분기와 interactive 분기가 같은 검사 시퀀스를 inline 으로 중복했다.
  현재 저장소는 `src/commands/configure.ts` 가 두 모드를 갖고, 저장과 연결 확인을 `saveAndVerify` helper 한 곳에 모아 양쪽에서 호출한다 (:299, :311, :317, :397). 새 검증 단계를 두 분기에 각각 넣으면 이 구조가 깨진다.
