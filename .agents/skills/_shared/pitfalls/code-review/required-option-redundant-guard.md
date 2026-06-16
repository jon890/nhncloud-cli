---
id: required-option-redundant-guard
category: code-review
title: `requiredOption` 뒤 action 내부 수동 존재 검증 (dead code)
triggers: [required option, 중복 가드]
tool_catchable: false
source: [PR###]
related: []
---

**증상**: Commander `requiredOption("--name")` 으로 이미 진입 전 강제되는데, action handler 안에 `if (!opts.name) throw ...` 수동 검증을 또 둠.
절대 true 가 될 수 없는 dead code.

**Good**: `requiredOption` 으로 보장되는 필드는 action 내부 재검증 제거 + 필요 시 `opts.name!` non-null assertion (이유 주석).
`requiredOption` 으로 강제 안 되는 검증 (예: 반복 옵션의 `length === 0`) 만 수동으로 남긴다.

**검출**:
```bash
# requiredOption 으로 선언된 옵션이 action 내부에서 if(!opts.X) 로 다시 검증되는지
grep -nE "requiredOption\(\"--" src/commands/
grep -nE "if \(!opts\.[a-zA-Z]+\)" src/commands/   # 위 requiredOption 목록과 겹치면 dead code
```

**Why**: PR #6 (plan004) 🟡 — create.ts 가 `--name/--flavor/--image` requiredOption 뒤에 동일 필드를 수동 검증. nonInteractive dead code (common-pitfalls [[noninteractive-trigger-dead-warning]]) 의 옵션 검증 변형.

**Self-check**: action 내부 `if(!opts.X)` 의 X 가 이미 `requiredOption` 인가? 그렇다면 제거했는가?
