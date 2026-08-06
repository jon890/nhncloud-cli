# Phase 02 — 활성 소비 경로 갱신

**Execution profile**: standard
**Status**: pending

---

## 목표

스킬·에이전트·오버레이가 새 `docs/pitfalls/` 경로를 사용하게 하고 문서 감사 범위에 중첩 패턴 파일을 포함한다.

**범위 외**: 과거 실행 기록인 `tasks/`와 무시된 실행 상태인 `.omc/`의 문자열은 고치지 않는다. 회피 패턴 본문의 의미 정리는 후속 작업이 담당한다.

`docs/adr/018-harness-docs-directory.md`도 고치지 않는다. 이 파일이 이전 경로를 언급하는 곳은 **기각된 대안** 항목이므로 문장을 바꾸면 결정 근거가 사라진다. 아래 검증에서 이 파일만 예외로 두고, 기각 근거가 그대로 남아 있는지 별도로 확인한다.

`docs/pitfalls/**` 본문의 가독성·중복·과대화 지적도 이번 PR 범위 외이며 `046-refactor-pitfalls-prune`이 담당한다.
이 PR의 `docs-verifier` 판정 대상은 경로 정합성과 `INDEX.md`의 링크·개수 일치까지다. Phase 1이 본문 수정을 금지했으므로 본문 품질 지적은 이 PR에서 고칠 수 없다.

---

## 작업 항목 (4)

### 1. 계획·실행 오버레이

`.claude/planning-overlay.md`와 `.claude/build-with-teams-overlay.md`의 라우터 경로를 `docs/pitfalls/INDEX.md`와 세 카테고리 경로로 바꾼다.
`.claude/docs-check-overlay.md`의 대상 목록과 검사 명령에 `docs/pitfalls/INDEX.md`, `docs/pitfalls/*/*.md`를 명시한다.
같은 파일의 `.agents/skills/_shared/*.md`는 `_shared/` 아래에 Markdown 파일이 하나도 없어 지금도 매칭에 실패하는 죽은 glob이므로 `.agents/skills/_shared/retros/*.md`로 교체한다.

### 2. 에이전트와 내부 스킬

다음 활성 소비자의 하드코딩 경로를 새 경로로 바꾼다.

- `.claude/agents/nhncloud-cli-executor.md`
- `.codex/agents/nhncloud-cli-executor.toml`
- `.agents/skills/codebase-maintenance/SKILL.md`
- `.agents/skills/codebase-maintenance/references/nhncloud-cli-checks.md`

`docs-verifier` 에이전트 두 개의 감사 대상 목록에도 새 경로를 추가한다.

- `.claude/agents/nhncloud-cli-docs-verifier.md`
- `.codex/agents/nhncloud-cli-docs-verifier.toml`

두 파일의 `대상:` 줄은 `docs/*.md`로 시작해 하위 디렉터리를 매칭하지 않으므로 `docs/pitfalls/INDEX.md`와 `docs/pitfalls/*/*.md`를 명시해야 한다.
ADR-018은 회피 패턴이 하네스 경로에 있어 일반 문서 감사에서 누락되는 것을 이동 근거로 들었고, `.claude/docs-check-overlay.md`는 감사 대상의 단일 소스가 이 에이전트 본문이라고 규정한다. 이 두 파일을 빼면 이동 목적이 달성되지 않는다.

### 3. 회고 절차와 INDEX

`.agents/skills/_shared/retros/critic-retro.md`, `code-reviewer-retro.md`, `docs-verifier-retro.md`가 `docs/pitfalls/`를 가리키게 한다.
`docs/pitfalls/INDEX.md` 내부의 경로 예시를 새 위치로 바꾸고 카테고리 헤더의 개수를 실측값에 맞춘다.
같은 파일의 `_shared/retros/` 표기도 저장소 루트 기준 `.agents/skills/_shared/retros/`로 명확히 한다. 파일이 `docs/pitfalls/`로 옮겨지면 이 상대 표기가 어디서 출발한 경로인지 알 수 없어진다.
`### [code-review/](code-review/) (57)`이 실제 파일 58개와 어긋나므로 58로 바로잡는다. `plan` 43과 `team` 10은 실측과 같아 그대로 둔다.

### 4. phase 상태 갱신

`tasks/045-refactor-pitfalls-docs-move/index.json`에서 Phase 2를 `completed`, `current_phase`를 `3`으로 갱신한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `.claude/planning-overlay.md` | 계획 검토 경로 갱신 |
| `.claude/build-with-teams-overlay.md` | 실행 검토 경로 갱신 |
| `.claude/docs-check-overlay.md` | 중첩 문서 감사 대상 갱신 |
| `.claude/agents/nhncloud-cli-executor.md` | 실행자 경로 갱신 |
| `.codex/agents/nhncloud-cli-executor.toml` | Codex 실행자 경로 갱신 |
| `.claude/agents/nhncloud-cli-docs-verifier.md` | 감사 대상에 중첩 패턴 파일 추가 |
| `.codex/agents/nhncloud-cli-docs-verifier.toml` | Codex 감사 대상에 중첩 패턴 파일 추가 |
| `.agents/skills/codebase-maintenance/` | 유지보수 검사 경로 갱신 |
| `.agents/skills/_shared/retros/` | 회고 반영 대상 갱신 |
| `docs/pitfalls/INDEX.md` | 경로와 실측 개수 정정 |

## 검증

```bash
# cwd: <repo root>
# branch: refactor/045-refactor-pitfalls-docs-move
set -e

# 1. 이전 경로 잔존 0건 — ADR-018 은 기각 대안으로 이전 경로를 기록하는 결정 문서라 예외다
test "$(rg --hidden --no-ignore -n '_shared/pitfalls' \
  --glob '!docs/adr/018-harness-docs-directory.md' \
  AGENTS.md README.md docs skills .agents .claude .codex src || true)" = ""

# 2. ADR-018 의 기각 근거가 그대로 남아 있는지 확인
test "$(rg -c -F '_shared/pitfalls/' docs/adr/018-harness-docs-directory.md)" = "1"

# 3. 소비자별 갱신 확인 — 다중 경로 rg 는 한 곳만 맞아도 통과하므로 파일마다 검사한다
for f in .claude/planning-overlay.md .claude/build-with-teams-overlay.md \
         .claude/agents/nhncloud-cli-executor.md .codex/agents/nhncloud-cli-executor.toml \
         .claude/agents/nhncloud-cli-docs-verifier.md .codex/agents/nhncloud-cli-docs-verifier.toml \
         .claude/docs-check-overlay.md \
         .agents/skills/codebase-maintenance/SKILL.md \
         .agents/skills/codebase-maintenance/references/nhncloud-cli-checks.md \
         .agents/skills/_shared/retros/critic-retro.md \
         .agents/skills/_shared/retros/code-reviewer-retro.md \
         .agents/skills/_shared/retros/docs-verifier-retro.md; do
  rg -q 'docs/pitfalls/' "$f" || { echo "MISSING docs/pitfalls in $f"; exit 1; }
done

# 4. 문서 감사 대상 목록에 중첩 패턴 파일이 실제로 들어갔는지
rg -q 'docs/pitfalls/\*/\*\.md' .claude/docs-check-overlay.md
rg -q 'docs/pitfalls/\*/\*\.md' .claude/agents/nhncloud-cli-docs-verifier.md
rg -q 'docs/pitfalls/\*/\*\.md' .codex/agents/nhncloud-cli-docs-verifier.toml

# 5. 죽은 glob 제거 확인 — 오버레이의 ls 명령이 실제로 성공해야 한다
test "$(rg -c -F '_shared/*.md' .claude/docs-check-overlay.md || echo 0)" = "0"
ls docs/*.md docs/adr/*.md docs/pitfalls/INDEX.md docs/pitfalls/*/*.md \
   skills/nhncloud-cli/SKILL.md skills/nhncloud-cli/references/*.md \
   .agents/skills/*/SKILL.md .agents/skills/_shared/retros/*.md > /dev/null

# 6. INDEX 헤더 개수 = 실제 파일 수 (3자 일치의 헤더 축)
test "$(find docs/pitfalls/code-review -type f -name '*.md' | wc -l | tr -d ' ')" = "58"
head_bad=0
for c in plan:43 team:10 code-review:58; do
  d="${c%%:*}"; n="${c##*:}"
  if [ "$(rg -c "^### \[$d/\]\($d/\) \($n\)" docs/pitfalls/INDEX.md || echo 0)" != "1" ]; then
    echo "INDEX HEADER MISMATCH: $d 헤더가 ($n) 이 아니다"; head_bad=1
  fi
done
test "$head_bad" = "0"

# 7. INDEX 의 retros 표기가 저장소 루트 기준으로 바뀌었는지
rg -q '\.agents/skills/_shared/retros/' docs/pitfalls/INDEX.md

git diff --check
```

## 의도 메모 (왜)

- `rg --hidden --no-ignore`를 사용해야 `.codex/`처럼 일반 검색에서 빠질 수 있는 활성 소비자를 검증할 수 있다.
- `tasks/`는 당시 경로를 기록한 실행 이력이므로 이동 PR에서 다시 쓰지 않는다.
- 소비자 검사를 파일별 루프로 돌리는 이유는 `rg`에 경로를 여러 개 주면 그중 하나만 맞아도 종료 코드가 0이 되어, 한 곳만 갱신해도 통과하기 때문이다.
- 검증 5번의 `ls`는 오버레이 명령 자체를 실행하는 것이 아니라, 오버레이가 가리킬 glob 집합이 실제로 존재하는지 확인하는 사본이다. 죽은 glob의 제거 여부는 바로 앞의 `_shared/*.md` 잔존 0건 검사가 담당한다.
