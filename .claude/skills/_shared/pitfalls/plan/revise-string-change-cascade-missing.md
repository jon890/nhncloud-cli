---
id: revise-string-change-cascade-missing
category: plan
title: plan 의 REVISE/FIX 수정이 자기 plan 의 성공기준 grep 토큰·회피항목을 깨뜨림 (변경 전파 누락)
triggers: [REVISE, 문자열 변경, cascade]
tool_catchable: false
source: [PR24]
related: []
---

**증상**: REVISE 반영으로 코드의 **문자열(에러 메시지·상수·식별자)을 바꿨는데**, 그 문자열을 부분일치로 검사하던 **성공기준 grep 토큰**이나 **회피 항목의 예시 문구**를 같이 안 고친다. 결과: (a) 올바른 구현인데 성공기준이 옛 토큰을 못 찾아 **false-fail**, (b) 그 false-fail 을 "고치려고" executor 가 옛 문자열을 도로 넣어 **방금 한 수정이 되돌아간다**.

**Good**: 문자열을 바꾸는 수정은 **그 문자열을 참조하는 모든 곳을 같은 수정에서 갱신**한다.
- 바꾼 문자열을 plan 전체에서 grep: `grep -n "<옛 토큰>" tasks/<plan>/phase-*.md` → 성공기준·회피항목·docs 인용 전부 새 토큰으로.
- 성공기준 grep 토큰은 **변경에 안정적인 마커**를 고른다 — 자주 바뀌는 단정 문구 대신 구조적 마커(`원인:` 같은 "원본 보존" 표식).
- 회피 항목이 옛 메시지를 "예시"로 들고 있으면 구현과 어긋나므로 같이 갱신 — executor 가 회피항목을 스펙으로 읽고 되돌릴 위험 차단.

**Self-check**: 이번 수정이 바꾼 문자열(메시지·상수)을 grep 하는 성공기준이 있는가? 그 grep 토큰이 새 문자열과 일치하는가? 회피항목·docs 인용에 옛 문자열이 남았는가?

**Why**: PR #24 (plan019) critic M4 — M3 가 만료 메시지를 `"scrollKey 가 만료되었습니다..."` → `"...(원인: ${err.message}). 만료(유효 1분)일 수 있으니..."` 로 바꿨는데 성공기준 #9 가 여전히 `grep -c "scrollKey 가 만료"` → 올바른 구현이 false-fail. 그 게이트 압박이 M3 를 되돌릴 경로를 염. #9 토큰을 `"원인:"`(원본보존 마커)로 교체 + 회피항목 갱신으로 해소. 문자열 바꾸는 REVISE 마다 재발 가능.
