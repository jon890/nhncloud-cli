---
id: exitcode-missing
category: code-review
title: exitCode 누락
triggers: [exitCode, NhnCloudCliError, process.exit]
tool_catchable: false
source: [plan###]
related: []
---

**증상**: 에러 분기에서 `process.exit(N)` 또는 `throw new NhnCloudCliError(msg, exitCode)` 호출 누락 → 0 으로 종료되어 호출 스크립트가 실패 인지 못함.
**Good**: 모든 에러 경로는 `NhnCloudCliError` 또는 명시적 `process.exit(N)`. exitCode 정책은 `src/utils/exit-codes.ts` 참조.
**검출**: `grep -nE 'console\.error.*\n.*return\b' src/commands/`.
