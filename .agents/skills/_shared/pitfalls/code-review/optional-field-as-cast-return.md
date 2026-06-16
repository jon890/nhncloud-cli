---
id: optional-field-as-cast-return
category: code-review
title: optional 필드를 `as T` 로 캐스트해 undefined 묵시 반환
triggers: [optional 필드, as cast, 반환]
tool_catchable: false
source: [PR###]
related: []
---

**증상**: 봉투/응답 타입의 `body?: T` 처럼 optional 필드를 `return res.body as T` 로 반환.
성공 응답인데 body 가 없는 edge case 가 오면 `undefined` 를 `T` 로 조용히 반환 → 호출부에서 `.totalItems` 등 접근 시 런타임 TypeError.
`as T` 가 컴파일 타임 검사를 무력화해 tsc 도 못 잡음.

**Good**: 캐스트 대신 undefined guard 후 narrow 된 값을 반환.

```ts
// BAD — body 가 undefined 여도 T 로 통과
export function unwrap<T>(res: NhnEnvelope<T>): T {
  if (!res.header.isSuccessful) throw ...;
  return res.body as T;
}

// GOOD — undefined 를 명시적으로 거름
export function unwrap<T>(res: NhnEnvelope<T>): T {
  if (!res.header.isSuccessful) throw ...;
  if (res.body === undefined) {
    throw new NhnCloudCliError("API 응답에 body 가 없습니다.", EXIT_API_ERROR);
  }
  return res.body;
}
```

**검출**:
```bash
grep -rnE "\.body as |return [a-zA-Z.]+ as [A-Z]" src/api/   # optional 필드 as 캐스트 반환 의심
```

**Self-check**: optional (`?:`) 필드를 `as T` 로 반환하는 곳이 있는가? 그러면 undefined 가 T 로 누수 — guard 로 교체.

**Why**: PR #1 (plan001) — `unwrap` 의 `res.body as T` 가 optional body 의 undefined 를 묵시 반환. envelope 는 모든 service client 가 공유하므로 한 번의 누수가 전 서비스에 전파.
