---
id: success-criterion-no-enforcement
category: plan
title: 성공 기준이 핵심 위험을 enforce 못함 (구조 검사만 / 변별력 없는 grep)
triggers: [성공 기준, enforcement, 검증]
tool_catchable: false
source: [plan###]
related: []
---

**증상**: phase 성공 기준이 `tsc`·`build`·구조 grep 만 담아, 그 task 의 *진짜 위험* 을 자동으로 막지 못한다. 자율 pipeline 에서 estimate·누락이 green 으로 통과한다. 두 갈래:
- **실측 미강제**: "추측 금지·실측 확정" 이 전제인 task 인데, 성공 기준에 실측을 강제하는 게이트가 없어 추정값으로 코드를 채워도 전부 통과 (예: 새 endpoint host/경로 estimate).
- **변별력 없는 docs grep**: `grep -c 'image'` 처럼 **기존 텍스트로도 통과**하는 토큰을 검증에 써서, 신규 행을 안 넣어도 green (false-pass). PR #10·#11 의 docs drift 학습이 정확히 이 구멍으로 다시 샜다.

**Good**:
- 실측 필요 task 는 성공 기준에 forcing function 을 넣는다 — 실측 후 제거되는 `⚠️ 추정값` 주석 잔존 0 검사, 또는 실측 결과(HTTP status 등) 기록 + 실패 시 `PHASE_BLOCKED`.
- docs 검증 grep 은 **신규 고유 토큰**(`instance images`·`listImages` 등 그 변경으로만 생기는 문자열)으로 한다. 기존 코드/문서에 이미 있는 부분문자열(`image`·`--image`) 금지. 편집 전 baseline 이 0 인지 확인.

**검출**:
```bash
# phase 성공 기준의 docs grep 이 기존 텍스트로도 통과하는지 — 편집 전 baseline
git stash; grep -c '<검증토큰>' <docs>; git stash pop   # baseline >0 이면 변별력 없음
```

**Self-check**: 이 task 의 핵심 위험(실측 확정 / 신규 docs 행 / 런타임 불변식)이 성공 기준의 자동 검사로 *실제로 막히는가*? 추정값·누락 상태로 성공 기준을 전부 통과시킬 수 있으면 게이트가 비어 있는 것.

> **자기참조 grep 함정 (PR #19/plan014)**: 성공 기준이 `grep -c "<토큰>" 같은_파일.md` 형태인데 `<토큰>` 이 **그 grep 명령줄 자체에도 등장**하면 항상 ≥1 을 반환해 "기대 0" 을 절대 만족 못 한다(placeholder 완성 여부 검사에서 흔함). grep 을 절(`sed -n '/## 시작/,/## 끝/p' | grep`)로 한정하거나, 검사 대상이 사전 충전돼 의미 없으면 기준을 삭제한다.

**Why**: PR #12 (plan010) critic 2 MAJOR — ① image endpoint 실측이 성공 기준에 없어 estimate 완료 가능, ② docs 검증이 `grep -c 'image'` 라 기존 `--image` 텍스트로 통과. 둘 다 성공 기준 문구를 forcing/변별 토큰으로 바꿔 해소. 외부 의존 실측·신규 docs 행이 있는 task 마다 재발 가능.
