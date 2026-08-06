---
id: router-index-count-mismatch
category: plan
title: 라우터 INDEX 카운트와 실제 파일 수 불일치
triggers: [INDEX, 라우터, 디렉터리화, 카운트, bullet]
tool_catchable: true
source: [PR30, plan024]
related: [single-file-split-section-boundary-leak, structure-migration-frontmatter-placeholder]
---

**증상**: 디렉터리 + INDEX 라우터 구조에서 INDEX 헤더 카운트(`(36)`)와 실제 bullet 목록 수·파일 수가 어긋난다. plan024 에서 헤더는 `(36)` 인데 bullet 은 34개(2개 파일 미등재). code-reviewer + docs-verifier 양쪽이 잡음.

**Good**: INDEX 작성/수정 후 `ls <category>/*.md | wc -l` == `grep -c '^- \[' INDEX` == 헤더 카운트 3자가 일치하는지 검증한다. 파일 추가/삭제 시 INDEX bullet 과 헤더 숫자를 같은 변경에 동기화.

**Self-check**: INDEX 의 각 카테고리 헤더 숫자 = 실제 파일 수 = bullet 수인가? 미러(.agents/)도 동일한가?

**Why**: PR #30 (plan024) — 99개 패턴을 라우터로 등록하며 2개를 bullet 에서 누락. 라우터 INDEX 를 갖는 모든 디렉터리화 task 에서 재발 가능. 파일은 있는데 라우터에 없으면 소비자가 그 패턴을 영영 못 본다.
