---
id: numeric-response-string-number-mixed
category: code-review
title: 수치 응답 필드의 string/number 타입 혼재 (resultCode 패턴 확산)
triggers: [숫자 응답, string/number, 혼용]
tool_catchable: false
source: [PR13]
related: []
---

**증상**: `totalCount` 같은 수치 메타 필드를 `typeof x === "number" ? x : fallback` 로만 처리.
NHN 봉투의 `resultCode` 가 서비스마다 string/number 인 것처럼([[adr-006]]), 수치 필드도 string(`"123"`) 으로 올 수 있다. 이때 number 체크 실패 → fallback(예: 현재 페이지 길이)으로 빠져 "전체 항목 수" 의미가 어긋난다.
**Good**: 숫자 문자열이면 변환을 우선 시도하고 fallback 은 최후에만.

```ts
const n = typeof x === "number" ? x
  : typeof x === "string" && /^\d+$/.test(x) ? Number(x)
  : fallback;
```

**검출**: `grep -nE "typeof .*=== \"number\" \?" src/services/` — number-only 처리 + 의미 있는 fallback 인지 확인.
**Why**: PR #13 (plan011) — binaries `totalCount` 가 string 일 때 `list.length` 로 fallback 해 전체 수 의미 손실.
**Self-check**: API 수치 필드를 number-only 로 검사하는가? `resultCode` 처럼 string 가능성이 있으면 숫자 문자열 변환을 우선했는가?
