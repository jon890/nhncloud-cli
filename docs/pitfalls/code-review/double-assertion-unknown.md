---
id: double-assertion-unknown
category: code-review
title: `as unknown as T` 이중 단언
triggers: [as unknown as, 이중 단언]
tool_catchable: false
source: [PR64]
related: []
---

**증상**: `expr as unknown as T` 이중 단언이 등장.
두 타입 사이의 구조적 관계가 불명확하다는 신호: 타입 설계 재검토 필요.

**Good**: 해당 서비스나 config의 `types.ts`에서 `extends`나 타입 별칭으로 두 타입의 관계를 명시한다.
이중 단언은 타입 설계 재검토 신호로 처리한다.

**검출**:
```bash
grep -nE "as unknown as " src/
```

**Why**: PR #64 (plan031): 두 타입 관계를 이중 단언으로 우회.

**Self-check**: `as unknown as T` 가 등장하면 타입 구조적 관계를 types.ts 에 명시했는가?
