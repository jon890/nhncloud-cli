---
id: punt-orphan-deliverable
category: plan
title: phase 간 punt 한 산출물이 받는 phase 에 작업항목으로 없음 (고아 참조)
triggers: [orphan, deliverable, 산출물 누락]
tool_catchable: false
source: [plan###]
related: []
---

**증상**: phase A 가 "이건 phase B 에서 만든다" 고 미룬(punt) 산출물이, 정작 phase B 작업목록에는 없음.
다른 phase 가 그 산출물을 전제 (예: forceRefresh 를 "verify 용" 이라 설명) 하는데도 생성 task 자체가 누락 → executor 가 "다른 phase 가 한다" 고 믿고 아무도 안 만듦.
예: phase-1 이 `verifyIaas` 를 "phase 3 에서 추가" 라 적었으나 phase-3 작업목록에 0건. token 발급 함수 (`getIaasToken`) 가 phase-2 라 의존상 phase-3 에서 못 만드는데도 punt 대상이 틀림.

**Good**: punt 하는 산출물은 (1) 받는 phase 번호를 정확히 (의존성 기준) 지정하고, (2) 그 받는 phase 작업목록에 실제 작업항목 + 성공기준 grep 을 넣는다.
punt 표현 (`phase N 에서 추가 예정`) 을 쓴 산출물 이름을 grep 해 받는 phase 에 실재하는지 확인.

**검출**:
```bash
# punt 문구에서 산출물 이름 추출 → 받는 phase 에 작업항목으로 있는지
grep -rnE "phase [0-9]+ 에서|예정|추가한다" tasks/{plan}/
# 각 산출물 이름을 받는 phase 파일에서 grep — 작업목록 + 성공기준 양쪽에 있어야 함
```

**Self-check**: punt 한 산출물마다 받는 phase 번호가 의존성상 가능한가? 그 phase 작업목록 + 성공기준에 실제로 등장하는가?

**Why**: PR #6 (plan004) critic MAJOR — phase-1 이 `verifyIaas` 를 phase-3 으로 punt 했으나 phase-3 에 작업항목 0건. token 발급이 phase-2 라 phase-3 에선 못 만드는 의존성 오류까지 겹침. 검증 helper·헬퍼 추출을 다른 phase 로 미루는 작업마다 재발 가능.
