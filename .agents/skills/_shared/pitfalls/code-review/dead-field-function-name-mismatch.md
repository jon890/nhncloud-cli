---
id: dead-field-function-name-mismatch
category: code-review
title: dead 필드 접근 fix 후 함수명-동작 불일치
triggers: [dead field, 함수명 불일치]
tool_catchable: false
source: [PR52]
related: []
---

**증상**: `resource?.ipAddress ?? resourceId` 같은 dead 필드 접근 (`ipAddress` 가 타입에 없어 항상 fallback) 을 `.name` 등으로 fix 해 tsc 통과 시켰지만, 함수명 `resourceIdToIp` 은 그대로 둠.
함수가 실제로는 name 을 반환하는데 호출자는 IP 로 오인할 수 있음.
  잘못된 함수명은 이후 배포/인스턴스/네트워크 흐름에서 실제 위험으로 이어질 수 있다.
**Good**: dead 필드 접근 / undefined fallback fix 시점에 함수명 + 호출자 변수명 (`emails: string[]` → `names: string[]`) 까지 일괄 점검.
  fix scope 안에서 rename 가능하면 같은 commit 에 흡수, 별도 PR 이 깔끔하면 follow-up commit.
  **호출자 검색**: `grep -rn "<함수명>\b" src/` 로 caller 모두 확인 후 의미상 충돌 없는지 검토.
**검출**: tsc fix PR 작성 시 변경된 함수명을 `git diff <base>..HEAD --diff-filter=M -U0 src/` 로 추출 → 함수 시그니처가 *값의 의미를 전달* 하는데 동작이 바뀌었으면 rename 후보. 자동 검출 어렵지만 review 단계에 명시적 self-check 항목으로.
**Why**: dead field fix 후 값의 의미가 바뀌었는데 함수명은 예전 의미를 시사하면 caller가 잘못된 값을 신뢰한다.
  tsc fix 와 rename 을 한 묶음으로 처리하는 습관이 회귀 방어.
