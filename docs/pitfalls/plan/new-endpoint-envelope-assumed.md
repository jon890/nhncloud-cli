---
id: new-endpoint-envelope-assumed
category: plan
title: 새 endpoint (다른 host·인증) 의 응답 봉투 형태를 docs 대조 없이 "(확정)" 으로 단정
triggers: [endpoint, 봉투, isSuccessful]
tool_catchable: false
source: [PR16]
related: []
---

**증상**: 기존 서비스와 host·인증이 다른 새 endpoint 를 추가하면서, 응답 봉투 형태(예: `header` 중첩 vs flat)를 기존 코드 패턴으로 가정하고 phase 본문에 "(확정)" 으로 적는다.
host·인증이 다르면 응답 형태도 다를 개연성이 큰데, 코드가 `res.header.isSuccessful` 로 단정하면 실제가 flat 일 때 `header` undefined → TypeError → catch 로 빠져 **전송 성공인데도 "오류"로 보고**되는 묻혀버린 실패가 된다.

**Good**: phase 작성 시 새 endpoint 의 응답 예제 JSON 을 **공식 docs 에서 인용**해 형태를 못박는다 (AGENTS.md "API 스펙 확인 절차" — response body 구조도 docs 예제로 대조, 추측 머지 금지). docs 로도 불확정이면 (a) HTTP 2xx 를 성공으로 판정하고 body 는 방어적으로만 검사하거나 (b) 실측으로 확정한다. ADR 본문에도 응답 형태 확정 근거(어느 docs 예제)를 남긴다.

**Self-check**: 새 endpoint 의 응답 판정 코드(`res.header...` 등)가 추측이 아니라 docs 예제 인용 또는 실측 근거를 갖는가? 자동 성공 기준이 실제 전송을 안 한다면 이 형태 오류는 수동 QA 에서만 드러난다 — 머지 전 수동 QA 를 성공 기준에 명시했는가?

**Why**: PR #16 (plan012) critic MAJOR — logncrash collector 응답을 `header.isSuccessful` 로 단정("확정"). 실제로는 docs 가 검색과 동일한 중첩 봉투임을 확인해 통과했으나, 확인 전엔 flat 가정 리스크가 열려 있었다. 새 서비스·새 host endpoint 추가마다 재발 가능.
