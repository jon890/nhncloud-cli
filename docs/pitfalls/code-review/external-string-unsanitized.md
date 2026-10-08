---
id: external-string-unsanitized
category: code-review
title: 외부에서 받은 문자열을 sanitize 없이 stderr/stdout 출력
triggers: [외부 문자열, sanitize, ANSI]
tool_catchable: false
source: []
related: []
---

**증상**: 서버 응답·사용자 입력에서 받은 문자열 (파일명, 멤버 displayName, 에러 메시지 등) 을 그대로 `process.stderr.write` / `process.stdout.write` 로 출력.
  악의적 측이 ANSI escape 시퀀스나 control char (`\x00-\x1F`, `\x7F`) 를 삽입하면 터미널 색상·커서·title 변조 가능.
**Good**: 출력 직전 `name.replace(/[\x00-\x1F\x7F]/g, "?")` 로 제거. 공통 helper (`sanitizeForTerminal`, `sanitizeMultilineForTerminal`: `src/utils/terminal.ts`) 를 신규 출력 지점에서도 재사용.
**검출**: `grep -nE "(stderr\|stdout)\.write\(.*\\$\\{[a-zA-Z]+\\.(name\|content\|title\|message)" src/` — sanitize 안 거친 동적 출력 의심 패턴.
**Why**: 서버가 준 파일명 같은 문자열을 그대로 stderr 에 출력하면 악의적 값에 든 ANSI escape 로 터미널이 변조된다. 서버는 사용자 입력을 그대로 echo 할 수 있으므로 sanitize 는 출력 경계의 책임이다.
