# Phase 03 — 정리 결과와 회귀 검증

**Execution profile**: fast
**Status**: pending

---

## 목표

정리 후 남은 패턴이 현재 저장소와 일치하고 INDEX·frontmatter·활성 소비 경로가 모두 통과하는지 확인한다.

**범위 외**: 사용자 명령과 npm 패키지 표면이 바뀌지 않으므로 `README.md`와 공개 `skills/nhncloud-cli/`를 수정하지 않는다.

---

## 작업 항목 (4)

### 1. 삭제 근거와 잔존 문서 검사

삭제된 파일이 모두 분류표의 `delete-*` 판정인지, 그리고 `delete-*` 판정이 모두 실제로 삭제됐는지 양방향으로 확인한다.
기준 커밋은 `git merge-base origin/main HEAD`다. 기준을 생략하면 `git rm`과 phase 커밋 이후에 삭제가 보이지 않는다.

### 2. INDEX와 frontmatter 검사

카테고리 목록 집합과 실제 파일 집합을 대조하고, 헤더 숫자·목록 항목 수·실제 파일 수 세 값이 일치하는지 본다.
INDEX 의 모든 링크가 실재 파일을 가리키는지 라우터 표까지 포함해 확인한다.
남은 파일의 `id`가 파일명, `category`가 상위 디렉터리와 같은지 검사한다.

### 3. 활성 소비 경로와 공개 정보 검사

이전 경로 잔존과 공개 저장소 정보 보호 검사를 실행한다.
`package.json`의 npm `files`가 문서 정리로 바뀌지 않았는지 확인한다.

저장소 회귀 검증(`tsc`·`test`·`build`)은 실행하지 않는다.
이 plan은 `docs/**`와 `tasks/**`의 Markdown·JSON만 바꾸고, `package.json`의 `files`(`dist`·`skills`·`README.md`)에 `docs/`가 없으며 `src/`가 pitfalls 파일을 읽지 않아 세 명령이 이 변경에 대해 신호를 만들지 못한다.
이 worktree에서 `pnpm` 래퍼는 esbuild 빌드 스크립트 승인을 요구해 항상 exit 1 이고 부작용으로 미추적 `pnpm-workspace.yaml`을 만든다. 045 실행에서 실측했다.
어떤 이유로 타입 검사를 남긴다면 `pnpm`이 아니라 `./node_modules/.bin/tsc --noEmit`으로 호출한다.

### 4. phase 상태 갱신

`tasks/046-refactor-pitfalls-prune/index.json`에서 Phase 3을 `completed`, `current_phase`를 `4`로 갱신한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `docs/pitfalls/INDEX.md` | 링크·개수 무결성 검증 |
| `docs/pitfalls/*/*.md` | frontmatter·현재성 검증 |
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

# 1. 삭제 감사 양방향
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
test "$del_cnt" = "$tsv_cnt"

# 1-1. retain 파일은 기준 커밋과 바이트 단위로 같다 — 수정 축의 내용 보존
bad=0
while IFS=$'\t' read -r p v _ _ _; do
  [ "$v" = "retain" ] || continue
  f="docs/pitfalls/$p"
  test -f "$f" || { echo "RETAIN FILE MISSING: $p"; bad=1; continue; }
  git show "$BASE:$f" | cmp -s - "$f" || { echo "RETAIN MODIFIED: $p"; bad=1; }
done < <(tail -n +2 "$AUDIT")
test "$bad" = "0"

# 1-2. retain·edit 모두 frontmatter 불변
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

# 2. 헤더 = bullet = 파일 3자 일치
bad=0
for d in plan team code-review; do
  actual="$(find docs/pitfalls/$d -type f -name '*.md' | wc -l | tr -d ' ')"
  bullets="$(index_bullets | grep -c "^$d/" || true)"
  hdr="$(rg -o "^### \[$d/\]\($d/\) \(([0-9]+)\)" -r '$1' docs/pitfalls/INDEX.md || echo missing)"
  [ "$actual" = "$bullets" ] && [ "$actual" = "$hdr" ] \
    || { echo "MISMATCH $d: file=$actual bullet=$bullets header=$hdr"; bad=1; }
done
test "$bad" = "0"

# 3. bullet 집합 = 실제 파일 집합
diff -u <(index_bullets | sort) \
        <(cd docs/pitfalls && find plan team code-review -type f -name '*.md' | sort)

# 4. INDEX 의 모든 링크가 실재 파일을 가리킨다
bad=0
for l in $(rg -o '\]\(((plan|team|code-review)/[^)]+\.md)\)' -r '$1' docs/pitfalls/INDEX.md | sort -u); do
  test -f "docs/pitfalls/$l" || { echo "BROKEN LINK: $l"; bad=1; }
done
test "$bad" = "0"

# 5. frontmatter — id 가 파일명, category 가 상위 디렉터리
bad=0
for f in $(find docs/pitfalls/plan docs/pitfalls/team docs/pitfalls/code-review -type f -name '*.md'); do
  id="$(awk 'NR<=8 && /^id:/{print $2; exit}' "$f")"
  cat="$(awk 'NR<=8 && /^category:/{print $2; exit}' "$f")"
  if [ "$id" != "$(basename "$f" .md)" ] || [ "docs/pitfalls/$cat" != "$(dirname "$f")" ]; then
    echo "FRONTMATTER MISMATCH $f (id=$id category=$cat)"; bad=1
  fi
done
test "$bad" = "0"

# 6. 활성 참조 잔존 0건 — ADR-018 은 기각 대안 기록이라 예외
test "$(rg --hidden --no-ignore -n '_shared/pitfalls' \
  --glob '!docs/adr/018-harness-docs-directory.md' \
  AGENTS.md README.md docs skills .agents .claude .codex src || true)" = ""
# 기각 근거는 보존돼야 한다 — 예외를 삭제 허가로 오해하는 것을 막는다
test "$(rg -c -F '_shared/pitfalls/' docs/adr/018-harness-docs-directory.md)" = "1"

# 7. 공개 저장소 정보 보호
domain_hits="$(grep -rnoE "(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)" README.md skills/ docs/ AGENTS.md CLAUDE.md src/ 2>/dev/null \
  | grep -vE "nhncloud\.com|nhncloudservice\.com|github\.com|npmjs\.com|example\.com|openai\.com|anthropic\.com" | wc -l | tr -d ' ')"
test "$domain_hits" = "0"
secret_hits="$(grep -rnE "(secret|password|appkey)['\"]?[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9]{16,}" README.md skills/ docs/ AGENTS.md CLAUDE.md src/ 2>/dev/null | wc -l | tr -d ' ')"
test "$secret_hits" = "0"

# 8. npm 배포 표면 불변
node -e "const p=require('./package.json'); if(p.files.some(x=>x==='docs'||x.startsWith('docs/')||x==='.agents'||x.startsWith('.agents/'))) process.exit(1)"

# 9. 045 인계 4건 — Phase 2 가 항목 4를 건너뛰어도 최종 게이트가 잡는다
test "$(rg -c -F 'phase-02 분리 완료 후 slug 채움' docs/pitfalls/INDEX.md || echo 0)" = "0"
awk 'prev ~ /^\|/ && $0 !~ /^\|/ && $0 != "" { print "TABLE NOT CLOSED at line " NR; bad=1 } { prev=$0 } END { exit bad+0 }' docs/pitfalls/INDEX.md
for d in plan team code-review; do
  diff <(index_bullets | grep "^$d/") <(index_bullets | grep "^$d/" | LC_ALL=C sort) \
    || { echo "ORDER NOT ALPHABETICAL: $d"; exit 1; }
done
test "$(find docs/pitfalls -name '.gitkeep' | wc -l | tr -d ' ')" = "0"

# 10. 선지정 edit 두 축
test "$(rg -c -F '미러(.agents/)' docs/pitfalls/plan/router-index-count-mismatch.md || echo 0)" = "0"
rg -q '카테고리 섹션|index_bullets' docs/pitfalls/plan/router-index-count-mismatch.md

# 11. 무관 파일 없음
test "$(git status --porcelain | grep -c '^??')" = "0"
git diff --check
```

## 의도 메모 (왜)

- 삭제 개수를 성공 기준으로 삼지 않고 분류 근거·링크 무결성·현재 코드 일치를 성공 기준으로 삼는다.
- 정리는 내부 지식 품질만 바꾸므로 공개 사용자 가이드 변경을 만들지 않는다.
- 모든 검사를 실행 명령으로 두는 이유는 산문 지시가 실행 없이 "확인했다"로 넘어가기 때문이다.
- 기각 근거 보존까지 함께 검사하는 이유는 `--glob` 예외를 "이 파일은 마음대로 고쳐도 된다"로 오해할 수 있기 때문이다.
