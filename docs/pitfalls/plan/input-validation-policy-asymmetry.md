---
id: input-validation-policy-asymmetry
category: plan
title: 입력 검증 정책 일관성 — 신규 검증 helper 가 기존 정책 일부만 포함
triggers: [입력 검증, 검증 정책, 비대칭]
tool_catchable: false
source: [PR68]
related: []
---

**증상**: 기존 payload parser 가 필수 필드 + 상호 배타 옵션을 둘 다 검증.
  새 helper `validateRequiredFields` 추가 시 이름이 "Required" 라 필수 필드만 검증하고 상호 배타 옵션 누락.
  create 는 정책 모두 검사하는데 update (신규 helper) 는 필수 필드만 → 정책 비대칭.

**Good**: 같은 도메인의 신규 검증 helper 추가 시:
- reference function (parse payload, resolve profile/region 등) 의 검증 블록을 grep 으로 모두 인용
- 새 helper 가 어떤 정책을 포함/제외하는지 plan 본문에 명시
- 이름이 한 정책만 가리켜도 실제 검증은 reference 와 일치해야 일관성 유지

```bash
# 입력 검증 블록 grep — phase 본문 작성 시 reference function 참조
grep -nE "required|mutually exclusive|exclusive|필수|동시에" src/commands src/services src/config
# 신규 helper 가 위 정책 중 어느 것을 포함하는지 plan 본문에 명시
```

**Why**: 신규 helper 가 기존 parser 정책 일부만 옮기면 create/update/list 같은 인접 명령 사이 검증 정책이 달라진다.
  다른 helper 분리 시 동일 패턴 재발 가능.
