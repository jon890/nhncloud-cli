---
id: test-expected-value-guessed
category: plan
title: 테스트 작성 phase 의 기대값(에러 wrap 여부·exit code·반환 형태)을 대상 함수 실제 동작 확인 없이 추측
triggers: [테스트, 기댓값, 추측]
tool_catchable: false
source: [plan###]
related: []
---

**증상**: 테스트 작성 task 의 phase 본문에 단언 기대값을 적으면서 대상 함수의 실제 분기를 읽지 않고 추측한다. 특히 "원형 보존 vs wrap"·"throw vs 무반환" 같이 정반대인 두 동작은 코드 미확인 시 거꾸로 적기 쉽다. phase 캐논(index.json description)에까지 틀린 기대값이 박히면 executor 가 (a) 틀린 단언으로 테스트를 깨거나 (b) 코드를 "버그" 로 오인해 프로덕션을 수정(외과적 위반)·허위 버그 리포트로 샌다.

**Good**: 테스트 phase 작성 시 단언 기대값은 추측이 아니라 대상 함수의 실제 코드(파일:라인)를 읽고 그 동작을 mirror 한다 — "테스트가 코드를 mirror, 코드를 테스트에 맞추지 말 것". 에러 변환 함수는 각 분기(status→exit code, raw Error→wrap/passthrough)를 코드에서 직접 인용해 기대값으로 박는다. 단언은 동작에 맞는 형태로: wrap 이면 `exitCode === EXIT_API_ERROR`, passthrough 면 `toBe(original)` 참조 동일성 — `instanceof` 만으로 wrap/원형을 구분하려 하지 않는다. instanceof 분기를 타는 입력은 **실제 인스턴스로** 만든다(`new HTTPError(...)`); 평범한 객체(`{response:{status}}`)는 `instanceof` 가 false → 다른 분기로 빠져 우연히 같은 값이면 잘못된 이유로 green 된다.

**Self-check**: phase 의 모든 테스트 기대값이 대상 함수 코드(파일:라인)에 근거하는가? "원형 보존/wrap"·"throw/무반환" 같은 반대쌍을 코드로 확인했는가? instanceof 분기 입력이 실제 인스턴스인가?

**Why**: PR #25 (plan020) critic MAJOR — httpError 테스트 phase 가 raw Error 를 "원형 보존(감싸지 않음)" 으로 단언했으나 실제 `httpError.ts:25-27` 은 `NhnCloudCliError(EXIT_API_ERROR)` 로 wrap. index.json description 에까지 정반대 기대값 전파. MINOR 로 HTTPError 를 평범한 객체로 만들면 404/500 이 분기를 안 타고 잘못된 이유로 통과하는 함정도 지적됨. 테스트 작성 task 마다 재발 가능.
