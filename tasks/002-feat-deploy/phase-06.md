# Phase 6: index.json 완료 마킹

## 컨텍스트

`nhncloud deploy` 명령군 구현 + 검증 + SKILL.md 완료 (Phase 1~5). 이 phase 는 task 상태를 완료로 마킹하는 기계적 작업만 수행한다 (haiku).

**commit/push 는 이 phase 의 책임이 아니다.** build-with-teams 파이프라인에서 phase 별 atomic commit + 최종 push + PR 생성은 team-lead 가 수행한다 (common-pitfalls 1-17). executor 는 이 phase 에서 `git commit` / `git push` / `git add` 를 호출하지 않는다.

먼저 아래 문서를 읽어라:

- `.claude/skills/planning/task-create.md` "마지막 2 phase 표준"

## 목표

index.json 의 task status + 모든 phase status 를 `completed` 로, `current_phase` 를 6 으로 마킹.

## 작업 목록

- [ ] `tasks/002-feat-deploy/index.json` 완료 마킹
  - task 최상위 `status` → `completed`
  - `phases[].status` 6개 모두 → `completed`
  - `current_phase` → 6 (= total_phases)
- [ ] **commit/push 금지** — 마킹만 하고 team-lead 에게 phase 6 완료 보고

## 성공 기준

```bash
# cwd: <레포 루트 (worktree)>
grep -c '"status": "completed"' tasks/002-feat-deploy/index.json   # 기대: 7 (1 task + 6 phase)
grep -cE '"current_phase": 6' tasks/002-feat-deploy/index.json     # 기대: 1
```

## 주의사항

- `git commit` / `git push` / `git add` 호출 금지 — team-lead 가 phase 별 atomic commit + 최종 push·PR 을 담당한다.
- index.json 의 JSON 형식이 깨지지 않도록 마킹 (trailing comma 등 주의).

## Blocked 조건

- index.json 파싱 불가: `PHASE_BLOCKED: index.json 형식 오류 — 확인 필요`
