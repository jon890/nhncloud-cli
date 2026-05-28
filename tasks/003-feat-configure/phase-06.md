# Phase 6: commit + push + index.json 완료 마킹

## 컨텍스트

`nhncloud configure` 구현 + 검증 + 문서 갱신 완료 (Phase 1~5). 이 phase 는 변경을 commit·push 하고 task 상태를 완료로 마킹한다. 기계적 작업 (haiku).

먼저 아래 문서를 읽어라:

- `CLAUDE.md` — Git & PR 컨벤션 (`type(scope): 설명`)
- `.claude/skills/planning/task-create.md` "마지막 2 phase 표준"

**실행 모드 주의**: build-with-teams 파이프라인이면 commit/push/PR 은 team-lead 가 수행하고 executor 는 index.json 마킹만 한다. plan-and-build(run-phases.py) 면 이 phase 가 직접 commit·push.

## 목표

src/ 구현 + 의존성 + 문서 + task 파일 commit·push, index.json 완료 마킹.

## 작업 목록

- [ ] 브랜치 확인 — `git branch --show-current` (common-pitfalls 2-10)
- [ ] index.json 완료 마킹 — 모든 phase + task status `completed`, `current_phase` → 6
- [ ] 변경 파일 선별 add (`git add -A` 금지)
  - `git status --porcelain` 확인
  - src/config(types/credentials), src/commands/configure*, src/index.ts, package.json + pnpm-lock.yaml(@inquirer/prompts), src/services/deploy·commands/deploy(UAK 리팩토링 반영분)
  - `skills/nhncloud-cli/SKILL.md`, `README.md`, `tasks/003-feat-configure/`
- [ ] commit + push
  - 메시지: `feat(configure): add credential setup wizard`
  - `git push`

## 성공 기준

**build-with-teams 모드 (현 실행 경로) — executor 가 충족할 게이트는 index.json 마킹뿐**:

```bash
# cwd: <worktree 루트> (예: .claude/worktrees/plan003)
grep -c '"status": "completed"' tasks/003-feat-configure/index.json   # 기대: 7 (1 task + 6 phase)
grep -cE '"current_phase": 6' tasks/003-feat-configure/index.json     # 기대: 1
```

commit/push/PR 은 team-lead 책임이므로 아래 git 게이트는 **executor 가 검증하지 않는다** (team-lead 가 phase-06 commit + 일괄 push 후 책임).

**plan-and-build 모드 (run-phases.py) 일 때만 — 이 phase 가 직접 commit·push**:

```bash
git log -1 --format="%s" | grep -c "feat(configure)"   # 기대: 1
git status --porcelain | wc -l   # 기대: 0
```

## 주의사항

- commit 직전 `git branch --show-current` 확인.
- `git add -A` 금지 — UAK 리팩토링으로 deploy 파일도 바뀌었으니 task 관련 파일은 모두 포함하되 무관 변경은 제외.
- `pnpm-lock.yaml` 도 함께 (@inquirer/prompts 추가로 변경됨).

## Blocked 조건

- push 실패: `PHASE_BLOCKED: push 실패 — 원격 확인 필요`
- 예상 외 브랜치: `PHASE_BLOCKED: 예상 외 브랜치 — 확인 필요`
