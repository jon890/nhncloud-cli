---
id: shared-helper-in-command-file
category: code-review
title: 공용 순수 유틸 헬퍼를 command 파일에 로컬 정의 → 다른 command 가 복붙/peer import
triggers: [helper, 중복, confirmDestructive, requireNonEmpty, helpers.ts]
tool_catchable: false
source: [PR48]
related: [duplicate-map-block-no-helper, noninteractive-interactive-duplication]
---

**증상**: 여러 command 가 공유하는 작은 순수 유틸(삭제 confirm, 빈값 검증 등)을 첫 command 파일에 로컬 정의하고, 다음 command 파일이 (a) 같은 함수를 그대로 복붙하거나 (b) peer command 파일에서 `import ... from "./template.js"` 로 끌어다 쓴다.
  PR48 에서 `confirmDestructive`(template.ts → workload.ts import), `requireNonEmpty`(workload.ts·malware.ts 복붙) 두 건이 각각 다른 phase 에서 발생 → code-reviewer 가 매번 LOW 로 지적 → 사후 helpers.ts 이전.
**Good**: 2개 이상 command 가 쓸 순수 유틸(client 의존 없는 confirm/validation/parse)은 처음부터 `src/commands/<svc>/helpers.ts` 에 정의하고 각 command 가 거기서 import. peer command 파일에서 import 하지 않는다(대칭 깨짐 — `resolveNcsClient` 가 helpers 에 있는 것과 일관).
**Self-check**: 새 command 파일 작성/리뷰 시 `grep -n "^\(export \)\?\(async \)\?function" src/commands/<svc>/*.ts` 로 같은 함수명이 2 파일 이상에 있거나, command 파일이 peer command 파일(`./<other-command>.js`)에서 유틸을 import 하면 helpers.ts 이전 후보.
**Why**: 로컬 정의는 첫 phase 엔 자연스럽지만 다음 phase 가 재사용하면서 복붙/역방향 의존이 생기고, 후속 변경 시 한쪽만 갱신되는 회귀 위험 + review 왕복 비용. helpers.ts 단일 정의가 cheaper.
