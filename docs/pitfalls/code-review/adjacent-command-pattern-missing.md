---
id: adjacent-command-pattern-missing
category: code-review
title: 같은 도메인 인접 명령의 defensive 패턴 동일 적용 누락
triggers: [인접 명령, 패턴]
tool_catchable: false
source: [PR46]
related: []
---

**증상**: 같은 명령군의 `list` 명령은 service/API 실패를 try-catch로 감싸 부분 실패를 허용하는데, 새 `get` 또는 `events` 명령은 동일 패턴을 누락해 보조 API 실패가 전체 실패로 전파됨.
**Good**: 같은 도메인 (`src/commands/<svc>/`) 신규 명령 작성 시 인접 파일 (`list.ts`, `get.ts`, `create.ts` 등) 의 enrich / cleanup / dry-run / 출력 분기 패턴을 grep 으로 먼저 확인하고 그대로 적용. 일관성이 회귀 방어선.
**검출**: phase 작성 / review 시 `grep -nE "try\s*\{|catch\s*\(|new Map|allSettled" src/commands/<svc>/*.ts` 결과를 신규 명령과 인접 명령 사이 diff. 인접 명령에 있는 가드가 신규 명령에 없으면 의도적인지 확인.
**Why**: critic / docs-verifier 는 새 명령 자체의 동작만 보고 인접 명령군의 defensive pattern 누락을 놓치기 쉽다.
  plan 작성 시 *"인접 명령 동일 패턴 적용 점검"* 을 self-check 에 포함하면 사전 차단 가능.
