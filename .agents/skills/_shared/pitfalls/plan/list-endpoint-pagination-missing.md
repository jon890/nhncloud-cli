---
id: list-endpoint-pagination-missing
category: plan
title: 새 목록 endpoint 의 pagination 미처리 → 기본 page_size 묻혀버린 절단
triggers: [list endpoint, 페이지네이션]
tool_catchable: false
source: [plan###]
related: []
---

**증상**: 새 목록 조회 endpoint 를 추가하면서 단일 호출로 전체를 받는다고 가정한다. 그러나 REST API(특히 Harbor·Kubernetes·GitHub 등 표준 구현)는 기본 page_size(보통 10~25)로 **앞부분만** 돌려주고 나머지는 `Link: rel="next"` 헤더나 `next` 토큰·`marker` 로 페이지네이션한다. plan 의 실측이 항목 적은 리소스로만 통과하면 큰 리소스에서 **조용히 앞 N개만** 반환 — 목록 명령의 정확성이 깨지는데 tsc·help·작은 실측은 못 잡는다.

**Good**: 새 목록 endpoint 는 pagination 방식을 실측으로 확인하고(첫 응답의 `Link`/`x-total-count`/`next` 헤더·필드) 전수 수집한다.
- `page_size` 를 API 최대값(예 Harbor 100)으로 두고 `Link: rel="next"` 가 없을 때까지(또는 marker 소진까지) 루프 누적.
- ky 사용 시 `await ky.get(...)` Response 를 받아 `.json()` 과 `.headers.get("link")` 를 **함께** 쓴다(`.json<T>()` 체이닝하면 헤더를 못 봐 pagination 불가).
- 무한루프 방어로 max-page cap 은 선택. 항목 많은 리소스로 실측해 2페이지 이상 수집을 단위테스트로 박제(`ky.get` 2회 호출 단언).
- 이 프로젝트는 이미 `instance images`(marker)·`logncrash export`(scroll) 등에서 pagination 을 다룬다 — 새 목록도 같은 결로 맞춘다.

**Self-check**: 새 목록 명령의 첫 응답에 pagination 헤더/필드가 있는가? 있으면 전수 수집하는가, 단일 호출인가? 항목 많은 리소스로 실측해 truncation 이 없는지 확인했는가?

**Why**: PR #28 (plan022) critic MAJOR — `ncr images`/`ncr tags` 가 Harbor REST 를 단일 호출로 가정. 실측에서 한 repo 에 artifact 60·145개 + `Link: rel="next"`·`x-total-count: 60` 확인 — 기본 page_size 면 앞부분만. `getAllPages`(page_size=100·rel="next" 전수)로 정정, artifact 145개 repo 2페이지 수집을 실측·테스트로 박제. 새 목록 endpoint 추가마다 재발 가능.
