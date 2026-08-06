# Phase 01 — 근거 기반 전수 분류

**Execution profile**: standard
**Status**: completed

---

## 목표

`docs/pitfalls/`의 패턴 파일을 활성 규칙·자동 검사·현재 코드와 대조해 유지·수정·삭제 후보로 빠짐없이 분류한다.

**범위 외**: 이 phase에서는 패턴 파일이나 규칙을 수정·삭제하지 않는다. 분류 근거를 영구 문서로 추가하지 않는다.

---

## 실행 전제

```bash
# cwd: <repo root>
# branch: refactor/046-refactor-pitfalls-prune
# shell: bash 또는 zsh — POSIX sh 로 실행하지 않는다 (프로세스 치환과 탭 리터럴을 쓴다)
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
mkdir -p .omc
```

`045-refactor-pitfalls-docs-move`가 `main`에 병합되지 않았거나 현재 브랜치가 최신 `main`을 포함하지 않으면 `PHASE_BLOCKED: 045 병합 후 branch rebase 필요`를 보고한다.

---

## 분류 계약

각 파일은 다음 중 하나로 분류하고 근거 경로·검출 명령·현재 코드 심볼 중 하나 이상을 연결한다.

- `retain`: 현재도 유효하고 활성 규칙이나 자동 검사만으로 대체되지 않는 고유한 실패 원인·탐지법·수정법이 있다.
- `edit`: 일부만 중복되거나 오래됐지만 고유한 핵심이 남아 있다. 낡은 부분만 제거하거나 현재 표면으로 고친다.
- `delete-rule`: 활성 `AGENTS.md`, ADR, 오버레이가 **1차 규범 소스**로 내용을 완전히 소유하고 패턴 파일에 고유한 근거·탐지법·출처가 없다.
- `delete-automation`: 타입 검사·테스트·정적 검사·grep이 실패를 완전히 차단하며 패턴 파일에 자동화의 사각지대를 보완하는 내용이 없다.
- `delete-stale`: 설명한 명령·파일·심볼·흐름이 현재 저장소에서 제거됐고 일반화해 남길 고유한 교훈이 없다.

### 에이전트·스킬 임베드는 삭제 근거가 아니다

`.claude/agents/`, `.codex/agents/`, `.agents/skills/`의 본문이 패턴 내용을 담고 있어도 `delete-rule` 근거로 쓰지 않는다.
이 임베드는 패턴 파일에서 파생된 사본이다.
`docs/code-architecture.md`와 `AGENTS.md`가 `docs/pitfalls/`를 단일 원본으로 규정하고, `_shared/retros/*-retro.md`가 새 회고를 이 디렉터리에 누적하라고 지시하기 때문이다.

실측하면 `.claude/agents/nhncloud-cli-executor.md`가 `exitcode-missing`, `path-traversal-filename`, `empty-result-stderr-wrong`, `external-string-unsanitized`, `adjacent-command-pattern-missing` 다섯 slug를 증상·검출 명령까지 임베드한다.
`path-traversal-filename`은 그 본문이 "PR #40 → PR #72 동일 버그 반복"이라 적은 보안 패턴이다.
파생 사본을 소유자로 인정하면 재발 빈도가 가장 높은 패턴이 정당하게 삭제된다.

### evidence 형식

`delete-*` 판정의 evidence는 다음 형식만 허용한다.

- `delete-rule`: `<규범 파일>:<줄번호>` 형태. `AGENTS.md`, `docs/adr/*.md`, `.claude/*-overlay.md`만 규범 파일로 인정한다.
- `delete-automation`: 실행한 검사 명령 원문과 실패 재현 결과. 검사 이름만 적는 것은 근거가 아니다.
- `delete-stale`: 사라진 심볼·경로를 확인한 `rg` 명령 원문과 0건 결과.

`retain`·`edit`은 근거 경로 1개 이상으로 충분하다.

frontmatter 의 `tool_catchable: true` 는 `delete-automation` 근거가 아니다.
실측하면 이 값을 가진 파일은 `plan/structure-migration-frontmatter-placeholder.md`, `plan/router-index-count-mismatch.md`, `plan/single-file-split-section-boundary-leak.md` 3개다.
저장소의 어떤 테스트·lint 도 `docs/pitfalls/`를 읽지 않아 세 패턴을 잡는 자동 검사가 존재하지 않는다.
이 값은 `INDEX.md` 축적 규칙 3번과 모순되는 낡은 표식이며, 세 파일은 이 plan 이 의존하는 구조 패턴이다.

`delete-automation` 증명에 `pnpm` 래퍼를 쓰지 않는다.
이 worktree에서 `pnpm`은 esbuild 빌드 스크립트 승인을 요구해 항상 실패하므로, 그 실패를 "자동 검사가 막는다"로 오독할 수 있다.
`./node_modules/.bin/tsc --noEmit` 처럼 바이너리를 직접 호출한다.

출처 PR 번호가 오래됐다는 이유만으로는 `delete-stale`로 분류하지 않는다.
`source: []`는 출처 부재일 뿐 그 자체로 `delete-stale` 근거가 아니다. 이 경우에도 사라진 심볼·경로를 `rg` 0건으로 실증해야 한다. 실측으로 이런 파일이 21개다.
삭제 수를 미리 정하지 않고 근거를 충족한 파일만 삭제한다.

---

## 선지정 판정 (045 인계)

다음 파일은 045 실행에서 결함이 확정됐으므로 분류 판단 대상이 아니다. `edit`으로 고정한다.

- `plan/router-index-count-mismatch.md` — `edit`
    - `edit_target`: `Good:카테고리 섹션 bullet 만 세는 awk 명령;Self-check:.agents 미러 질문 제거`
    - 근거: 045의 `FIX_NEEDED`가 이 파일 때문에 발생했다. 이 파일의 `Good`이 `grep -c '^- \['`를 쓰는데, 세 카테고리 bullet을 합산해 111을 내므로 카테고리별 헤더 숫자와 대조할 수 없다. 045는 카테고리 섹션만 뽑는 방법으로 해결했고 그 방법이 이 파일에 없어 046 계획도 같은 함정에 다시 빠졌다.
    - `Self-check`의 "미러(`.agents/`)도 동일한가?" 는 045 이동으로 `.agents/skills/_shared/pitfalls/`가 제거돼 해석 불가가 됐다.

---

## 작업 항목 (4)

### 1. 활성 규칙과 자동 검사 목록

`AGENTS.md`, `.claude/*.md`, `.claude/agents/`, `.codex/agents/`, `.agents/skills/*/SKILL.md`, `package.json`, 테스트 설정과 CI 명령에서 현재 강제되는 규칙과 자동 검사를 수집한다.
수집한 목록에서 규범 소스와 파생 사본을 구분해 적는다. 위 "에이전트·스킬 임베드는 삭제 근거가 아니다"의 판단 기준이 된다.

### 2. 현재 코드 표면 대조

각 패턴이 언급하는 경로·명령·심볼을 `rg --hidden --no-ignore`와 Commander 카탈로그로 확인한다.
존재하지 않는 표면은 대체 심볼이 있는지 확인한 뒤 `edit` 또는 `delete-stale` 근거를 기록한다.

### 3. 임시 분류표 작성

`.omc/pitfalls-audit.tsv`에 `relative_path`, `verdict`, `evidence`, `action`, `edit_target` 다섯 열로 111개 파일을 기록한다.
첫 행은 이 다섯 열 이름을 담은 헤더다. 경로는 중복 없이 정렬하고 빈 값을 허용하지 않는다.

`edit_target`은 `edit` 판정에만 채우고 그 외에는 `-`로 둔다.
삭제할 절의 볼드 헤딩 이름(`증상`·`Good`·`검출`·`Self-check`·`Why` 중 하나)과 대체할 현재 표면 심볼을 `절:대체심볼` 형태로 적고, 여러 개면 `;`로 잇는다.
Phase 2는 여기 지목된 절 외에는 손대지 않는다.

분류표를 `.omc/`에 두는 이유는 이 디렉터리가 `.gitignore` 대상이라 실행 증거가 커밋에 딸려 들어가지 않기 때문이다.

### 4. phase 상태 갱신

`tasks/046-refactor-pitfalls-prune/index.json`에서 Phase 1을 `completed`, `current_phase`를 `2`로 갱신한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `.omc/pitfalls-audit.tsv` | 커밋하지 않는 111개 분류 근거 |
| `tasks/046-refactor-pitfalls-prune/index.json` | phase 상태 갱신 |

## 검증

```bash
# cwd: <repo root>
# branch: refactor/046-refactor-pitfalls-prune
# shell: bash 또는 zsh — POSIX sh 로 실행하지 않는다 (프로세스 치환과 탭 리터럴을 쓴다)
set -e
AUDIT=.omc/pitfalls-audit.tsv
test -f "$AUDIT"

# 1. 헤더와 행 수
test "$(head -1 "$AUDIT")" = "$(printf 'relative_path\tverdict\tevidence\taction\tedit_target')"
test "$(tail -n +2 "$AUDIT" | cut -f1 | wc -l | tr -d ' ')" = "111"
test "$(tail -n +2 "$AUDIT" | cut -f1 | sort -u | wc -l | tr -d ' ')" = "111"

# 2. 다섯 열이 모두 채워졌는지
test "$(awk -F '\t' 'NR>1 && (NF!=5 || $1=="" || $2=="" || $3=="" || $4=="" || $5=="") {c++} END{print c+0}' "$AUDIT")" = "0"
test "$(awk -F '\t' 'NR>1 && $2 !~ /^(retain|edit|delete-rule|delete-automation|delete-stale)$/ {c++} END{print c+0}' "$AUDIT")" = "0"

# 3. 분류표 경로가 실제 파일과 일대일 대응하는지
diff -u <(tail -n +2 "$AUDIT" | cut -f1 | sort) \
        <(cd docs/pitfalls && find plan team code-review -type f -name '*.md' | sort)

# 4. delete-* evidence 형식 — 파일:줄 또는 명령 원문이어야 한다
test "$(awk -F '\t' 'NR>1 && $2 ~ /^delete-/ && $3 !~ /(:[0-9]+|rg |grep |tsc|vitest)/ {c++} END{print c+0}' "$AUDIT")" = "0"

# 5. delete-rule 은 규범 파일만 근거로 삼는다 — 에이전트·스킬 임베드 금지
test "$(awk -F '\t' 'NR>1 && $2=="delete-rule" && $3 !~ /(AGENTS\.md|docs\/adr\/|-overlay\.md)/ {c++} END{print c+0}' "$AUDIT")" = "0"
test "$(awk -F '\t' 'NR>1 && $2=="delete-rule" && $3 ~ /(\.claude\/agents|\.codex\/agents|\.agents\/skills)/ {c++} END{print c+0}' "$AUDIT")" = "0"
# 같은 근거 줄을 3개 이상 파일에 재사용하는 느슨한 정당화를 막는다
test "$(awk -F '\t' 'NR>1 && $2=="delete-rule" {c[$3]++} END{for(k in c) if(c[k]>2) n++; print n+0}' "$AUDIT")" = "0"
# tool_catchable 필드를 delete-automation 근거로 쓰지 않는다
test "$(awk -F '\t' 'NR>1 && $2=="delete-automation" && $3 ~ /tool_catchable/ {c++} END{print c+0}' "$AUDIT")" = "0"

# 6. 에이전트가 임베드한 slug 는 삭제 대상이 아니다
bad=0
for s in exitcode-missing path-traversal-filename empty-result-stderr-wrong external-string-unsanitized adjacent-command-pattern-missing; do
  test -f "docs/pitfalls/code-review/$s.md" || continue
  if awk -F '\t' -v p="code-review/$s.md" '$1==p && $2 ~ /^delete-/ {found=1} END{exit !found}' "$AUDIT"; then
    echo "EMBEDDED SLUG MARKED FOR DELETION: $s"; bad=1
  fi
done
test "$bad" = "0"

# 7. edit_target 계약
test "$(awk -F '\t' 'NR>1 && $2=="edit" && $5 !~ /(증상|Good|검출|Self-check|Why)/ {c++} END{print c+0}' "$AUDIT")" = "0"
test "$(awk -F '\t' 'NR>1 && $2!="edit" && $5!="-" {c++} END{print c+0}' "$AUDIT")" = "0"

# 8. 선지정 판정 반영
test "$(awk -F '\t' '$1=="plan/router-index-count-mismatch.md" {print $2}' "$AUDIT")" = "edit"

# 9. 이 phase 는 패턴 파일을 바꾸지 않는다
git diff --quiet -- docs/pitfalls
test "$(git status --porcelain | grep -c '^??')" = "0"
git diff --check
```

## 의도 메모 (왜)

- 삭제 판단을 파일별 근거로 고정해 규칙과 비슷해 보인다는 인상만으로 지식이 사라지는 것을 막는다.
- evidence 에 형식을 강제하는 이유는 "비어 있지 않다"만 검사하면 한 단어로도 111행 전부 통과해 근거 강제가 이름만 남기 때문이다.
- 분류표는 실행 증거이며 장기 지식이 아니므로 `.omc/`에 두고 최종 phase에서 제거한다. 삭제 근거의 영구 보존 위치는 Phase 4가 만드는 커밋 메시지다.
- `edit_target`을 별도 열로 두는 이유는 phase가 서로 다른 executor 컨텍스트에서 실행되기 때문이다. Phase 1이 읽어서 판단한 내용이 전달되지 않으면 Phase 2가 재판정하거나 짐작해 편집한다.
