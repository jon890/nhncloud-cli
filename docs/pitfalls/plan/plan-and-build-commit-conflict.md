---
id: plan-and-build-commit-conflict
category: plan
title: plan-and-build 표준 task 를 build-with-teams 로 실행 시 마지막 phase commit/push 책임 충돌
triggers: [plan-and-build, build-with-teams, commit]
tool_catchable: false
source: [PR1, PR2, PR9]
related: []
---

**증상**: `/planning` + `task-create` 로 작성된 task 의 마지막 phase 가 "commit + push + index.json 마킹" 을 한 묶음으로 담음 (plan-and-build 표준).
  이 task 를 build-with-teams 로 실행하면 executor 가 그 지시대로 `git commit`/`git push`/`gh pr` 까지 수행 → team-lead 의 phase 별 atomic commit + 최종 PR 책임과 충돌.
  특히 마지막 phase 모델이 haiku 면 지시를 문자 그대로 실행할 확률이 높아 더 위험.
  부수적으로 phase 들의 `# cwd:` 가 main repo 절대경로로 하드코딩돼 있으면 worktree 가 아닌 main 에서 실행돼 오염 ([[execution-context-ambiguous]] 와 연관).

**Good**: build-with-teams 로 plan-and-build 표준 task 를 실행하기 전 critic 평가 단계에서 다음을 보정:
- 마지막 phase 를 "index.json 완료 마킹만" 으로 축소. commit/push/PR 문구 제거 + "team-lead 가 마킹과 함께 최종 commit·push·PR 수행" 명시. 성공 기준에서 `git log`/`git status --porcelain` 검사 제거, index.json 마킹 grep 만 유지.
- 모든 phase 의 `# cwd:` 를 `<레포 루트>` 플레이스홀더로 교체하고, executor 에게 worktree 절대경로를 스폰 프롬프트로 전달.

**Self-check**: build-with-teams 로 실행하려는 task 의 마지막 phase 가 `git commit`/`git push`/`gh pr` 를 담고 있는가? 담겨 있으면 마킹만 남기고 commit/push 책임을 team-lead 로 이관했는가?

**Why**: PR #1 (plan001) — plan-and-build 표준으로 작성된 task 를 build-with-teams 로 실행. critic 이 phase-07 의 commit/push 책임 충돌 + 7개 phase cwd 하드코딩을 REVISE 로 잡음. plan-and-build 표준 task 를 build-with-teams 로 재실행할 때마다 재발 가능.
  PR #2 (plan002) 재발 확인 — phase-06 이 동일하게 commit/push 를 담고 6개 phase cwd 가 main 절대경로였음. critic 이 다시 CRITICAL 로 잡음. 두 번 연속 재발했으므로 근원(`planning` / `task-create`)에서 마지막 phase 를 "마킹만 + cwd 플레이스홀더" 로 생성하도록 고치는 것이 정석. 그 전까지는 critic 단계 보정에 의존.
  PR #9 (plan007) 세 번째 재발 — phase-01/02 의 `# cwd:` 가 main repo 절대경로. critic 이 MAJOR 로 잡아 worktree 경로로 보정 후 APPROVE. 근원 수정 착수 — plan-and-build SKILL "Phase 프롬프트 작성 핵심 규칙" 9번에 "성공 기준 bash 블록 cwd 는 절대경로 금지 → `<레포 루트>` 플레이스홀더" 규칙 추가. 이후 task 생성부터 cwd 하드코딩이 안 나오는지 확인 필요.
