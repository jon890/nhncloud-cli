# Phase 02 — 중복 제거와 낡은 지침 정리

**Execution profile**: standard
**Status**: pending

---

## 목표

분류 근거에 따라 완전 중복·완전 자동화·폐기된 표면만 삭제하고 부분 중복 문서는 고유한 핵심만 남긴다.

**범위 외**: 삭제 수를 맞추기 위한 정리, AGENTS.md 비대화, 새 추상화·의존성·영구 감사 보고서 추가는 하지 않는다.

`src/` 주석의 옛 문서 번호 참조(`code-review-pitfalls 2-2` 형태)는 이 plan 범위 밖이다. 발견해도 고치지 않고 보고만 한다.

---

## 실행 전제

```bash
# cwd: <repo root>
# branch: refactor/046-refactor-pitfalls-prune
# shell: bash 또는 zsh — POSIX sh 로 실행하지 않는다 (프로세스 치환과 탭 리터럴을 쓴다)
set -e
AUDIT=.omc/pitfalls-audit.tsv
test -f "$AUDIT"
test "$(tail -n +2 "$AUDIT" | wc -l | tr -d ' ')" = "111"
git diff --quiet -- docs/pitfalls
```

Phase 1 이후 패턴 파일이 먼저 바뀌었으면 `PHASE_BLOCKED: 분류 기준선 이후 선행 변경 확인 필요`를 보고한다.

---

## 작업 항목 (5)

### 1. 완전 대체 문서 삭제

`delete-rule`, `delete-automation`, `delete-stale`로 분류된 파일만 삭제한다.
각 삭제는 분류표의 evidence가 실제 활성 경로나 검출 명령을 가리키는지 다시 확인한다.

`delete-rule` evidence가 `.claude/agents/`·`.codex/agents/`·`.agents/skills/`를 가리키면 삭제하지 않고 보고한다. 이 임베드는 패턴 파일에서 파생된 사본이라 삭제 근거가 아니다.

### 2. 부분 중복·낡은 표현 수정

`edit` 파일은 분류표의 `edit_target`이 지목한 절만 고친다.
지목되지 않은 절은 바이트 단위로 그대로 둔다. 고유한 실패 원인·자동 검사의 사각지대·수정법은 보존한다.
`retain` 파일은 한 바이트도 바꾸지 않는다. 검증이 기준 커밋과 대조해 이를 강제한다.
`retain`·`edit` 모두 frontmatter 는 바꾸지 않는다. `triggers`가 잘리면 라우터 검색이 조용히 무력화된다.
제거된 명령·파일·심볼은 현재 표면으로 고치고 완전히 일반화할 수 없으면 해당 절만 삭제한다.

### 3. 라우터와 활성 소비자 정합성

`docs/pitfalls/INDEX.md`에서 삭제 파일 링크를 제거하고 카테고리별 헤더 개수를 실측값으로 갱신한다.
라우터 표와 카테고리 목록 양쪽에서 링크를 지워야 한다. 한쪽만 지우면 깨진 링크가 남는다.
삭제되거나 이름이 바뀐 slug를 직접 가리키는 `.claude/`, `.codex/`, `.agents/skills/` 소비자가 있으면 현재 유지 파일이나 INDEX 라우터로 고친다.

### 4. INDEX 라우터 위생과 디렉터리 잔재 정리 (045 인계)

- 라우터 표 제목의 진행 메모 `(큐레이션 — phase-02 분리 완료 후 slug 채움)`을 제거한다. 이미 끝난 작업을 가리켜 소비자가 미완성으로 오해한다.
- 라우터 표 마지막 행 다음에 빈 줄을 넣는다. 지금은 다음 본문이 표로 흡수될 수 있다.
- `plan/` 카테고리 목록의 `input-validation-policy-asymmetry`를 알파벳 순서(`import-identifier-collision` 다음)로 옮긴다.
- `docs/pitfalls/{plan,team,code-review}/.gitkeep` 3개를 제거한다. 각 디렉터리에 파일이 있어 목적이 사라졌다.

### 5. phase 상태 갱신

`tasks/046-refactor-pitfalls-prune/index.json`에서 Phase 2를 `completed`, `current_phase`를 `3`으로 갱신한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `docs/pitfalls/*/*.md` | 분류 근거에 따른 유지·수정·삭제 |
| `docs/pitfalls/INDEX.md` | 링크·실측 개수 갱신과 라우터 위생 |
| `docs/pitfalls/*/.gitkeep` | 불필요해진 잔재 제거 |
| `.claude/`, `.codex/`, `.agents/skills/` | 삭제 slug 직접 참조가 있을 때만 갱신 |
| `tasks/046-refactor-pitfalls-prune/index.json` | phase 상태 갱신 |

## 검증

```bash
# cwd: <repo root>
# branch: refactor/046-refactor-pitfalls-prune
# shell: bash 또는 zsh — POSIX sh 로 실행하지 않는다 (프로세스 치환과 탭 리터럴을 쓴다)
set -e
AUDIT=.omc/pitfalls-audit.tsv
BASE="$(git merge-base origin/main HEAD)"

index_bullets() {
  awk '
    /^### \[(plan|team|code-review)\// { inside=1; next }
    inside && /^## / { inside=0 }
    inside && match($0, /^- \[[^]]+\]\((plan|team|code-review)\/[^)]+\.md\)/) {
      s=substr($0, RSTART, RLENGTH); sub(/^.*\(/, "", s); sub(/\)$/, "", s); print s
    }
  ' docs/pitfalls/INDEX.md
}

# 1. 삭제 감사 — 기준 커밋을 명시해야 git rm 과 phase 커밋 이후에도 삭제가 보인다
deleted="$(git diff --name-only --diff-filter=D "$BASE" -- 'docs/pitfalls/*/*.md' | sort)"
del_cnt="$(printf '%s\n' "$deleted" | grep -c . || true)"
tsv_cnt="$(awk -F '\t' 'NR>1 && $2 ~ /^delete-/ {c++} END{print c+0}' "$AUDIT")"

bad=0
for file in $deleted; do
  relative="${file#docs/pitfalls/}"
  awk -F '\t' -v p="$relative" '$1==p && $2 ~ /^delete-/ {f=1} END{exit !f}' "$AUDIT" \
    || { echo "NO EVIDENCE: $relative"; bad=1; }
done
test "$bad" = "0"

# 2. delete-* 판정한 것은 전부 지웠다 — 수 일치로 공허한 통과를 막는다
test "$del_cnt" = "$tsv_cnt"

# 3. delete-rule 근거가 파생 사본을 가리킨 채 삭제된 파일이 없다
test "$(awk -F '\t' 'NR>1 && $2=="delete-rule" && $3 ~ /(\.claude\/agents|\.codex\/agents|\.agents\/skills)/ {c++} END{print c+0}' "$AUDIT")" = "0"

# 4. edit 파일은 edit_target 이 지목한 절 외에는 바뀌지 않았다
bad=0
while IFS=$'\t' read -r p v _ _ target; do
  [ "$v" = "edit" ] || continue
  f="docs/pitfalls/$p"
  test -f "$f" || { echo "EDIT TARGET MISSING: $p"; bad=1; continue; }
  git diff --quiet "$BASE" -- "$f" && { echo "EDIT NOT APPLIED: $p"; bad=1; }
done < <(tail -n +2 "$AUDIT")
test "$bad" = "0"

# 4-1. retain 파일은 기준 커밋과 바이트 단위로 같다 — 수정 축의 내용 보존을 강제한다
bad=0
while IFS=$'\t' read -r p v _ _ _; do
  [ "$v" = "retain" ] || continue
  f="docs/pitfalls/$p"
  test -f "$f" || { echo "RETAIN FILE MISSING: $p"; bad=1; continue; }
  git show "$BASE:$f" | cmp -s - "$f" || { echo "RETAIN MODIFIED: $p"; bad=1; }
done < <(tail -n +2 "$AUDIT")
test "$bad" = "0"

# 4-2. retain·edit 모두 frontmatter 는 불변이다
# edit_target 은 본문 절만 지목하므로 frontmatter 변경은 계약 위반이다.
# triggers 가 잘리면 라우터 grep 이 조용히 무력화된다.
fm() { awk 'NR==1 && $0=="---"{p=1;print;next} p{print; if($0=="---"){exit}}'; }
bad=0
while IFS=$'\t' read -r p v _ _ _; do
  case "$v" in retain|edit) ;; *) continue ;; esac
  f="docs/pitfalls/$p"
  test -f "$f" || continue
  diff -q <(fm < "$f") <(git show "$BASE:$f" | fm) >/dev/null \
    || { echo "FRONTMATTER CHANGED: $p"; bad=1; }
done < <(tail -n +2 "$AUDIT")
test "$bad" = "0"

# 5. 헤더 숫자 = bullet 수 = 실제 파일 수 (실측값 기준 3자 일치)
bad=0
for d in plan team code-review; do
  actual="$(find docs/pitfalls/$d -type f -name '*.md' | wc -l | tr -d ' ')"
  bullets="$(index_bullets | grep -c "^$d/" || true)"
  hdr="$(rg -o "^### \[$d/\]\($d/\) \(([0-9]+)\)" -r '$1' docs/pitfalls/INDEX.md || echo missing)"
  [ "$actual" = "$bullets" ] && [ "$actual" = "$hdr" ] \
    || { echo "MISMATCH $d: file=$actual bullet=$bullets header=$hdr"; bad=1; }
done
test "$bad" = "0"

# 6. bullet 집합 = 실제 파일 집합
diff -u <(index_bullets | sort) \
        <(cd docs/pitfalls && find plan team code-review -type f -name '*.md' | sort)

# 7. INDEX 의 모든 링크가 실재 파일을 가리킨다 — 라우터 표에만 남은 깨진 링크 차단
bad=0
for l in $(rg -o '\]\(((plan|team|code-review)/[^)]+\.md)\)' -r '$1' docs/pitfalls/INDEX.md | sort -u); do
  test -f "docs/pitfalls/$l" || { echo "BROKEN LINK: $l"; bad=1; }
done
test "$bad" = "0"

# 8. 045 인계 4건
test "$(rg -c -F 'phase-02 분리 완료 후 slug 채움' docs/pitfalls/INDEX.md || echo 0)" = "0"
awk 'prev ~ /^\|/ && $0 !~ /^\|/ && $0 != "" { print "TABLE NOT CLOSED at line " NR; bad=1 } { prev=$0 } END { exit bad+0 }' docs/pitfalls/INDEX.md
for d in plan team code-review; do
  diff <(index_bullets | grep "^$d/") <(index_bullets | grep "^$d/" | LC_ALL=C sort) \
    || { echo "ORDER NOT ALPHABETICAL: $d"; exit 1; }
done
test "$(find docs/pitfalls -name '.gitkeep' | wc -l | tr -d ' ')" = "0"

# 9. 선지정 edit 두 축이 실제로 반영됐다
test "$(rg -c -F '미러(.agents/)' docs/pitfalls/plan/router-index-count-mismatch.md || echo 0)" = "0"
rg -q '카테고리 섹션|index_bullets' docs/pitfalls/plan/router-index-count-mismatch.md

# 10. 무관 파일이 끼지 않았다
test "$(git status --porcelain | grep -c '^??')" = "0"
git diff --check
```

## 의도 메모 (왜)

- 기존 규칙에 내용을 다시 복사해서 문서를 지우면 단일 원본 문제가 옮겨갈 뿐이므로 현재 활성 규칙이 이미 완전히 소유한 경우에만 삭제한다.
- 자동 검사가 실패를 막아도 원인 해석이나 사각지대가 남아 있으면 패턴 문서를 유지한다.
- 삭제 감사에 기준 커밋을 명시하는 이유는 기준 없는 `git diff`가 작업 트리와 인덱스를 비교하기 때문이다. `git rm`을 쓰면 삭제가 인덱스에 이미 반영돼 결과가 빈 목록이 되고, 근거 없는 삭제가 전부 통과한다.
- 삭제 수와 분류표의 `delete-*` 수를 함께 대조하는 이유는 한 방향만 보면 "아무것도 지우지 않아도 통과" 하기 때문이다.
- 링크 검사를 두 축으로 두는 이유는 카테고리 목록만 보면 라우터 표에 남은 깨진 링크를 놓치고, 전체 링크만 보면 라우터 표가 개수를 오염시키기 때문이다.
