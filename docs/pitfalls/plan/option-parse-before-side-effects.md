---
id: option-parse-before-side-effects
category: plan
title: CLI 옵션 parser 적용 시 parsed 변수 hoist 누락
triggers: [옵션 parser, 숫자 옵션, validation, side effect, 자격증명]
tool_catchable: false
source: [PR44, plan031]
related: [spinner-before-validation, positive-int-number-only, numeric-param-range-unverified]
---

**증상**: plan 이 parser helper 적용을 지시하지만 parsed 변수를 `getDeployTarget()`, `createDeployClient()`, `resolve*Client()`, `startSpinner()`, API payload 구성 직전 또는 내부에 남긴다.
invalid CLI option 이 config, credential, token, spinner, API 준비 경로를 먼저 밟는다.

**Good**: `opts` 추출 직후 모든 CLI option 을 `const parsedX = parse...(...)` 형태로 hoist 한다.
target resolve, client 생성, spinner, API args 는 parsed 변수만 사용한다.

**Self-check**: 변경 대상 command 마다 parsed 변수 목록을 plan 에 열거한다.
각 parsed 변수가 side-effectful 호출보다 앞에 있는지 grep 으로 확인한다.

**Why**: plan031 에서 `deploy run --concurrent` parsing 순서가 `getDeployTarget()` / `createDeployClient()` / spinner / `client.run()` 보다 앞이라고 명시되지 않아 critic REVISE 가 발생했다.

관련: [[spinner-before-validation]], [[positive-int-number-only]], [[numeric-param-range-unverified]]
