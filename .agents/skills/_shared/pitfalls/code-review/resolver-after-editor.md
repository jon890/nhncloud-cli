---
id: resolver-after-editor
category: code-review
title: resolver 를 파일·stdin·payload 수집보다 뒤에 호출 (resolver-before-input)
triggers: [resolver, file, stdin, payload]
tool_catchable: false
source: [PR74, PR64]
related: []
---

**증상**: profile, region, deploy target, API client resolver 호출이 `readFile`, stdin 수집, payload JSON parse 보다 뒤에 있음.
resolver 실패 시 사용자가 이미 파일·stdin payload를 준비한 뒤 실패해 자동화가 불필요한 I/O를 수행한다.

**Good**: resolver 를 항상 파일·stdin·payload 수집보다 먼저 호출한다.
`configure`, `nks cluster create --file`, `deploy upload --file` 같은 명령은 입력 검증과 resolver 순서를 명확히 유지한다.

**검출**:
```bash
grep -B 5 "readFile\|readStdin\|JSON.parse" src/commands/ | grep -B 5 -A 1 "resolve[A-Z][A-Za-z]*"
# resolver 호출이 뒤에 있으면 의심
```

**Why**: resolver 실패는 사용자 입력을 읽기 전에 빠르게 드러나야 한다.
자동화에서 잘못된 profile/region 때문에 payload 파일을 읽은 뒤 실패하면 원인 파악이 늦어진다.

**Self-check**: file/stdin/payload 명령 작성 시 resolver 호출 순서가 입력 수집보다 앞인지 grep 으로 확인했는가?
