---
id: structure-migration-frontmatter-placeholder
category: plan
title: 구조 변환 시 frontmatter 필드 placeholder 방치
triggers: [frontmatter, 분리, 구조 변환, metadata, source]
tool_catchable: true
source: [PR30, plan024]
related: [single-file-split-section-boundary-leak, router-index-count-mismatch]
---

**증상**: 단일 파일을 frontmatter 가진 파일-per-항목으로 분리할 때, 새 필드를 `[field###]` 같은 literal placeholder 로 일괄 채우면 "필드는 있지만 의미 없음" 상태로 굳는다. plan024 에서 99파일 전부 `source: [plan###]`/`[PR###]` 로 채워져 placeholder/실제 출처 구분 불가(봇 🟡).

**Good**: 분리 시 본문에 이미 있는 정보(예: Why 의 `PR #N`)를 frontmatter 로 backfill 한다. 추출 불가하면 빈 값(`[]`)으로 두어 "미상" 임을 정직하게 표현한다. literal placeholder 를 실제값처럼 채우지 않는다.

**Self-check**: 새 frontmatter 필드가 전부 같은 placeholder 값인가? 그렇다면 본문에서 채울 수 있는데 안 채운 것이다. `grep -rh '^<field>:' <디렉터리> | sort | uniq -c` 로 분포 확인 — 단일 placeholder 값이 100% 면 backfill 누락.

**Why**: PR #30 (plan024) 봇 리뷰 🟡 — phase 지시에 "source 를 Why 에서 추출" 이 있었으나 executor 가 일괄 placeholder 로 채웠다. frontmatter 를 도입하는 분리 task 마다 재발 가능.
