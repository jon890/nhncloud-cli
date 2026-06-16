---
id: cache-bypass-in-verify-helper
category: plan
title: 검증 helper 가 캐시 우선(cache-first) 함수를 재사용 → false-positive
triggers: [캐시, bypass, verify helper]
tool_catchable: false
source: [plan###]
related: []
---

**증상**: 자격증명·연결 검증 helper 가 기존 캐시 우선 getter (예: `getAccessToken` 이 `readToken(profile)` 캐시 히트 시 외부 호출 생략) 를 그대로 재사용.
  캐시 키가 검증 대상 (UAK 값) 이 아니라 다른 축 (profile) 기준이면, **틀린 입력인데도 직전 유효 캐시가 남아 있어 검증이 통과** (false-positive).
  configure 재실행 시 틀린 UAK 재입력 → 직전 profile 토큰 캐시 히트 → verify 가 성공으로 오판. "검증 없으면 잘못된 키를 실제 명령에서야 발견" 이라는 검증 도입 취지 자체를 무력화.

**Good**: 검증/테스트 helper 는 **반드시 캐시를 우회**한다.
- 재사용 함수에 `forceRefresh?: boolean` 추가 (true 면 캐시 읽기·쓰기 양쪽 건너뜀). 기존 호출은 default false 로 동작 유지.
- verify helper 가 `forceRefresh=true` 로 호출. plan 본문에 "캐시 우회 필수" 명시 + 성공 기준에 `grep forceRefresh` 추가.

**Self-check**: 새 검증/테스트 helper 가 재사용하는 함수가 캐시·메모이즈를 하는가? 그 캐시 키가 검증 대상 값과 무관한 축이면 우회 경로를 뚫었는가?

**Why**: PR #3 (plan003) critic MAJOR — `verifyUserAccessKey` 가 캐시 우선 `getAccessToken` 재사용. 캐시는 profile 키라 틀린 UAK 도 false-positive. 향후 다른 검증 helper (토큰·세션·연결 테스트) 가 캐시 우선 함수를 재사용할 때 재발 가능.
