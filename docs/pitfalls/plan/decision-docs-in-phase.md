---
id: decision-docs-in-phase
category: plan
title: planning에서 갱신한 관리 문서를 phase가 다시 편집함
triggers: [decision, docs, phase 본문]
tool_catchable: false
source: [PR16, PR17]
related: [new-command-docs-required-skip]
---

**증상**: planning 단계에서 제품 범위, 흐름, 코드 경계나 ADR을 이미 갱신했는데 구현 phase가 같은 관리 문서를 다시 편집한다. 작성자와 실행자의 소유권이 겹치면서 서로 다른 시점의 설명이 생긴다.

**Good**: 제품 요구사항과 설계 결정처럼 task의 전제가 되는 관리 문서는 planning이 task 생성 전에 갱신한다. 구현 phase는 코드와 구현 결과에 따라 달라지는 사용자 가이드만 다룬다. 실측해야 확정되는 관리 문서가 있으면 실측 뒤 별도 갱신 단계와 소유자를 명시한다.

**검출**:

```bash
rg -n "docs/(prd\.md|flow\.md|code-architecture\.md|data-schema\.md|adr/)" tasks/<plan>/phase-*.md
```

검색된 관리 문서가 이미 planning에서 갱신된 전제인지, 구현 뒤 실측이 필요한 예외인지 구분한다.

**Self-check**: phase가 planning에서 이미 확정한 관리 문서를 다시 편집하는가? 실측 의존 문서라면 갱신 시점과 소유자가 분명한가? 공개 사용자 가이드와 관리 문서의 책임을 구분했는가?

**Why**: PR #16에서는 planning이 갱신해야 할 ADR과 구조 문서를 구현 phase에 함께 넣어 소유권이 겹쳤다. PR #17에서는 endpoint 실측 뒤 문서 갱신이 필요해 시점 예외를 명시해야 했다. 일반 원칙은 관리 문서의 소유권을 한 단계에만 두는 것이다.

관련: [[new-command-docs-required-skip]]
