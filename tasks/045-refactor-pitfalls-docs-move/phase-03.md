# Phase 03 — 문서 무결성과 회귀 검증

**Execution profile**: fast
**Status**: pending

---

## 목표

이동 후 파일·frontmatter·INDEX·활성 참조가 일치하고 CLI 빌드에 회귀가 없음을 증명한다.

**범위 외**: `README.md`와 공개 `skills/nhncloud-cli/`는 사용자 명령·패키지 내용이 바뀌지 않으므로 수정하지 않는다.

---

## 작업 항목 (4)

### 1. 파일 보존 검사

`INDEX.md`를 제외한 111개 패턴 파일을 `HEAD`의 이전 경로와 바이트 단위로 대조한다.
전체 Markdown 수 112개와 카테고리별 43·10·58개가 유지되는지 확인한다.

### 2. frontmatter와 INDEX 검사

각 패턴 파일의 `id`가 파일명과 같고 `category`가 상위 디렉터리와 같은지 검사한다.
`docs/pitfalls/INDEX.md`의 링크가 실제 파일과 일대일로 대응하고 누락·중복·끊어진 링크가 없는지 확인한다.

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
for file in $(find docs/pitfalls -type f -name '*.md' ! -name INDEX.md | sort); do relative="${file#docs/pitfalls/}"; git show "HEAD:.agents/skills/_shared/pitfalls/$relative" | cmp - "$file"; done
test "$(rg -o '\]\((plan|team|code-review)/[^)]+\.md\)' docs/pitfalls/INDEX.md | sed -E 's/^.*\]\(([^)]+)\)$/\1/' | sort -u | wc -l | tr -d ' ')" = "111"
test "$(find docs/pitfalls/plan docs/pitfalls/team docs/pitfalls/code-review -type f -name '*.md' | wc -l | tr -d ' ')" = "111"
pnpm tsc --noEmit
pnpm test
pnpm run build
node -e "const p=require('./package.json'); if(p.files.some(x=>x==='docs'||x.startsWith('docs/')||x==='.agents'||x.startsWith('.agents/'))) process.exit(1)"
git diff --check
```

frontmatter 검사는 `id`·`category` 두 필드를 파일 경로에서 계산해 비교하고, 실패 파일 경로를 출력하게 한다.
INDEX 검사는 링크 집합과 실제 상대 경로 집합을 정렬해 `diff -u`로 비교한다.
AGENTS.md의 공개 저장소 정보 보호 grep 두 명령도 실행해 결과가 0건인지 확인한다.

## 의도 메모 (왜)

- 이동 PR의 성공 기준은 새 내용의 품질이 아니라 기존 내용이 손실 없이 새 소유 경계에서 소비되는지다.
- 사용자 명령과 npm 패키지 표면이 그대로이므로 공개 가이드 수정은 문서 부채만 만든다.
