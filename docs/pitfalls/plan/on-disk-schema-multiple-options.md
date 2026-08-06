---
id: on-disk-schema-multiple-options
category: plan
title: on-disk 구조에 대해 phase 가 복수 옵션 허용 → 단일 소스 docs 와 불일치
triggers: [on-disk schema, 다중 옵션, 캐시 스키마]
tool_catchable: false
source: [PR3]
related: []
---

**증상**: type/스키마 phase 작업목록이 직렬화 구조를 "A 또는 B 중 깔끔한 쪽 선택" 으로 둘 다 허용.
  executor 가 data-schema.md (단일 소스) 와 다른 쪽을 택하면 on-disk JSON 이 이미 commit 된 docs 및 기존 읽기 경로와 불일치.
  예: data-schema 는 `profiles.X.{ userAccessKey, logncrash }` flat sibling 인데 phase 가 nested `services:` 래퍼 옵션도 허용 → 후자 선택 시 기존 `getServiceCredential` 읽기 경로 파손.

**Good**: 디스크에 직렬화되는 구조는 plan 본문에서 **단정** (옵션 제시 금지). data-schema.md 가 단일 소스이므로 그 구조를 그대로 못박는다.
  내부 메모리 표현은 자유롭게 두되, on-disk 형태는 docs 와 1:1.

**Self-check**: type/스키마 phase 가 디스크 직렬화 구조에 "또는" 으로 복수 옵션을 남겼는가? data-schema.md 와 정확히 일치하는 단일 구조로 단정했는가?

**Why**: PR #3 (plan003) critic MAJOR — phase-01 이 flat union 과 nested `services:` 를 둘 다 허용. data-schema.md 는 flat sibling 단일 소스라 nested 선택 시 불일치 + 읽기 경로 파손. 스키마 변경 phase 마다 재발 가능.
