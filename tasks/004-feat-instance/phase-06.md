# Phase 6: commit + push + index.json 완료 마킹

## 컨텍스트

`nhncloud instance` 구현 + 검증 + 공개 docs 갱신 완료 (Phase 1~5). 이 phase 는 변경을 commit·push 하고 task 상태를 완료로 마킹한다. 기계적 작업 (haiku).

먼저 아래 문서를 읽어라:

- `CLAUDE.md` — Git & PR 컨벤션 (`type(scope): 설명`)
- `.claude/skills/planning/task-create.md` "마지막 2 phase 표준"

**실행 모드 주의**: build-with-teams 면 commit/push/PR 은 team-lead 가 수행하고 executor 는 index.json 마킹만. plan-and-build(run-phases.py)면 이 phase 가 직접 commit·push.

## 목표

src/ 구현 + 문서 + task 파일 commit·push, index.json 완료 마킹.

## 작업 목록

- [ ] 브랜치 확인 — `git branch --show-current` (common-pitfalls 2-10)
- [ ] index.json 완료 마킹 — 모든 phase + task status `completed`, `current_phase` → 6
- [ ] 변경 파일 선별 add (`git add -A` 금지)
  - `git status --porcelain` 확인
  - src/config(types/credentials), src/api(keystone/endpoints/httpError 영향분), src/cache(token-store), src/services/instance/, src/commands/configure*, src/commands/instance/, src/index.ts
  - `skills/nhncloud-cli/SKILL.md`, `README.md`, `tasks/004-feat-instance/`
- [ ] commit + push
  - 메시지: `feat(instance): add OpenStack Nova v2 compute command group`
  - `git push`

## 성공 기준

**build-with-teams 모드 (executor 가드)**:

```bash
# cwd: <worktree 루트> (예: .claude/worktrees/plan004)
grep -c '"status": "completed"' tasks/004-feat-instance/index.json   # 기대: 7 (1 task + 6 phase)
grep -cE '"current_phase": 6' tasks/004-feat-instance/index.json     # 기대: 1
```

commit/push/PR 은 team-lead 책임이므로 아래 git 게이트는 executor 가 검증하지 않는다.

**plan-and-build 모드 (이 phase 가 직접 commit·push 일 때만)**:

```bash
git log -1 --format="%s" | grep -c "feat(instance)"   # 기대: 1
git status --porcelain | wc -l   # 기대: 0
```

## 주의사항

- commit 직전 `git branch --show-current` 확인.
- `git add -A` 금지 — task 관련 파일은 모두 포함하되 무관 변경(format-on-save 등) 제외.
- `pnpm-lock.yaml` 변동 없을 것 (의존성 추가 없음 — 모두 기존 ky·@inquirer 등 재사용).

## Blocked 조건

- push 실패: `PHASE_BLOCKED: push 실패 — 원격 확인 필요`
- 예상 외 브랜치: `PHASE_BLOCKED: 예상 외 브랜치 — 확인 필요`
