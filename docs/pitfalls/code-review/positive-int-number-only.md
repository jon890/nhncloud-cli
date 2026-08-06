---
id: positive-int-number-only
category: code-review
title: 양의 정수 옵션을 `Number()` 로만 검증 (지수·빈 문자열·공백 누수)
triggers: [양수 정수, Number.isInteger]
tool_catchable: false
source: [PR13, PR21, PR22]
related: []
---

**증상**: `--page-num`·`--binary-group` 같은 양의 정수 옵션을 `const n = Number(v); if (!Number.isInteger(n) || n <= 0) throw` 로 검증.
`Number("1e2") === 100` (지수 표기가 100 으로 통과), `Number(" 5 ") === 5` (공백 통과), `Number("") === 0` (빈 문자열은 reject 되나 에러 메시지가 `(입력: )` 빈 괄호).
**Good**: `POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/` 정규식으로 표기 자체를 사전 검증한 뒤 `Number()`. 빈 문자열·소수·지수·공백을 일관 거부. 에러 메시지는 `JSON.stringify(value)` 로 입력을 표기해 빈 괄호 방지. 0 을 허용해야 하면 `NON_NEGATIVE_INTEGER_PATTERN = /^(0|[1-9]\d*)$/` 를 쓴다 — 두 상수는 `src/commands/parse-options.ts:9-10` 에 있고 `parseIntegerOption` 이 range 로 골라 쓴다.

```bash
grep -nE "Number\([a-z]" src/commands/   # 옵션 파싱에서 regex 없이 Number 만 쓰는 곳
```

**Why**: PR #13 (plan011) — `parsePositiveInt` 가 `1e2` 를 100 으로 통과시키고 빈 문자열 메시지가 빈 괄호. **⚠️ 최다 재발 패턴**: PR #21(plan016 — 옛 약화 버전 복붙), PR #22(plan017 — `volume create --size` 가 bare `Number()` → `--size 1e2` 가 100GB 발급) 까지 **3회 재발**. 새 명령에 양의 정수 옵션을 추가할 때마다 executor 가 regex 없이 `Number()` 로 새로 작성한다.
**Self-check (executor 코드 작성 직전 필수 grep)**: `grep -rnE "Number\(opts\." src/commands/` 결과의 각 줄이 `src/commands/parse-options.ts:9` 의 `POSITIVE_INTEGER_PATTERN` 검증을 거치는지 확인한다. 직접 `Number()` 를 쓰는 대신 `parseIntegerOption(value, flag, { min: 1 })` 을 호출하는 것이 기본이다. 새 `--size`/`--limit`/`--offset` 등 정수 옵션은 예외 없이 regex 선검증.
