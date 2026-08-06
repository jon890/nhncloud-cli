# Phase 01 — 내용 보존 디렉터리 이동

**Execution profile**: standard
**Status**: completed

---

## 목표

`.agents/skills/_shared/pitfalls/`의 Markdown 112개를 `docs/pitfalls/`로 이동하고 경로를 제외한 내용을 그대로 보존한다.

**범위 외**: 문서의 의미 수정·삭제·중복 정리는 `046-refactor-pitfalls-prune`이 담당한다. 이 phase에서는 `INDEX.md`의 경로와 개수도 바꾸지 않는다.

---

## 실행 전제

```bash
# cwd: <repo root>
# branch: refactor/045-refactor-pitfalls-docs-move
set -e
test "$(git branch --show-current)" = "refactor/045-refactor-pitfalls-docs-move"
test -d .agents/skills/_shared/pitfalls
test ! -e docs/pitfalls
test "$(find .agents/skills/_shared/pitfalls -type f -name '*.md' | wc -l | tr -d ' ')" = "112"
test "$(find .agents/skills/_shared/pitfalls -type f -name '*.md' -print0 | xargs -0 wc -l | tail -1 | awk '{print $1}')" = "2752"
# 내용 대조 기준 커밋 유효성 — phase 커밋으로 이동하는 HEAD 대신 origin/main 을 고정 기준으로 쓴다
git fetch origin
git merge-base --is-ancestor origin/main HEAD
git cat-file -e "$(git rev-parse origin/main):.agents/skills/_shared/pitfalls/INDEX.md"
```

전제와 측정값이 다르면 `PHASE_BLOCKED: 원본 회피 패턴 기준선 변경 확인 필요`를 보고한다.
`origin/main`에 이전 경로가 없으면 `PHASE_BLOCKED: 내용 대조 기준 커밋 확인 필요`를 보고한다.

---

## 작업 항목 (3)

### 1. 디렉터리 이동

`git mv .agents/skills/_shared/pitfalls docs/pitfalls`로 디렉터리를 이동한다.
파일을 다시 생성하거나 내용을 정규화하지 않는다.

### 2. 패턴 파일 내용 대조

`INDEX.md`를 제외한 111개 파일마다 현재 `docs/pitfalls/<relative>`와 `origin/main:.agents/skills/_shared/pitfalls/<relative>`를 바이트 단위로 대조한다.
`plan`, `team`, `code-review` 카테고리와 파일명은 유지한다.

기준 커밋은 `HEAD`가 아니라 `origin/main`이다. team-lead가 phase 단위로 커밋하므로 Phase 1 커밋 직후 `HEAD` 트리에는 이전 경로가 없어져 `HEAD` 기준 대조는 이후 phase에서 전부 실패한다.

### 3. phase 상태 갱신

`tasks/045-refactor-pitfalls-docs-move/index.json`에서 Phase 1을 `completed`, `current_phase`를 `2`로 갱신한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `.agents/skills/_shared/pitfalls/` | 디렉터리 이동으로 제거 |
| `docs/pitfalls/` | 동일 내용으로 이동 |
| `tasks/045-refactor-pitfalls-docs-move/index.json` | phase 상태 갱신 |

## 검증

```bash
# cwd: <repo root>
# branch: refactor/045-refactor-pitfalls-docs-move
set -e
test ! -e .agents/skills/_shared/pitfalls
test "$(find docs/pitfalls -type f -name '*.md' | wc -l | tr -d ' ')" = "112"
test "$(find docs/pitfalls/plan -type f -name '*.md' | wc -l | tr -d ' ')" = "43"
test "$(find docs/pitfalls/team -type f -name '*.md' | wc -l | tr -d ' ')" = "10"
test "$(find docs/pitfalls/code-review -type f -name '*.md' | wc -l | tr -d ' ')" = "58"
BASE="$(git rev-parse origin/main)"
for file in $(find docs/pitfalls -type f -name '*.md' ! -name INDEX.md | sort); do relative="${file#docs/pitfalls/}"; git show "$BASE:.agents/skills/_shared/pitfalls/$relative" | cmp - "$file"; done
git diff --cached --check
git diff --check
```

`git mv`는 변경을 index에 올리므로 unstaged diff가 비어 `git diff --check`만으로는 아무것도 검사하지 못한다. `--cached`를 함께 실행한다.

## 의도 메모 (왜)

- 의미 정리와 위치 이동을 다른 PR로 나눠 검토자가 내용 손실 여부를 독립적으로 확인할 수 있게 한다.
- 112개와 2,752줄은 계획 시점에 `find`와 `wc -l`로 측정한 기준선이다.
