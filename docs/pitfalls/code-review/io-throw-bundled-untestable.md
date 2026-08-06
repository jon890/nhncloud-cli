---
id: io-throw-bundled-untestable
category: code-review
title: I/O + throw 결정을 한 함수에 묶음 → 단위 테스트 불가
triggers: [IO, throw, 테스트]
tool_catchable: false
source: [PR43]
related: []
---

**증상**: 한 helper 가 (1) stderr 출력, (2) readline 사용자 입력, (3) NhnCloudCliError throw 를 동시에 담당. vitest 에서 stdin/stdout mock 없이 단위 테스트 작성 불가 → 결국 테스트 누락.
**Good**: 책임 분리 — `printWarning(...)` (stderr 만) / `confirmPrompt(): Promise<boolean>` (입력만) / `orchestrator(...)` (throw 결정). 순수 helper 만이라도 단위 테스트로 보호.
**검출**: `async function ... Promise<void>` 안에 `process.stderr.write` + `readline.createInterface` + `throw` 셋이 동시에 있으면 분리 후보.
**Why**: PR #43 review — 한 helper 가 세 책임을 묶어 테스트가 아예 작성되지 않았다. 책임을 쪼갠 뒤에야 단위 테스트로 회귀를 막을 수 있었다.
  현재 저장소의 분리 사례는 두 helper 다.
    - `src/commands/ncs/helpers.ts` 의 `readJsonPayload` — 파일 검증과 throw 만 담당해 `helpers.test.ts` 가 temp 파일로 5개 경로를 직접 검증한다.
    - 같은 파일의 `confirmDestructive` — TTY 판정과 확인 입력만 담당하고 stderr 출력은 호출부에 남긴다.
