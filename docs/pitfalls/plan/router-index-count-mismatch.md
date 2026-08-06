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

**Good**: 카테고리마다 파일 수, bullet 수, 헤더 숫자 3자가 일치하는지 검증한다. 파일 추가·삭제 시 INDEX bullet 과 헤더 숫자를 같은 변경에 동기화한다.

bullet 은 **카테고리 섹션 안의 것만** 세야 한다. `grep -c '^- \['` 는 라우터 표와 다른 목록까지 합산해 세 카테고리 합계를 내므로 카테고리별 대조에 쓸 수 없다. 카테고리 섹션 헤더와 다음 `## ` 사이만 훑는다.

```bash
index_bullets() {
  awk '
    /^### \[(plan|team|code-review)\// { inside=1; next }
    inside && /^## / { inside=0 }
    inside && match($0, /^- \[[^]]+\]\((plan|team|code-review)\/[^)]+\.md\)/) {
      s=substr($0, RSTART, RLENGTH); sub(/^.*\(/, "", s); sub(/\)$/, "", s); print s
    }
  ' docs/pitfalls/INDEX.md
}

for d in plan team code-review; do
  echo "$d file=$(find docs/pitfalls/$d -type f -name '*.md' | wc -l | tr -d ' ') bullet=$(index_bullets | grep -c "^$d/")"
done
```

**Self-check**: INDEX 의 각 카테고리 헤더 숫자, 실제 파일 수, 그 카테고리 섹션의 bullet 수가 모두 같은가? 라우터 표에만 남은 링크가 실재 파일을 가리키는가?

**Why**: PR #30 (plan024) — 99개 패턴을 라우터로 등록하며 2개를 bullet 에서 누락. 라우터 INDEX 를 갖는 모든 디렉터리화 task 에서 재발 가능. 파일은 있는데 라우터에 없으면 소비자가 그 패턴을 영영 못 본다.
