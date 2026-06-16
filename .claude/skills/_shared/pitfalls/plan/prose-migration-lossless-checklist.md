---
id: prose-migration-lossless-checklist
category: plan
title: 산문·절차 이전의 무손실은 요소 체크리스트로 기계화
triggers: [축약, 이전, 무손실, 단일화, 절차]
tool_catchable: false
source: [PR31, plan025]
related: [single-file-split-section-boundary-leak, carve-out-conflicting-prohibition]
---

**증상**: 산문·절차를 한 곳에서 다른 곳으로 옮기는(축약·단일화) plan 의 완료 조건을 "무손실·중복 0"으로만 적으면, grep 으로 검증되는 placeholder 와 달리 정작 핵심인 의미 무손실은 검증 명령이 없어 downstream review 로 떠넘겨진다. plan025 에서 회고 절차 3곳→retro 축약의 "절차 중복 0" 이 처음엔 기계 검증 없이 semantic 대조에만 의존.

**Good**: 옮길 **의미 요소를 열거**하고(예: 트리거 / 갱신 위치 / 판정 기준 / 형식 / 커밋 규약), 각 요소가 ① 목적지에 정확히 1회 존재 ② 출발지에는 부재(참조 1~2줄 + 고유 맥락만 잔존) 임을 요소 단위로 대조하는 체크리스트를 phase 본문에 둔다. `single-file-split-section-boundary-leak` 교훈(무손실=수 일치와 경계 정합은 별개)을 산문 이전에 적용한 것.

**Self-check**: 산문·절차를 이전·축약하는 plan 인가? 완료 조건의 "무손실·중복 0"이 막연한 산문인가, 아니면 옮길 요소를 열거해 ①목적지 1회 ②출발지 부재로 기계 대조하는가?

**Why**: PR #31 (plan025) critic MAJOR — task 의 전체 가치가 "중복 제거"인데 그 검증을 게이트에 떠넘기면 사전 해소(plan 책무)에 어긋나 재평가 사이클을 부른다. grep 불가능한 의미 무손실을 요소 단위 dialectic 으로 기계화한다. 절차·산문을 옮기는 모든 구조 변환 task 에서 재발 가능.
