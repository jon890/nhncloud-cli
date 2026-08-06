# Phase 01 — 근거 기반 전수 분류

**Execution profile**: standard
**Status**: pending

---

## 목표

`docs/pitfalls/`의 패턴 파일을 활성 규칙·자동 검사·현재 코드와 대조해 유지·수정·삭제 후보로 빠짐없이 분류한다.

**범위 외**: 이 phase에서는 패턴 파일이나 규칙을 수정·삭제하지 않는다. 분류 근거를 영구 문서로 추가하지 않는다.

---

## 실행 전제

```bash
# cwd: <repo root>
# branch: refactor/046-refactor-pitfalls-prune
set -e
test "$(git branch --show-current)" = "refactor/046-refactor-pitfalls-prune"
git fetch origin
git merge-base --is-ancestor origin/main HEAD
git cat-file -e origin/main:docs/pitfalls/INDEX.md
test "$(git ls-tree -r --name-only origin/main docs/pitfalls | grep -c '\.md$')" = "112"
! git cat-file -e origin/main:.agents/skills/_shared/pitfalls/INDEX.md 2>/dev/null
test -d docs/pitfalls
test ! -e .agents/skills/_shared/pitfalls
test "$(find docs/pitfalls/plan docs/pitfalls/team docs/pitfalls/code-review -type f -name '*.md' | wc -l | tr -d ' ')" = "111"
```

`045-refactor-pitfalls-docs-move`가 `main`에 병합되지 않았거나 현재 브랜치가 최신 `main`을 포함하지 않으면 `PHASE_BLOCKED: 045 병합 후 branch rebase 필요`를 보고한다.

---

## 분류 계약

각 파일은 다음 중 하나로 분류하고 근거 경로·검출 명령·현재 코드 심볼 중 하나 이상을 연결한다.

- `retain`: 현재도 유효하고 활성 규칙이나 자동 검사만으로 대체되지 않는 고유한 실패 원인·탐지법·수정법이 있다.
- `edit`: 일부만 중복되거나 오래됐지만 고유한 핵심이 남아 있다. 낡은 부분만 제거하거나 현재 표면으로 고친다.
- `delete-rule`: 활성 `AGENTS.md`, 오버레이, 에이전트 또는 스킬이 내용을 완전히 소유하고 패턴 파일에 고유한 근거·탐지법·출처가 없다.
- `delete-automation`: 타입 검사·테스트·정적 검사·grep이 실패를 완전히 차단하며 패턴 파일에 자동화의 사각지대를 보완하는 내용이 없다.
- `delete-stale`: 설명한 명령·파일·심볼·흐름이 현재 저장소에서 제거됐고 일반화해 남길 고유한 교훈이 없다.

출처 PR 번호가 오래됐다는 이유만으로는 `delete-stale`로 분류하지 않는다.
삭제 수를 미리 정하지 않고 근거를 충족한 파일만 삭제한다.

---

## 작업 항목 (4)

### 1. 활성 규칙과 자동 검사 목록

`AGENTS.md`, `.claude/*.md`, `.claude/agents/`, `.codex/agents/`, `.agents/skills/*/SKILL.md`, `package.json`, 테스트 설정과 CI 명령에서 현재 강제되는 규칙과 자동 검사를 수집한다.

### 2. 현재 코드 표면 대조

각 패턴이 언급하는 경로·명령·심볼을 `rg --hidden --no-ignore`와 Commander 카탈로그로 확인한다.
존재하지 않는 표면은 대체 심볼이 있는지 확인한 뒤 `edit` 또는 `delete-stale` 근거를 기록한다.

### 3. 임시 분류표 작성

`.omx/pitfalls-audit.tsv`에 `relative_path`, `verdict`, `evidence`, `action` 네 열로 111개 파일을 기록한다.
경로는 중복 없이 정렬하고 빈 verdict·evidence·action을 허용하지 않는다.

### 4. phase 상태 갱신

`tasks/046-refactor-pitfalls-prune/index.json`에서 Phase 1을 `completed`, `current_phase`를 `2`로 갱신한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `.omx/pitfalls-audit.tsv` | 커밋하지 않는 111개 분류 근거 |
| `tasks/046-refactor-pitfalls-prune/index.json` | phase 상태 갱신 |

## 검증

```bash
# cwd: <repo root>
# branch: refactor/046-refactor-pitfalls-prune
set -e
test -f .omx/pitfalls-audit.tsv
test "$(tail -n +2 .omx/pitfalls-audit.tsv | cut -f1 | wc -l | tr -d ' ')" = "111"
test "$(tail -n +2 .omx/pitfalls-audit.tsv | cut -f1 | sort -u | wc -l | tr -d ' ')" = "111"
test "$(awk -F '\t' 'NR > 1 && (NF != 4 || $1 == "" || $2 == "" || $3 == "" || $4 == "") { count++ } END { print count + 0 }' .omx/pitfalls-audit.tsv)" = "0"
test "$(awk -F '\t' 'NR > 1 && $2 !~ /^(retain|edit|delete-rule|delete-automation|delete-stale)$/ { count++ } END { print count + 0 }' .omx/pitfalls-audit.tsv)" = "0"
git diff --check
```

## 의도 메모 (왜)

- 삭제 판단을 파일별 근거로 고정해 규칙과 비슷해 보인다는 인상만으로 지식이 사라지는 것을 막는다.
- 분류표는 실행 증거이며 장기 지식이 아니므로 `.omx/`에 두고 최종 phase에서 제거한다.
