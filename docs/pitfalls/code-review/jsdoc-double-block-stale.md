---
id: jsdoc-double-block-stale
category: code-review
title: 함수 시그니처 수정 시 구 JSDoc 블록 미삭제
triggers: [JSDoc, 중복 블록, stale]
tool_catchable: false
source: [PR3]
related: []
---

**증상**: 기존 함수에 파라미터를 추가하며 새 JSDoc 블록을 함수 위에 작성했는데 구 JSDoc 블록을 지우지 않아 **JSDoc 두 개가 연속**으로 남음.
TypeScript 는 마지막 블록만 귀속시켜 런타임 영향은 없으나 구 블록이 AI slop 으로 잔존 + 구 설명이 현행과 모순.

**Good**: 시그니처 수정 시 기존 JSDoc 을 **수정**한다 (새 블록을 위에 덧붙이지 않는다). 덧붙였으면 구 블록 삭제.

**검출**:
```bash
# 연속된 JSDoc 종료-시작 (*/ 다음 줄이 /**) 탐지
grep -nA1 "^\s*\*/$" src/**/*.ts | grep -B1 "^\S*-\s*/\*\*"
```

**Self-check**: 함수 시그니처를 바꾼 파일에서 함수 직전에 JSDoc 블록이 2개 연속인 곳이 없는가?

**Why**: PR #3 (plan003) code-reviewer LOW — `getAccessToken` 에 forceRefresh 추가하며 새 JSDoc 을 위에 붙이고 구 블록을 안 지움. 시그니처 변경 리팩토링마다 재발 가능.
