---
id: single-file-split-section-boundary-leak
category: plan
title: 단일 파일 분리 시 섹션 경계 유출
triggers: [split, 분리, file-per-item, 디렉터리화, 섹션 헤더]
tool_catchable: true
source: [PR30, plan024]
related: [router-index-count-mismatch, structure-migration-frontmatter-placeholder, path-migration-agents-missing]
---

**증상**: 단일 파일(섹션 N개)을 file-per-item 으로 split 할 때, split 키를 패턴 헤더로만 잡으면 각 카테고리의 **마지막 패턴 파일** 꼬리에 다음 섹션 헤더(+메타 내용)가 잘리지 않고 유출된다. plan024 에서 9개 파일에 구형 `# N. 섹션명` 이 유출(특히 한 파일은 섹션 2·3·4 전체).

**Good**: split 경계를 "패턴 헤더 ~ 다음 패턴/섹션 헤더 직전" 으로 명확히 잡는다. 섹션 메타(소진 체크리스트·누적 규칙)는 패턴 파일이 아니라 INDEX 로 흡수한다. split 직후 `grep -rn '^# [0-9]\+\.\|^## 섹션 [0-9]' <분리 디렉터리>` 로 유출 0건 확인.

**Self-check**: 분리된 각 파일의 마지막 줄이 자기 패턴 본문(Why/Self-check)으로 자연 종료되는가? 다음 섹션 헤더가 꼬리에 남지 않았는가?

**Why**: PR #30 (plan024) code-reviewer HIGH — phase-02 무손실 검증이 "패턴 수 일치" 만 봐서 경계 오류(인접 섹션이 한 파일에 병합)를 놓쳤다. 무손실(수 일치)과 경계 정합(유출 0)은 별개 검증이다. 단일 파일을 디렉터리로 쪼개는 모든 task 에서 재발 가능.
