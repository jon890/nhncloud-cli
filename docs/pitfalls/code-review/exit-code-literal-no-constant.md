---
id: exit-code-literal-no-constant
category: code-review
title: exit code 등 의미 상수를 리터럴 + 주석으로 사용
triggers: [exitCode, 리터럴, 상수]
tool_catchable: false
source: [PR3]
related: []
---

**증상**: `exit-codes.ts` 에 `EXIT_PARAM_ERROR = 3` 상수가 이미 있는데 한 파일만 `throw new NhnCloudCliError("...", 3 /* EXIT_PARAM_ERROR */)` 처럼 리터럴 + 주석.
나머지 파일은 상수 import 사용 — 신규 파일만 예외 상태로 일관성 깨짐.

**Good**: 정의된 상수를 import 해서 쓴다. 주석으로 상수명을 다는 것은 "상수가 있다는 걸 알면서 안 쓴" 신호.

**검출**:
```bash
# NhnCloudCliError / process.exit 의 2번째 인자가 숫자 리터럴인 곳
grep -rnE "NhnCloudCliError\([^,]+,\s*[0-9]+|process\.exit\([0-9]+\)" src/
# exit-codes.ts 상수 목록과 대조
grep -nE "EXIT_[A-Z_]+ =" src/utils/exit-codes.ts
```

**Self-check**: 새 파일의 exit code 인자가 숫자 리터럴인가? 같은 값의 `EXIT_*` 상수가 exit-codes.ts 에 있으면 import 로 교체.

**Why**: PR #3 (plan003) code-reviewer MEDIUM — configure.ts 가 `3 // EXIT_PARAM_ERROR` 리터럴. 다른 파일은 모두 상수 import. 신규 명령·helper 파일마다 재발 가능.
