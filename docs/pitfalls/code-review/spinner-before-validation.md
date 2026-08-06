---
id: spinner-before-validation
category: code-review
title: validation 전에 spinner 시작 (param 에러 시 spinner leak)
triggers: [spinner, validation, UX 순서]
tool_catchable: false
source: [PR47]
related: []
---

**증상**: `startSpinner(...)` 가 profile/region/payload 파일 검증 **앞** 에 있음. 파라미터 오류 발생 시 spinner 가 떠 있는 채 stderr 에 에러 메시지가 흘러 ora 애니메이션 문자와 섞임.
**Good**: profile/region/payload 파일 검증과 path parameter trim 검증을 spinner 보다 앞에 두고, 같은 명령군 내 일관성 유지.

```bash
# 같은 명령군 내 spinner ↔ 헬퍼 순서 일관성 검증
for f in src/commands/<scope>/*.ts; do
  echo "--- $f ---"
  awk '/\.action\(async/,/^  \}\)\;/' "$f" | \
    grep -nE "(startSpinner|resolveProfile|resolveRegion|read.*Input|JSON\\.parse)" | head -5
done
```

**Why**: 쓰기 명령과 파일 입력 명령은 입력 검증 실패가 잦다. spinner 시작 전에 검증을 끝내야 stderr 출력이 깨지지 않는다.
