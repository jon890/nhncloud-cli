---
id: exitcode-missing
category: code-review
title: exitCode 누락
triggers: [exitCode, NhnCloudCliError, process.exit]
tool_catchable: false
source: []
related: []
---

**증상**: 에러 분기에서 `process.exit(N)` 또는 `throw new NhnCloudCliError(msg, exitCode)` 호출 누락 → 0 으로 종료되어 호출 스크립트가 실패 인지 못함.
**Good**: 모든 에러 경로는 `NhnCloudCliError` 또는 명시적 `process.exit(N)`. exitCode 정책은 `src/utils/exit-codes.ts` 참조.
**검출**: 오류 문구를 쓰면서 `src/utils/exit-codes.ts` 상수를 import 하지 않는 명령 파일이 누락 후보다. grep 은 행을 넘지 못하므로 파일 단위로 본다.

```bash
comm -12 <(rg -l "오류|실패" src/commands/ --glob '!*.test.ts' | sort) \
         <(rg -l --files-without-match "exit-codes" src/commands/ --glob '!*.test.ts' | sort)
```

결과의 각 파일에서 오류 분기가 `NhnCloudCliError` 나 `process.exit` 없이 `return` 하는지 확인한다. 사용자 취소(확인 프롬프트 거부)처럼 의도적인 0 종료는 예외다.
