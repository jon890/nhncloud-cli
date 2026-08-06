---
id: union-false-nullish-coalescing
category: code-review
title: `T | false` union 반환 라이브러리에 `??` 사용 부적합
triggers: [union, false, ??, nullish]
tool_catchable: false
source: [PR53]
related: []
---

**증상**: 값의 타입에 `false`·`0`·`""` 같은 falsy 멤버가 "없음" 의 뜻으로 들어 있는데 `??` 로 기본값을 채운다.
`??` 는 `null`·`undefined` 만 건너뛰므로 그 falsy 값이 그대로 통과해, 표에 빈 칸이 찍히거나 문자열 자리에 `false` 가 흘러든다.
이 저장소의 표면은 `src/config/types.ts` 의 optional 문자열 필드다 — `ServiceCredential.appkey` 가 `""` 로 저장돼 있으면 `cred.appkey ?? "(미설정)"` 이 빈 문자열을 통과시킨다. `src/commands/configure.ts` 가 `.trim().length === 0` 을 별도로 검사하는 이유가 이것이다.
**Good**: 외부 라이브러리가 `T | false` / `T | 0` / `T | ""` 반환 가능하면 `||` 사용 (falsy 전체를 default 로 흘림). 단 의도된 빈 문자열 보존이 필요하면 명시적 `typeof` / `=== false` 가드 + 한 줄 주석으로 의도 명시.
**검출**: `grep -rnE "\?\? \"" src/commands/` 로 문자열 기본값을 채우는 자리를 훑고, 좌변 필드의 타입 정의에 falsy 멤버(`| false` / `| 0` / optional 문자열) 가 있는지 확인한다. 있으면 `??` 가 그 값을 통과시키는지 판단한다.
**Why**: PR #53 review — 외부에서 온 값이 `false` 였는데 `??` 가 통과시켜 문자열 슬롯에 `false` 가 들어갔다. `||` 로 교체하고 의도 주석을 달았다. 커널은 특정 라이브러리가 아니라 "타입에 falsy 멤버가 있으면 `??` 로는 못 걸러낸다" 는 것이므로, 저장된 빈 문자열·0 카운트·`--no-*` 옵션의 `false` 에 모두 적용된다.
