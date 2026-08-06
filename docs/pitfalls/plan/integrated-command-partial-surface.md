---
id: integrated-command-partial-surface
category: plan
title: 통합 명령(configure 등)에 신규 서비스 옵션 추가 시 통합 표면 일부만 수정
triggers: [통합 명령, partial surface]
tool_catchable: false
source: [PR26]
related: []
---

**증상**: `configure` 처럼 여러 서비스 자격증명을 한 명령으로 받는 통합 진입점에 새 서비스 옵션(`--ncr-appkey` 등)을 추가하면서, plan 이 "옵션 + verify 추가" 한두 줄로 압축한다. 실제로는 통합 표면 5곳을 동시에 손대야 하고 한 곳만 빠져도 조용히 오작동한다:
1. 옵션 타입(`XxxOptions`) + Commander `.option` 정의.
2. 비대화형 파싱(`runNonInteractive`)에서 옵션→자격증명 객체 변환.
3. 비대화형 빈-가드(`if (!a && !b && !c)`)에 `&& !new` — 누락 시 신규 옵션 단독 호출이 "설정할 항목 없음" 오류로 잘못 빠진다.
4. `hasFlag` OR-체인 — 누락 시 신규 옵션이 비대화형이 아닌 **대화형으로 빠진다**(스크립트·AI 호출 차단).
5. **고정 위치인자 헬퍼**(`saveAndVerify(a, b, c, verify)` 같은) 시그니처 + 호출처 전부 — 위치인자라 한 곳만 빠뜨려도 인자가 밀려 타입 에러 또는 잘못된 값 전달.

**Good**: 통합 명령 옵션 추가 phase 는 본문에 위 5곳(또는 해당 명령의 실제 표면) 체크리스트를 명시하고, 작성 직전 `grep -nE "hasFlag|<헬퍼명>|runNonInteractive|<빈가드조건>" src/commands/<명령>.ts` 로 현재 줄을 재확인한다(line drift 대비 — 번호는 참고값). 고정 위치인자 헬퍼는 시그니처 + 호출처를 grep 으로 전수 확인.

**Self-check**: 신규 옵션 식별자가 위 5곳 전부에 등장하는가? interactive ↔ 비대화형 분기 mismatch 0건(옵션이 한 분기에만 있지 않은가)?

**Why**: PR #26 (plan021) critic MAJOR — `--ncr-appkey` 추가를 "옵션 + verifyNcr" 로 압축했으나 configure.ts 의 hasFlag·빈가드·runNonInteractive·saveAndVerify(고정 위치인자 호출처 4곳)를 빠뜨림. [[noninteractive-trigger-dead-warning]](nonInteractive trigger 확장)의 인접 패턴이나 **고정 위치인자 헬퍼 시그니처+호출처 동시 수정** 측면이 별도. configure 에 새 서비스 자격증명을 추가하는 plan 마다 재발 가능.
