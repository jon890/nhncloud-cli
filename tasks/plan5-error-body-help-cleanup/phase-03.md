# Phase 03. 저장소 전용 docs-verifier 정의를 지우고 하네스 참조를 정리한다

**Execution profile**: fast

## 목표

쓰이지 않게 된 저장소 전용 역할 정의 `nhncloud-cli-docs-verifier` 를 지우고, 그 정의를 가리키는 오버레이 문구를 고친다.
반복 함정 목록의 알파벳순이 어긋난 한 줄도 바로잡는다.

**범위 외**: 공용 스킬(`fos-skills` 의 `build-with-teams`, `docs-check`)은 이 저장소 밖이라 고치지 않는다. 코드는 바꾸지 않는다.

## 컨텍스트

- 저장소 전용 역할 정의는 두 파일이다. 내용은 같다.
  - `.claude/agents/nhncloud-cli-docs-verifier.md` (Claude Code 용)
  - `.codex/agents/nhncloud-cli-docs-verifier.toml` (Codex 용)
- 공용 `build-with-teams` 스킬이 docs-verifier 역할 계약(`references/role-docs-verifier.md`)을 직접 가지고 있다. 판정 체계(`PASS` / `UPDATE_NEEDED` / `VIOLATION`)도 같다.
- 저장소 고유의 대조 기준(`nhncloud commands --json`, `docs/data-schema.md` 등)은 이미 `AGENTS.md` 와 `.claude/planning-overlay.md` 의 「문서 영향 판정」 표에 있다.
- 저장소 전용 executor 역할을 지운 선례가 있다(커밋 `6908194`).
- 정의를 이름이나 경로로 가리키는 곳은 오버레이 세 파일이다.

| 파일 | 줄 | 지금 내용 |
|---|---|---|
| `.claude/build-with-teams-overlay.md` | 3, 5~10 | 소개 문장의 「역할,」 과 `## 역할` 절(`docs-verifier: nhncloud-cli-docs-verifier`, 정의 위치 안내, spawn 프롬프트 규칙) |
| `.claude/docs-check-overlay.md` | 3, 10, 16~19 | 소개 문장의 「검증 위임」, 하네스 감사 대상의 `.claude/agents/`, `.codex/agents/`, `## 의미 검증 위임` 절 |
| `.claude/planning-overlay.md` | 29 | 「내부 스킬·역할 정의」 행의 `.claude/agents/`, `.codex/agents/` |

- `docs/pitfalls/INDEX.md` 의 plan 목록(「plan」 알파벳순 목록)에서 `gov-doc-field-parity-assumed` 줄이 `four-face-guard-missing` 바로 뒤에 들어가 있다. 알파벳순 자리는 `goal-reversed-logic-reuse` 바로 뒤다.

**근거 문서**: `docs/pitfalls/INDEX.md` 의 plan 목록, `AGENTS.md` 의 「문서와 스킬」 절, `.claude/planning-overlay.md` 의 「문서 영향 판정」 표.

## 의도 메모

- `## 역할` 절의 마지막 줄 「spawn 프롬프트에는 task 절대경로와 직전 phase에서 확인한 사실만 넘긴다.」 는 정의와 무관한 저장소 규칙이라 지우지 않는다. `## spawn` 같은 절 제목 아래로 옮기거나, 절 없이 소개 문장 다음에 둔다.
- 반복 함정 `docs/pitfalls/plan/path-migration-agents-missing.md` 를 읽는다. 지운 경로가 다른 하네스 파일에 남지 않았는지 검증 절의 grep 으로 확인한다.
- `.omx/` 아래 상태 파일에도 정의 이름이 남아 있지만 git 이 무시하는 실행 기록이라 대상이 아니다.

## 작업 항목

### 1. 역할 정의 두 파일 삭제

`.claude/agents/nhncloud-cli-docs-verifier.md`, `.codex/agents/nhncloud-cli-docs-verifier.toml` 을 지운다. 디렉터리가 비면 디렉터리도 남기지 않는다.

### 2. `.claude/build-with-teams-overlay.md` 수정

- 소개 문장을 「공용 `build-with-teams` 스킬에 이 저장소의 worktree와 검증 경로만 보탠다.」 로 바꾼다.
- `## 역할` 절을 지우고, spawn 프롬프트 규칙 한 줄은 위 의도 메모대로 남긴다.

### 3. `.claude/docs-check-overlay.md` 수정

- 소개 문장에서 「과 검증 위임」 을 지운다.
- 하네스 감사 대상에서 `.claude/agents/`, `.codex/agents/` 를 지운다.
- `## 의미 검증 위임` 절을 통째로 지운다. 의미 판정 기준은 공용 `docs-check` 스킬이 소유한다.

### 4. `.claude/planning-overlay.md` 수정

「내부 스킬·역할 정의」 행을 「내부 스킬」 로 바꾸고 대조 대상은 `.agents/skills/` 만 남긴다.

### 5. `docs/pitfalls/INDEX.md` 순서 수정

`- [gov-doc-field-parity-assumed](plan/gov-doc-field-parity-assumed.md)` 줄을 `- [goal-reversed-logic-reuse](plan/goal-reversed-logic-reuse.md)` 줄 바로 뒤로 옮긴다. 다른 줄은 바꾸지 않는다.

## 검증

```bash
test ! -e .claude/agents/nhncloud-cli-docs-verifier.md && test ! -e .codex/agents/nhncloud-cli-docs-verifier.toml && echo removed
git grep -n "nhncloud-cli-docs-verifier\|\.claude/agents\|\.codex/agents" -- . ':!tasks/'
grep "^- \[.*](plan/" docs/pitfalls/INDEX.md | LC_ALL=C sort -c && echo sorted
node_modules/.bin/vitest run
git diff --check
```

- 두 번째 명령은 0건이어야 한다.
- 세 번째 명령은 `sorted` 를 출력해야 한다. 실패하면 어긋난 다른 줄이 있는지 보고, 이 phase 가 옮긴 줄 말고는 고치지 않고 보고한다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `.claude/agents/nhncloud-cli-docs-verifier.md` | 삭제 |
| `.codex/agents/nhncloud-cli-docs-verifier.toml` | 삭제 |
| `.claude/build-with-teams-overlay.md` | 수정 |
| `.claude/docs-check-overlay.md` | 수정 |
| `.claude/planning-overlay.md` | 수정 |
| `docs/pitfalls/INDEX.md` | 수정 |
