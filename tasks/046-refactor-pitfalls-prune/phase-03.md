# Phase 03 — 정리 결과와 회귀 검증

**Execution profile**: fast
**Status**: pending

---

## 목표

정리 후 남은 패턴이 현재 저장소와 일치하고 INDEX·frontmatter·활성 소비 경로·CLI 검증이 모두 통과하는지 확인한다.

**범위 외**: 사용자 명령과 npm 패키지 표면이 바뀌지 않으므로 `README.md`와 공개 `skills/nhncloud-cli/`를 수정하지 않는다.

---

## 작업 항목 (4)

### 1. 삭제 근거와 잔존 문서 검사

삭제된 파일이 모두 분류표의 `delete-*` 판정인지 확인한다.
남은 `retain`·`edit` 파일에 제거된 경로·명령·심볼을 사실처럼 지시하는 문장이 없는지 해당 표면을 `rg --hidden --no-ignore`로 대조한다.

### 2. INDEX와 frontmatter 검사

INDEX 링크 집합과 실제 파일 상대 경로 집합을 정렬해 일치 여부를 비교한다.
모든 남은 파일의 `id`가 파일명, `category`가 상위 디렉터리와 같은지 검사하고 INDEX의 카테고리 개수를 실측값과 대조한다.

### 3. 저장소 회귀 검사

타입 검사, 전체 테스트, 빌드, 변경 diff, 공개 정보 검사와 활성 이전 경로 grep을 실행한다.
`package.json`의 npm `files`가 문서 정리로 바뀌지 않았는지 확인한다.

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
set -e
for file in $(git diff --name-only --diff-filter=D -- 'docs/pitfalls/*/*.md'); do relative="${file#docs/pitfalls/}"; awk -F '\t' -v path="$relative" '$1 == path && $2 ~ /^delete-/ { found=1 } END { exit !found }' .omx/pitfalls-audit.tsv; done
test "$(rg --hidden --no-ignore -n '\.agents/skills/_shared/pitfalls|_shared/pitfalls' AGENTS.md README.md docs skills .agents .claude .codex src || true)" = ""
pnpm tsc --noEmit
pnpm test
pnpm run build
node -e "const p=require('./package.json'); if(p.files.some(x=>x==='docs'||x.startsWith('docs/')||x==='.agents'||x.startsWith('.agents/'))) process.exit(1)"
git diff --check
```

INDEX 집합 비교와 frontmatter 검사는 Phase 2 결과의 실제 파일 수를 기준으로 수행하고 실패 경로를 출력하게 한다.
AGENTS.md의 공개 저장소 정보 보호 grep 두 명령도 실행해 결과가 0건인지 확인한다.

## 의도 메모 (왜)

- 삭제 개수를 성공 기준으로 삼지 않고 분류 근거·링크 무결성·현재 코드 일치를 성공 기준으로 삼는다.
- 정리는 내부 지식 품질만 바꾸므로 공개 사용자 가이드 변경을 만들지 않는다.
