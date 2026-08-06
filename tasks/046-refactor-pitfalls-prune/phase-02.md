# Phase 02 — 중복 제거와 낡은 지침 정리

**Execution profile**: standard
**Status**: pending

---

## 목표

분류 근거에 따라 완전 중복·완전 자동화·폐기된 표면만 삭제하고 부분 중복 문서는 고유한 핵심만 남긴다.

**범위 외**: 삭제 수를 맞추기 위한 정리, AGENTS.md 비대화, 새 추상화·의존성·영구 감사 보고서 추가는 하지 않는다.

---

## 실행 전제

```bash
# cwd: <repo root>
# branch: refactor/046-refactor-pitfalls-prune
set -e
test -f .omx/pitfalls-audit.tsv
test "$(tail -n +2 .omx/pitfalls-audit.tsv | wc -l | tr -d ' ')" = "111"
git diff --quiet -- docs/pitfalls
```

Phase 1 이후 패턴 파일이 먼저 바뀌었으면 `PHASE_BLOCKED: 분류 기준선 이후 선행 변경 확인 필요`를 보고한다.

---

## 작업 항목 (4)

### 1. 완전 대체 문서 삭제

`delete-rule`, `delete-automation`, `delete-stale`로 분류된 파일만 삭제한다.
각 삭제는 분류표의 evidence가 실제 활성 경로나 검출 명령을 가리키는지 다시 확인한다.

### 2. 부분 중복·낡은 표현 수정

`edit` 파일은 고유한 실패 원인·자동 검사의 사각지대·수정법을 보존한다.
제거된 명령·파일·심볼은 현재 표면으로 고치고 완전히 일반화할 수 없으면 해당 절만 삭제한다.

### 3. 라우터와 활성 소비자 정합성

`docs/pitfalls/INDEX.md`에서 삭제 파일 링크를 제거하고 카테고리별 실측 개수를 갱신한다.
삭제되거나 이름이 바뀐 slug를 직접 가리키는 `.claude/`, `.codex/`, `.agents/skills/` 소비자가 있으면 현재 유지 파일이나 INDEX 라우터로 고친다.

### 4. phase 상태 갱신

`tasks/046-refactor-pitfalls-prune/index.json`에서 Phase 2를 `completed`, `current_phase`를 `3`으로 갱신한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `docs/pitfalls/*/*.md` | 분류 근거에 따른 유지·수정·삭제 |
| `docs/pitfalls/INDEX.md` | 링크와 실측 개수 갱신 |
| `.claude/`, `.codex/`, `.agents/skills/` | 삭제 slug 직접 참조가 있을 때만 갱신 |
| `tasks/046-refactor-pitfalls-prune/index.json` | phase 상태 갱신 |

## 검증

```bash
# cwd: <repo root>
# branch: refactor/046-refactor-pitfalls-prune
set -e
for file in $(git diff --name-only --diff-filter=D -- 'docs/pitfalls/*/*.md'); do relative="${file#docs/pitfalls/}"; awk -F '\t' -v path="$relative" '$1 == path && $2 ~ /^delete-/ { found=1 } END { exit !found }' .omx/pitfalls-audit.tsv; done
test "$(git diff --name-only --diff-filter=D -- 'docs/pitfalls/*/*.md' | sort | uniq -d | wc -l | tr -d ' ')" = "0"
test "$(rg --hidden --no-ignore -n '\]\((plan|team|code-review)/[^)]+\.md\)' docs/pitfalls/INDEX.md | wc -l | tr -d ' ')" = "$(find docs/pitfalls/plan docs/pitfalls/team docs/pitfalls/code-review -type f -name '*.md' | wc -l | tr -d ' ')"
git diff --check
```

## 의도 메모 (왜)

- 기존 규칙에 내용을 다시 복사해서 문서를 지우면 단일 원본 문제가 옮겨갈 뿐이므로 현재 활성 규칙이 이미 완전히 소유한 경우에만 삭제한다.
- 자동 검사가 실패를 막아도 원인 해석이나 사각지대가 남아 있으면 패턴 문서를 유지한다.
