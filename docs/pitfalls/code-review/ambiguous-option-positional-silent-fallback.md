---
id: ambiguous-option-positional-silent-fallback
category: code-review
title: 옵션과 positional 중복 입력에서 silent fallback (`opts.X ?? positional`)
triggers: [옵션, positional, silent fallback]
tool_catchable: false
source: [PR46]
related: []
---

**증상**: positional 인자와 옵션이 같은 값 (예: `id` positional 과 `--id`) 을 받을 때 `opts.id ?? id` 처럼 nullish coalescing 으로 옵션 우선 처리.
깔끔해 보이지만 두 입력이 동시에 들어오면 한쪽이 silent 하게 무시되어 사용자 의도 모호.
**Good**: 모호한 입력은 명시적 에러로 처리한다. `if (id && opts.id) throw new NhnCloudCliError(..., EXIT_PARAM_ERROR)` 후 어느 쪽이든 단독 사용한다. parser/helper가 있으면 동일 가드를 둔다.
**검출**: `grep -rnE 'opts\.[a-zA-Z]+\s*\?\?\s*arg[0-9]' src/commands/` (옵션 우선 fallback 패턴).
**Why**: 사용자가 `nhncloud <service> get id-A --id id-B` 같은 중복 입력을 넘기면 `id-A` 가 silent 무시될 수 있다.
  CLI는 자동화에서 많이 쓰이므로 모호한 입력을 거부해야 한다.
