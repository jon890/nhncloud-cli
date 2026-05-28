# Phase 6: commit + push + index.json 완료 마킹

## 컨텍스트

`nhncloud deploy` 명령군 구현 + 검증 + SKILL.md 완료 (Phase 1~5). 이 phase 는 변경을 commit·push 하고 task 상태를 완료로 마킹한다. 기계적 작업 (haiku).

먼저 아래 문서를 읽어라:

- `CLAUDE.md` — Git & PR 컨벤션 (`type(scope): 설명`)
- `.claude/skills/planning/task-create.md` "마지막 2 phase 표준" + 커밋 규칙

## 목표

src/ 구현 + skills + task 파일 commit·push, index.json 완료 마킹.

## 작업 목록

- [ ] 브랜치 확인 — `git branch --show-current` (common-pitfalls 2-10)
- [ ] index.json 완료 마킹
  - 모든 phase status + task status → `completed`
  - `current_phase` → 6 (= total_phases)
- [ ] 변경 파일 선별 add (`git add -A` 금지)
  - `git status --porcelain` 확인
  - src/api/oauth.ts, src/cache/, src/services/deploy/, src/commands/deploy/, src/config 변경, src/index.ts
  - `skills/nhncloud-cli/SKILL.md`, `tasks/002-feat-deploy/`
  - task 무관 변경은 제외 + 로그
- [ ] commit + push
  - 메시지: `feat(deploy): add deploy command group (run + reads)`
  - `git push`

## 성공 기준

```bash
# cwd: /Users/nhn/personal/nhncloud-cli
grep -c '"status": "completed"' tasks/002-feat-deploy/index.json   # 기대: 7 (1 task + 6 phase)
grep -cE '"current_phase": 6' tasks/002-feat-deploy/index.json     # 기대: 1
git log -1 --format="%s" | grep -c "feat(deploy)"   # 기대: 1
git status --porcelain | wc -l                       # 기대: 0
```

## 주의사항

- commit 직전 `git branch --show-current` 확인.
- `git add -A` 금지 — 명시 파일 + task 의존 파일만.
- 메시지 `type(scope): 설명` 형식 엄수.

## Blocked 조건

- push 실패: `PHASE_BLOCKED: push 실패 — 원격 확인 필요`
- 예상 외 브랜치: `PHASE_BLOCKED: 예상 외 브랜치 — 확인 필요`
