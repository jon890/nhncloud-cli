---
id: union-overload-common-guard-only
category: code-review
title: union/오버로드 반환 + 타입 가드가 공통 필드만 검증 → 확장 분기 전용 필드 런타임 미검출
triggers: [union, overload, 공통 가드]
tool_catchable: false
source: [PR9]
related: []
---

**증상**: 오버로드/union 반환 메서드(`listFlavors(): Promise<Flavor[] | FlavorDetail[]>`)에서 `as A[] | B[]` 단언으로 분기.
응답 가드가 두 분기의 **공통 필드(id·name)만** 검증해, 확장 분기(B = `FlavorDetail`) 전용 필드(`vcpus`·`ram`·`disk`)는 런타임에 한 번도 확인되지 않는다.
API 가 detail 스키마를 변경해 전용 필드를 누락시키면 — formatter 가 `String(undefined)` 로 "undefined" 셀을 그대로 출력하고 에러는 안 난다 (사용자가 잘못된 정보로 후속 선택).
오버로드 시그니처는 컴파일 타임만 보장 — critic 이 "오버로드가 정적 보장하니 캐스트 정당" 으로 오판하기 쉬움.

**Good**: 확장 분기 전용 가드를 추가해 number 필드까지 검증하고, 분기별로 가드가 타입을 좁히게 해 단언을 제거.

```ts
// BAD — 공통 가드만 + as 단언. detail 전용 필드 런타임 미검증
if (!isFlavorsResponse(raw)) throw ...;
return raw.flavors as Flavor[] | FlavorDetail[];

// GOOD — detail 분기 전용 가드 + 분기별 좁히기로 단언 제거
if (params.detail) {
  if (!isFlavorDetailsResponse(raw)) throw ...;  // vcpus·ram·disk: number 까지 검증
  return raw.flavors;                            // FlavorDetail[] 로 좁혀짐
}
if (!isFlavorsResponse(raw)) throw ...;
return raw.flavors;                              // Flavor[]
```

**검출**:
```bash
grep -rnE "as \w+\[\] \| \w+\[\]" src/   # union 배열 단언 반환 의심
# 그 union 의 superset 타입(B) 전용 필드를 검증하는 가드가 있는지 확인
```

**Self-check**: 오버로드/union 반환 메서드가 확장 타입 전용 필드를 런타임 가드로 검증하는가? 아니면 공통 필드만 보고 `as` 로 통과시키는가?

**Why**: plan007 (PR #9) bot review 🟡 — `listFlavors` `--detail` 응답이 공통 가드(`isFlavorsResponse`)만 거쳐 detail 필드 미검증. Nova 스키마 드리프트 시 "undefined" 셀 출력. critic 은 phase 단계에서 이 캐스트를 정당으로 봤으나 런타임 드리프트는 놓침.
