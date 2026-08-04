# Phase 02 — 활성 소비 경로 갱신

**Execution profile**: standard
**Status**: pending

---

## 목표

스킬·에이전트·오버레이가 새 `docs/pitfalls/` 경로를 사용하게 하고 문서 감사 범위에 중첩 패턴 파일을 포함한다.

**범위 외**: 과거 실행 기록인 `tasks/`와 무시된 실행 상태인 `.omc/`의 문자열은 고치지 않는다. 회피 패턴 본문의 의미 정리는 후속 작업이 담당한다.

---

## 작업 항목 (4)

### 1. 계획·실행 오버레이

`.claude/planning-overlay.md`와 `.claude/build-with-teams-overlay.md`의 라우터 경로를 `docs/pitfalls/INDEX.md`와 세 카테고리 경로로 바꾼다.
`.claude/docs-check-overlay.md`의 대상 목록과 검사 명령에 `docs/pitfalls/INDEX.md`, `docs/pitfalls/*/*.md`를 명시하고 기존 `_shared/*.md` 검사와 함께 `retros/*.md`도 유지한다.

### 2. 에이전트와 내부 스킬

다음 활성 소비자의 하드코딩 경로를 새 경로로 바꾼다.

- `.claude/agents/nhncloud-cli-executor.md`
- `.codex/agents/nhncloud-cli-executor.toml`
- `.agents/skills/codebase-maintenance/SKILL.md`
- `.agents/skills/codebase-maintenance/references/nhncloud-cli-checks.md`

### 3. 회고 절차와 INDEX

`.agents/skills/_shared/retros/critic-retro.md`, `code-reviewer-retro.md`, `docs-verifier-retro.md`가 `docs/pitfalls/`를 가리키게 한다.
`docs/pitfalls/INDEX.md` 내부의 경로 예시를 새 위치로 바꾸고 실제 측정값에 맞춰 `code-review` 개수를 57에서 58로 바로잡는다.

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
| `.agents/skills/codebase-maintenance/` | 유지보수 검사 경로 갱신 |
| `.agents/skills/_shared/retros/` | 회고 반영 대상 갱신 |
| `docs/pitfalls/INDEX.md` | 경로와 실측 개수 정정 |

## 검증

```bash
# cwd: <repo root>
# branch: refactor/045-refactor-pitfalls-docs-move
set -e
test "$(rg --hidden --no-ignore -n '\.agents/skills/_shared/pitfalls|_shared/pitfalls' AGENTS.md README.md docs skills .agents .claude .codex src || true)" = ""
rg -n 'docs/pitfalls/INDEX\.md' .claude/planning-overlay.md .claude/build-with-teams-overlay.md .agents/skills/_shared/retros .agents/skills/codebase-maintenance .claude/agents .codex/agents
rg -n 'docs/pitfalls/\*/\*\.md' .claude/docs-check-overlay.md
test "$(find docs/pitfalls/code-review -type f -name '*.md' | wc -l | tr -d ' ')" = "58"
git diff --check
```

## 의도 메모 (왜)

- `rg --hidden --no-ignore`를 사용해야 `.codex/`처럼 일반 검색에서 빠질 수 있는 활성 소비자를 검증할 수 있다.
- `tasks/`는 당시 경로를 기록한 실행 이력이므로 이동 PR에서 다시 쓰지 않는다.
