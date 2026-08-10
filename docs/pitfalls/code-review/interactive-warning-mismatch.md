---
id: interactive-warning-mismatch
category: code-review
title: interactive 경고 vs 실제 동작 mismatch
triggers: [interactive, 경고, nonInteractive]
tool_catchable: false
source: [PR55]
related: []
---

**증상**: interactive 분기에서 "옵션 X 는 무시됩니다" 경고를 추가했으나 실제로 옵션 resolve 로직이 interactive 경로에도 적용됨.
경고 텍스트와 코드 경로가 정반대.

**Good**: 경고 텍스트 추가 시 해당 옵션의 resolve/merge 로직이 `nonInteractive` 조건 안에만 있는지 grep 으로 확인.

**검출**:
```bash
grep -B 3 -A 10 "무시됩니다\|ignored" src/commands/
# 같은 옵션 grep 으로 nonInteractive 조건 외에서 사용되는지 확인
```

**Why**: PR #55 (plan028) 🔴 — 경고 문구가 실제 동작과 불일치했다.
  현재 저장소의 기준 예시는 `src/commands/configure.ts` 다. `runInteractive`(:164) 와 `runNonInteractive`(:321) 가 나뉘어 있고, `--logncrash-secret` 경고는 "사용하거나 저장하지 않습니다" 라고 말한다. 이 문구가 참인지는 해당 옵션이 저장 경로(`saveAndVerify`) 인수에 끼지 않는지 grep 으로 확인해야 알 수 있다.

**Self-check**: 경고 문구와 실제 코드 경로가 일치하는가?
경고 옵션 이름이 `nonInteractive` 조건 안에만 있는지 grep 으로 확인했는가?
