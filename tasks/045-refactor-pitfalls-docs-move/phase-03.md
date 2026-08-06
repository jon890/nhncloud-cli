# Phase 03 — 문서 무결성과 회귀 검증

**Execution profile**: fast
**Status**: completed

---

## 목표

이동 후 파일·frontmatter·INDEX·활성 참조가 일치하고 CLI 빌드에 회귀가 없음을 증명한다.

**범위 외**: `README.md`와 공개 `skills/nhncloud-cli/`는 사용자 명령·패키지 내용이 바뀌지 않으므로 수정하지 않는다.

---

## 작업 항목 (4)

### 1. 파일 보존 검사

`INDEX.md`를 제외한 111개 패턴 파일을 `origin/main`의 이전 경로와 바이트 단위로 대조한다.
전체 Markdown 수 112개와 카테고리별 43·10·58개가 유지되는지 확인한다.

기준 커밋은 `HEAD`가 아니다. Phase 1·2 커밋이 이미 쌓인 시점이라 `HEAD` 트리에는 이전 경로가 없다.

### 2. frontmatter와 INDEX 검사

각 패턴 파일의 `id`가 파일명과 같고 `category`가 상위 디렉터리와 같은지 검사한다.
`docs/pitfalls/INDEX.md`의 카테고리 목록이 실제 파일과 일대일로 대응하고 누락·중복·끊어진 링크가 없는지 확인한다.

링크 집합은 라우터 표가 아니라 카테고리 섹션의 목록에서만 뽑는다. 문서 전체 링크를 합치면 라우터 표에만 있는 링크가 집합을 채워, 카테고리 목록에서만 빠진 항목을 놓친다.
카테고리 헤더 숫자, 목록 항목 수, 실제 파일 수 세 값이 모두 일치해야 한다.

### 3. 저장소 검증

타입 검사, 전체 테스트, 빌드, 변경 diff와 공개 정보 검사를 실행한다.
`package.json`의 npm `files`에 `docs`나 `.agents`가 포함되지 않아 패키지 배포 표면이 바뀌지 않았는지도 확인한다.

### 4. phase 상태 갱신

`tasks/045-refactor-pitfalls-docs-move/index.json`에서 Phase 3을 `completed`, `current_phase`를 `4`로 갱신한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `docs/pitfalls/INDEX.md` | 링크 무결성 검증 |
| `docs/pitfalls/*/*.md` | 내용·frontmatter 보존 검증 |
| `tasks/045-refactor-pitfalls-docs-move/index.json` | phase 상태 갱신 |

## 검증

```bash
# cwd: <repo root>
# branch: refactor/045-refactor-pitfalls-docs-move
set -e
BASE="$(git rev-parse origin/main)"

# 1. 내용 보존 — 이동 전 상태를 담은 고정 기준 커밋과 바이트 단위 대조
for file in $(find docs/pitfalls -type f -name '*.md' ! -name INDEX.md | sort); do relative="${file#docs/pitfalls/}"; git show "$BASE:.agents/skills/_shared/pitfalls/$relative" | cmp - "$file"; done
test "$(find docs/pitfalls -type f -name '*.md' | wc -l | tr -d ' ')" = "112"
test "$(find docs/pitfalls/plan docs/pitfalls/team docs/pitfalls/code-review -type f -name '*.md' | wc -l | tr -d ' ')" = "111"

# 2. frontmatter — id 가 파일명과 같고 category 가 상위 디렉터리와 같은지
bad=0
for f in $(find docs/pitfalls/plan docs/pitfalls/team docs/pitfalls/code-review -type f -name '*.md'); do
  id="$(awk 'NR<=8 && /^id:/{print $2; exit}' "$f")"
  cat="$(awk 'NR<=8 && /^category:/{print $2; exit}' "$f")"
  if [ "$id" != "$(basename "$f" .md)" ] || [ "docs/pitfalls/$cat" != "$(dirname "$f")" ]; then
    echo "FRONTMATTER MISMATCH $f (id=$id category=$cat)"; bad=1
  fi
done
test "$bad" = "0"

# 3. INDEX 카테고리 목록 = 실제 파일 (집합 비교로 누락·중복·끊어진 링크를 함께 잡는다)
# 라우터 표가 아니라 카테고리 섹션의 bullet 목록만 뽑는다. 전체 링크를 sort -u 로 합치면
# 라우터 표에만 있는 링크가 집합을 채워, 카테고리 목록에서만 빠진 항목을 놓친다.
index_bullets() {
  awk '
    /^### \[(plan|team|code-review)\// { inside=1; next }
    inside && /^## / { inside=0 }
    inside && match($0, /^- \[[^]]+\]\((plan|team|code-review)\/[^)]+\.md\)/) {
      s=substr($0, RSTART, RLENGTH); sub(/^.*\(/, "", s); sub(/\)$/, "", s); print s
    }
  ' docs/pitfalls/INDEX.md | sort
}
diff -u \
  <(index_bullets) \
  <(cd docs/pitfalls && find plan team code-review -type f -name '*.md' | sort)

# 4. INDEX 헤더 개수 = bullet 수 = 실제 파일 수 (3자 일치)
head_bad=0
for c in plan:43 team:10 code-review:58; do
  d="${c%%:*}"; n="${c##*:}"
  if [ "$(rg -c "^### \[$d/\]\($d/\) \($n\)" docs/pitfalls/INDEX.md || echo 0)" != "1" ]; then
    echo "INDEX HEADER MISMATCH: $d 헤더가 ($n) 이 아니다"; head_bad=1
  fi
  if [ "$(index_bullets | grep -c "^$d/")" != "$n" ]; then
    echo "INDEX BULLET MISMATCH: $d 목록 항목이 $n 개가 아니다"; head_bad=1
  fi
done
test "$head_bad" = "0"

# 5. 활성 참조 잔존 0건 — ADR-018 은 기각 대안 기록이라 예외
test "$(rg --hidden --no-ignore -n '_shared/pitfalls' \
  --glob '!docs/adr/018-harness-docs-directory.md' \
  AGENTS.md README.md docs skills .agents .claude .codex src || true)" = ""

# 6. 공개 저장소 정보 보호 — AGENTS.md 의 두 검사가 0건
test "$(grep -rnoE "(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)" README.md skills/ docs/ AGENTS.md CLAUDE.md src/ 2>/dev/null \
  | grep -vE "nhncloud\.com|nhncloudservice\.com|github\.com|npmjs\.com|example\.com|openai\.com|anthropic\.com" | wc -l | tr -d ' ')" = "0"
secret_hits="$(grep -rnE "(secret|password|appkey)['\"]?[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9]{16,}" README.md skills/ docs/ AGENTS.md CLAUDE.md src/ 2>/dev/null | wc -l | tr -d ' ')"
test "$secret_hits" = "0"

# 7. 회귀와 배포 표면
pnpm tsc --noEmit
pnpm test
pnpm run build
node -e "const p=require('./package.json'); if(p.files.some(x=>x==='docs'||x.startsWith('docs/')||x==='.agents'||x.startsWith('.agents/'))) process.exit(1)"
git diff --check
```

## 의도 메모 (왜)

- 이동 PR의 성공 기준은 새 내용의 품질이 아니라 기존 내용이 손실 없이 새 소유 경계에서 소비되는지다.
- 사용자 명령과 npm 패키지 표면이 그대로이므로 공개 가이드 수정은 문서 부채만 만든다.
- frontmatter·INDEX·공개 정보 검사를 산문 지시가 아니라 실행 가능한 명령으로 둔다. 산문으로 남기면 실행하지 않고 "확인했다"로 넘어갈 수 있다.
- 저장소 회귀 검증(`tsc`·`test`·`build`)은 이 phase에서 한 번만 실행한다. `docs/`는 타입 검사·번들 대상이 아니고 npm `files`에도 없어 반복 실행이 실패면만 늘린다.
