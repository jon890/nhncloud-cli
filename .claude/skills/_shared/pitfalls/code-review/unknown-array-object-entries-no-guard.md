---
id: unknown-array-object-entries-no-guard
category: code-review
title: `unknown[]` 배열 요소를 `Object.entries` 전에 타입 가드 없이 `as Record` 캐스트
triggers: [unknown[], Object.entries, 가드]
tool_catchable: false
source: [PR###]
related: []
---

**증상**: 동적 API 응답 body 를 `Record<string, unknown>` 으로 받아 `Array.isArray` 분기 후 각 요소를 `item as Record<string, unknown>` 캐스트해 `Object.entries(item)` 호출.
배열 요소의 실제 타입은 `unknown` 이라, API 가 primitive (숫자·문자열) 배열을 반환하면 `Object.entries(<primitive>)` 가 빈 객체를 주거나 의도 외 동작 → 표 출력 깨짐/런타임 오류.
`as` 캐스트가 tsc 를 통과시켜 정적 검사로 못 잡음.

**Good**: 요소가 object 가 아닐 때를 먼저 가드.

```ts
// BAD — item 이 primitive 면 Object.entries 오동작
rows: list.map((item) => Object.entries(item as Record<string, unknown>)...)

// GOOD — primitive 가드 후 narrow
rows: list.flatMap((item) => {
  if (typeof item !== "object" || item === null) return [[String(item), ""]];
  return Object.entries(item as Record<string, unknown>).map(([k, v]) => [`${k}: ${String(v ?? "")}`, ""]);
}),
```

**검출**:
```bash
grep -rnE "as Record<string, unknown>\)" src/commands/   # 배열 요소 캐스트 의심
# 그 위치 위에 typeof !== "object" 가드가 있는지 확인
```

**Self-check**: 동적 API 응답 배열을 순회하며 `Object.entries(item)` 하는 곳에 primitive 가드가 있는가?

**Why**: plan002 (PR #2) code-reviewer FIX_NEEDED — `deploy artifacts` 가 응답 배열 요소를 가드 없이 `Object.entries` 처리. Deploy API 가 primitive 배열을 주면 런타임 TypeError.
