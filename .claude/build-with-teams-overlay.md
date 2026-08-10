# build-with-teams 오버레이 — nhncloud-cli

공용 코어(`~/.claude/skills/build-with-teams`)에 nhncloud-cli 특화를 주입한다.
코어가 뼈대, 여기는 이 레포에서만 다른 값만 채운다 — 코어·`AGENTS.md`(`CLAUDE.md` 심링크)·`.claude/planning-overlay.md`와 중복 기재하지 않는다.

## 에이전트 이름 (레포 특화)

- executor: `nhncloud-cli-executor` (`.claude/agents/nhncloud-cli-executor.md` / `.codex/agents/nhncloud-cli-executor.toml`)
- docs-verifier: `nhncloud-cli-docs-verifier` (`.claude/agents/nhncloud-cli-docs-verifier.md` / `.codex/agents/nhncloud-cli-docs-verifier.toml`)

두 agent 본문이 도메인 self-check·검증 항목의 단일 소스다. spawn 프롬프트에는 task 파일 절대경로·직전 phase 학습만 담고 도메인 규칙을 반복하지 않는다.

## worktree 루트 (코어 기본값과 다름)

코어 기본값은 `.claude/worktrees/`이지만 이 레포는 `.agents/worktrees/{task-name}`을 쓴다.

```bash
# cwd: <repo root>
git worktree add .agents/worktrees/{task-name} -b {category}/{NNN}-{task-name} origin/main
```

## 통합 검증 명령

`AGENTS.md`(`CLAUDE.md` 심링크) "빌드 & 실행" 절이 단일 소스 — `pnpm run build` 와 `pnpm tsc --noEmit`.
전용 테스트 스위트가 없으면 `node dist/index.js {command} --help` smoke test 로 대체.

## task 스키마 / plan 네이밍 / 커밋·PR 컨벤션

`index.json` 스키마, `tasks/{NNN}-{task-name}/` 네이밍, 서브넘버 규칙, branch prefix(`{category}/{NNN}-{task-name}`), PR 제목 형식, 마지막 2 phase 표준(빌드 검증+docs → 커밋+push)은 `.claude/planning-overlay.md`가 단일 소스다.

## pitfalls 경로 (사전 해소 점검)

- `docs/pitfalls/code-review/` — code-reviewer 검사 시작 전 관련 패턴 적용 여부 확인 (라우터: `docs/pitfalls/INDEX.md`)
- `docs/pitfalls/team/` — team 협업 회피 패턴

## retro 누적 위치

critic·code-reviewer·docs-verifier 의 반복 지적은 `.agents/skills/_shared/retros/{critic,code-reviewer,docs-verifier}-retro.md` 절차를 따라 흡수한다. 새 회고 docs 신설 금지.
