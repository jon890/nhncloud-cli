---
id: carve-out-conflicting-prohibition
category: plan
title: 새 문서 유형 도입 시 기존 절대 금지 규칙과 충돌
triggers: [신설, 구조 변환, 금지 규칙, carve-out, 거울 구조]
tool_catchable: false
source: [PR31, plan025, PR32, plan026]
related: [structure-migration-frontmatter-placeholder, single-file-split-section-boundary-leak]
---

**증상**: 기존 규칙이 "별도 X 신설 금지"처럼 절대 금지로 쓰여 있는 영역에 새 하위 문서 유형을 도입하면, 신설 자체가 그 금지 문구와 정면 충돌한다. plan025 에서 `retros/docs-verifier-retro.md` 신설이 planning "별도 회고 docs 신설 금지" 3항과 문자 그대로 모순.

**Good**: 신설 전에 충돌하는 금지 규칙을 **carve-out**(예외 명시)으로 갱신한다 — 금지의 진짜 대상을 좁힌다. plan025 예: "별도 회고 docs 금지" → "별도 회고 *데이터* docs 금지(절차 단일 소스=retro, 데이터 단일 소스=영향 표)". 절차/데이터처럼 축을 갈라 신설 문서와 금지가 양립하게.

**원위치에서 좁혀라 (필수 — plan026 실측)**: carve-out 을 새 섹션 안 주석으로만 두면 충돌하는 **기존 무조건문이 그 자리에 그대로** 남아 latent drift 가 된다. 그 줄만 읽은 실행자가 오집행한다(plan026: 새 6.2 안에만 조건을 두자 충돌문 3곳이 무조건문으로 남음). 충돌하는 **모든 위치를 grep 으로 찾아 각 자리에서** 조건절을 붙인다 — 한 곳이라도 빠지면 미완.

**Self-check**: 새 문서·디렉터리를 신설하는 plan 인가? 기존 docs 에 "별도 X 신설 금지"·"단일 소스"·"중복 금지" 류 규칙이 그 영역을 덮는가? 덮으면 그 규칙을 carve-out 하는 항목을 phase 에 넣었는가? **충돌 anchor 를 grep 으로 전수 찾아 각 원위치에 조건절을 붙였는가**(새 섹션 주석 하나로 끝내지 않았는가)?

**Why**: PR #31 (plan025) critic MAJOR — carve-out 없이 신설하면 (a) 규칙이 신설 문서를 부정하는 자기모순 또는 (b) 절차를 양쪽에 남겨 중복(drift 재발). PR #32 (plan026) critic MAJOR — carve-out 이 단방향(새 섹션 주석만)이라 충돌문 원위치가 미수정으로 남음. 금지 규칙이 있는 영역에 새 구조를 들이는 모든 task 에서 재발 가능.
