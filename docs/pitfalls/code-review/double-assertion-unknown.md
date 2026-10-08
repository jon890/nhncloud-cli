---
id: double-assertion-unknown
category: code-review
title: `as unknown as T` 이중 단언
triggers: [as unknown as, 이중 단언, union type]
tool_catchable: false
source: []
related: []
---

**증상**: `expr as unknown as T` 이중 단언이 등장.
두 타입 사이의 구조적 관계가 불명확하다는 신호: 타입 설계 재검토 필요.

**Good**: 해당 서비스나 config의 `types.ts`에서 `extends`나 타입 별칭으로 두 타입의 관계를 명시한다.
이중 단언은 타입 설계 재검토 신호로 처리한다.

**변형**: API client 반환 타입이 spec 과 실제 응답 shape 가 다를 때 `(res.result as unknown as Item[][] | Item[]).flat()` 처럼 union 으로 단언하는 경우가 있다.
호출 지점에서 단언하지 말고 `ListResponse.result: Item[] | Item[][]` 처럼 반환 타입 자체를 union 으로 선언한다.
`Array.prototype.flat()` 시그니처가 union 양쪽을 흡수하므로 `res.result.flat()` 을 단언 없이 호출할 수 있다.

**검출**:
```bash
grep -nE "as unknown as " src/
```

**Why**: 두 타입 관계를 이중 단언으로 우회하면 타입 안전성이 깨지고, spec 과 실제 응답의 shape 불일치가 조용히 통과한다.

**Self-check**: `as unknown as T` 가 등장하면 타입 구조적 관계를 types.ts 에 명시했는가?
