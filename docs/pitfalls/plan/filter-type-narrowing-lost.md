---
id: filter-type-narrowing-lost
category: plan
title: `.filter()` 후 TypeScript 타입 자동 미좁힘
triggers: [filter, narrowing, type predicate]
tool_catchable: false
source: [PR67]
related: []
---

**증상**: `arr.filter((x) => typeof x.field === "string")` 후 `arr.map((x) => ({ name: x.field }))` 작성.
  사람은 "필터 후니까 string 보장" 으로 이해하지만 TypeScript 는 filter callback 의 boolean return 으로 narrowing 안 함 → x.field 는 여전히 `string | undefined`.
  다음 사용처에서 type 불만족 (`NameRecord extends { name: string }` 위반 등) 으로 TS2345/TS2339.

**Good**: 두 가지 방법:
- **type predicate** (선호 — 안전): `.filter((x): x is X & { field: string } => typeof x.field === "string" && x.field.length > 0)` — TypeScript 가 narrowing 인지
- **`as string` 단언** (간단): `arr.map((x) => ({ name: x.field as string }))` + 단언 안전성 주석 (`// filter 로 string 보장`)

```ts
// BAD — narrowing 안 됨
const attached = volume.attachments.filter((a) => typeof a === "object" && a !== null);
const ids = attached.map((a) => a.server_id);   // TS2339: a 는 여전히 unknown

// GOOD A — type predicate
const attached = volume.attachments.filter(
  (a): a is { server_id: string } =>
    typeof a === "object" && a !== null && "server_id" in a
);
const ids = attached.map((a) => a.server_id);   // OK

// GOOD B — 단언 + 주석 (src/commands/volume/get.ts:38 이 쓰는 방식)
const ids = attached.map((a) => String(a.server_id));   // filter 로 object 보장
```

**검출**: type optional 완화 후 `filter` + `map` 체인이 plan 에 등장하면 narrowing 패턴 확인. 단언 사용 시 주석 필수.

**Why**: PR #67 (plan032) critic Major #3 — filter 뒤 map 에서 TS2345/TS2339 가 났고 executor 가 단언 추가로 회피했다.
  type predicate 가 더 안전하지만 단언과 주석으로도 넘어갈 수 있어, plan 이 어느 쪽인지 못 박지 않으면 실행마다 갈린다.
  현재 저장소의 같은 형태는 `src/services/ncs/client.ts` 의 `filter(isNcsTemplateSummary)` 처럼 type predicate 로 쓰는 쪽과 `src/commands/volume/get.ts:38` 처럼 단언으로 쓰는 쪽이 섞여 있다. 새 응답 필드에 filter 를 붙일 때마다 반복 가능.
