# Phase 7: index.json 완료 마킹

## 컨텍스트

`nhncloud logncrash search` 구현 + 검증 + SKILL.md 완료 (Phase 1~6).
이 phase 는 task 상태를 완료로 마킹하는 기계적 작업이다.

**실행 모드 주의 (build-with-teams)**: 이 파이프라인에서는 executor 가 commit/push/PR 을 하지 않는다.
phase 별 atomic commit 과 최종 push·PR 은 team-lead 가 수행한다.
따라서 이 phase 에서 executor 는 **index.json 완료 마킹만** 수행한다.
(plan-and-build 모드였다면 여기서 commit·push 했겠지만, build-with-teams 에서는 team-lead 책임.)

먼저 아래 문서를 읽어라:

- `.claude/skills/planning/task-create.md` "마지막 2 phase 표준" — 완료 마킹 규칙

## 목표

`tasks/001-feat-logncrash-search/index.json` 의 상태를 완료로 마킹.

## 작업 목록

- [ ] index.json 완료 마킹
  - 모든 phase 의 `status` → `"completed"` (7개)
  - task 최상위 `status` → `"completed"`
  - `current_phase` → 7 (= total_phases)
  - `updated_at` 갱신은 선택

## 성공 기준

```bash
# cwd: <레포 루트>
# index.json 완료 마킹 검증
grep -c '"status": "completed"' tasks/001-feat-logncrash-search/index.json   # 기대: 8 (1 task + 7 phase)
grep -cE '"current_phase": 7' tasks/001-feat-logncrash-search/index.json     # 기대: 1
```

## 주의사항

- **commit / push / PR 금지** — team-lead 가 이 phase 작업 + index.json 마킹을 한 commit 으로 묶고 최종 push·PR 을 수행한다.
- index.json 외 다른 파일 변경 금지.

## Blocked 조건

- 없음 (기계적 마킹).
