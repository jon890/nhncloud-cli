---
id: new-command-docs-required-skip
category: plan
title: 신규 명령 task 가 영향 표 필수 사용자 가이드 docs 를 "범위 외" 로 스킵
triggers: [신규 명령, docs, CLAUDE.md]
tool_catchable: false
source: [plan###]
related: []
---

**증상**: 신규 CLI 명령 task 의 마지막 (사용자 가이드) phase 가 `skills/nhncloud-cli/SKILL.md` 만 작성하고 `README.md` 사용 예 섹션을 "PoC 범위 외" 로 명시 스킵.
  planning SKILL 8단계 A항 "변경 유형별 docs 영향 표" 의 "신규 CLI 명령" 행은 README.md 사용 예 + CLAUDE.md "N개 명령 카운트" 를 **필수** (조건부 아님) 로 표시 → docs-verifier UPDATE_NEEDED.

**Good**: 신규 명령 task 의 phase 작성 시 영향 표 해당 행이 필수로 표시한 docs 를 모두 phase 작업 목록에 포함. "PoC 라서 생략" 판단으로 표의 필수 항목을 빼지 않는다 (표가 단일 소스).
  CLAUDE.md 는 결정 doc 이라 phase 안에서 못 고치므로, team-lead 가 phase 루프 밖 별도 commit 으로 "N개 명령 카운트" 보완.

**Self-check**: 신규 명령 phase 가 영향 표의 README/SKILL/CLAUDE 필수 항목을 모두 다루는가? "범위 외" 로 표의 필수 항목을 뺀 곳이 없는가?

**Why**: PR #1 (plan001) — phase-06 이 "README.md 는 PoC 범위 외" 로 명시 스킵했으나 영향 표는 README 사용 예를 필수로 요구 → docs-verifier UPDATE_NEEDED. 신규 명령마다 재발 가능.

**메타 문구 누락 보강 (PR #10·#11 연속 관측)**: 사용 예 섹션은 갱신하면서 **README intro "지원 명령" 문구 + `skills/nhncloud-cli/SKILL.md` 프론트매터 description + 본문 명령 목록** 을 빠뜨리는 누락이 008·009 연속으로 docs-verifier UPDATE_NEEDED 를 유발했다. 이 셋은 명령 본문 추가와 떨어진 "한 줄 요약"이라 잊기 쉽다.
  - **backlog 일괄 생성 task 의 함정**: 008·009 처럼 docs sweep 으로 미리 만든 phase 파일은 **회고 이전에 작성**되어, 회고로 planning 영향 표를 보강해도(008 PR #10 에서 intro/description 을 표에 추가) 그 phase-02 작업 목록에는 반영돼 있지 않다. executor 는 영향 표를 능동 대조하지 않고 phase 작업 목록을 따르므로 또 놓친다.
  - **대응**: backlog task 를 build-with-teams 로 돌릴 때 team-lead 가 executor 스폰 프롬프트에 "새 명령 추가 시 README intro 지원 명령 문구 + SKILL 프론트매터 description + 본문 명령 목록도 갱신" 을 명시한다 (영향 표 보강만으로는 backlog phase 에 소급 안 됨).
  - **SKILL.md 는 두 곳 (PR #11·#13 연속 재발)**: 프론트매터 `description`(line 3, 파일 최상단 메타) 과 본문 명령 목록·매핑 표는 **별개 위치**다. executor 가 "SKILL 갱신" 을 받으면 눈에 띄는 본문(사용 예·매핑 표)만 고치고 프론트매터 description 을 빠뜨리는 사고가 반복된다(009 PR #11, 011 PR #13 둘 다 docs-verifier 가 프론트매터 description 만 UPDATE_NEEDED). 스폰 프롬프트에서 "프론트매터 description(line 3) **과** 본문 명령 목록 **둘 다**" 로 분리해 명시한다. 프론트매터 description 은 AI 에이전트의 스킬 선택 트리거라 누락 시 새 명령이 자연어 매칭에서 빠진다.
