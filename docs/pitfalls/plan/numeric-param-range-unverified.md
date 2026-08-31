---
id: numeric-param-range-unverified
category: plan
title: 새 API 의 수치 파라미터 범위(pageSize/limit/maxResults)를 docs 확인 없이 추측 기본값·상한으로 박음
triggers: [숫자 파라미터, 범위, 검증]
tool_catchable: false
source: [PR24]
related: []
---

**증상**: 새 endpoint 의 `pageSize`·`limit` 같은 수치 파라미터의 **허용 범위·기본값**을 docs 확인 없이 추측한다(예: "pageSize 기본 1000·최대 1000"). 실제 docs 한도가 다르면(10~100) 코드 검증·기본값·help 텍스트가 전부 틀린 채 ship 되고, 첫 실호출에서 422/400 또는 조용한 절단으로 드러난다. tsc·help 성공기준은 수치 범위를 모르니 못 잡는다.

**Good**: 수치 파라미터는 **공식 docs 의 범위 명세를 인용**해 확정한 뒤 검증·기본값·help·docs 를 모두 그 값으로 맞춘다.
- API 가이드에서 "pageSize: 10~100" 같은 범위 문구·예제 값을 찾아 plan 에 인용.
- 정수 형식을 먼저 검사하고, 문서가 정한 범위 밖 값은 거부한다. help·README·SKILL·코드 기본값이 같은 값인지 교차 확인한다.
- docs가 봇 차단이면 [stale-code-in-reuse-claim](stale-code-in-reuse-claim.md)처럼 "추정: 수동 QA 확정"으로 격하하고 보수적 기본값을 쓴다.

**Self-check**: 새 수치 옵션의 범위·기본값이 docs 인용에 근거하는가, 추측인가? 코드 검증·기본값·help·README·SKILL 다섯 곳이 같은 범위로 일치하는가?

**Why**: PR #24(plan019) critic M2 부수 발견: export `--size`(scroll pageSize)를 1에서 1000, 기본 1000으로 추측했으나 공식 Log & Crash Search API docs는 **10에서 100**이라고 설명한다. WebFetch로 응답 예제와 범위를 확인한 뒤 허용 범위를 10에서 100, 기본값을 100으로 정정했다. 새 API의 페이지 이동과 한도 수치마다 재발할 수 있다.
