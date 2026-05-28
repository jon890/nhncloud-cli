# Phase 7: commit + push + index.json 완료 마킹

## 컨텍스트

`nhncloud logncrash search` 구현 + 검증 + SKILL.md 완료 (Phase 1~6). 이 phase 는 변경을 commit·push 하고 task 상태를 완료로 마킹한다. 기계적 작업 (haiku).

먼저 아래 문서를 읽어라:

- `CLAUDE.md` — Git & PR 컨벤션 (없으면 전역 규칙: `type(scope): 설명`)
- `.claude/skills/planning/task-create.md` "마지막 2 phase 표준" + 커밋 규칙

## 목표

src/ 구현 + skills + task 파일을 commit·push, index.json 완료 마킹.

## 작업 목록

- [ ] 브랜치 확인 (commit 직전 필수 — common-pitfalls 2-10)
  - `git branch --show-current` — 의도한 작업 브랜치인지 확인
- [ ] index.json 완료 마킹
  - 모든 phase status + task status → `completed`
  - `current_phase` → 7 (= total_phases)
- [ ] 변경 파일 선별 add (`git add -A` 금지 — common-pitfalls)
  - `git status --porcelain` 으로 전체 목록 확인
  - src/ 구현 파일 + `skills/nhncloud-cli/SKILL.md` + `tasks/001-feat-logncrash-search/` 전부
  - task 무관 변경 (다른 작업/format-only) 은 제외 + 로그
- [ ] commit + push
  - 메시지: `feat(logncrash): add search command`
  - `git push`

## 성공 기준

```bash
# cwd: /Users/nhn/personal/nhncloud-cli
# index.json 완료 마킹 검증
grep -c '"status": "completed"' tasks/001-feat-logncrash-search/index.json   # 기대: 8 (1 task + 7 phase)
grep -cE '"current_phase": 7' tasks/001-feat-logncrash-search/index.json     # 기대: 1
# commit 생성 확인
git log -1 --format="%s" | grep -c "feat(logncrash)"   # 기대: 1
git status --porcelain | wc -l                          # 기대: 0 (clean)
```

## 주의사항

- commit 직전 `git branch --show-current` 확인 (무관 브랜치 commit 사고 방지).
- `git add -A` 금지 — 명시 파일 + task 의존 파일만 선별.
- 메시지는 `type(scope): 설명` 형식 엄수.

## Blocked 조건

- push 실패 (원격 변경 등): `PHASE_BLOCKED: push 실패 — 원격 확인 필요`
- 작업 브랜치가 의도와 다르면: `PHASE_BLOCKED: 예상 외 브랜치 — 확인 필요`
