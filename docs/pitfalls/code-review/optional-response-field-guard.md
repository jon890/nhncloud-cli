---
id: optional-response-field-guard
category: code-review
title: 응답 타입에 optional 필드 추가 후 guard 가 값 타입을 검증하지 않음
triggers: [optional 필드, 응답 가드, type guard]
tool_catchable: false
source: [PR43]
related: [nullable-field-string-only-guard, optional-field-as-cast-return]
---

**증상**: 외부 API 응답 타입에 `availability_zone?: string` 같은 optional 필드를 추가하면서 `isX()` guard 는 필드 존재 여부나 타입을 검증하지 않는다.
잘못된 응답이 `availability_zone: 123` 을 반환해도 guard 가 통과하고, 호출부는 값을 `string | undefined` 로 신뢰해 출력·가공한다.

**Good**: optional 응답 필드는 생략 또는 기대 타입만 허용한다.
타입 선언과 guard 조건, 회귀 테스트를 같은 변경에 포함한다.

```ts
function isVolume(val: unknown): val is Volume {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj["id"] === "string" &&
    (obj["availability_zone"] === undefined || typeof obj["availability_zone"] === "string")
  );
}
```

**검출**:

```bash
grep -rn "?: " src/services/ | grep types.ts
grep -rn "function is.*(val: unknown)" src/services/
```

새 optional 응답 필드를 type 에 추가했으면 해당 service client 의 `isX()` guard 에 생략 허용 + 타입 검증이 있는지 대조한다.

**Self-check**: 외부 응답에서 오는 optional 필드인가?
그 필드가 type 에만 있고 guard 에 없지는 않은가?
비정상 타입 응답을 `EXIT_API_ERROR` 로 거부하는 test 가 있는가?

**Why**: PR43(plan032) — `Volume.availability_zone?: string` 을 추가했지만 `isVolume` 은 해당 필드를 검증하지 않아 숫자 응답도 통과했다.
code-reviewer 가 `availability_zone: 123` 회귀를 지적했고, guard + test 로 수정했다.

관련: [[nullable-field-string-only-guard]], [[optional-field-as-cast-return]]
