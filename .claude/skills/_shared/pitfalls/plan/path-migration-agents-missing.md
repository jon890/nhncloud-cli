---
id: path-migration-agents-missing
category: plan
title: 파일 경로/구조 이전 시 참조 grep 범위에 `.claude/agents/` 누락 (custom agent 가 스킬 스크립트를 복제 보유)
triggers: [경로 마이그레이션, .agents]
tool_catchable: false
source: [plan###]
related: []
---

**증상**: 단일 파일 → 디렉터리 같은 경로/구조 이전에서 참조 갱신 grep 범위를 `.claude/skills/` 까지만 잡고 `.claude/agents/` 를 빠뜨린다. custom agent 정의(executor·docs-verifier 등)가 스킬의 임베드 검증 스크립트를 **복제 보유**하는 경우가 있어, 스킬만 갱신하고 agent 를 누락하면 그 agent 의 스크립트가 없어진 옛 경로를 가리켜 **조용히 깨진다**(파일 부재 → 에러 또는 garbage pass).

**Good**: 경로/구조 이전 phase 의 참조 grep 범위에 `.claude/agents/` 를 항상 포함한다 — `grep -rn "<옛경로>" CLAUDE.md docs/ .claude/skills/ .claude/agents/ README.md skills/ src/`. 특히 검증 에이전트(docs-verifier 등)는 docs-check SKILL 의 검증 스크립트를 복제하므로 둘을 같은 로직으로 동기화한다(거울 — 이상적으로는 단일 소스화).

**Self-check**: 경로 이전 grep 범위에 `.claude/agents/` 가 있는가? custom agent 의 임베드 스크립트(ADR/docs 검증 등)가 새 구조를 반영하는가?

**Why**: PR #29 (plan023) code-reviewer FIX_NEEDED — adr.md → docs/adr/ 이전에서 phase-02 grep 이 `.claude/skills/` 만 봐 `.claude/agents/nhncloud-cli-docs-verifier.md` 의 ADR 검증 스크립트(docs-check 복제) 10건 + executor.md 1건을 놓침. critic 도 grep 범위를 못 잡음. 경로/구조 이전 task 마다 재발 가능.

## 섹션 1 소진 체크리스트

plan 제출 전 10개 패턴 모두 self-check:

- [ ] **[[numeric-estimation]]**: 모든 수치가 실측 명령 결과
- [ ] **[[file-scope-inaccurate]]**: 파일 목록이 `--name-only` 결과와 일치
- [ ] **[[prev-plan-interaction-missing]]**: 최근 10개 커밋과 이 plan 의 관계 서술
- [ ] **[[execution-context-ambiguous]]**: 모든 Bash 블록에 `# cwd:` 주석
- [ ] **[[manual-verification-criterion]]**: 성공 기준에 인간 의존 문구 없음
- [ ] **[[external-state-gate-missing]]**: 외부 상태 변경 단계에 gate + rollback
- [ ] **[[four-face-guard-missing]]**: load-bearing 불변식 도입 시 4면 가드
- [ ] **[[last-phase-completed-marking]]**: 마지막 phase 에 index.json `completed` 마킹 지시
- [ ] **[[macos-bsd-sed-word-boundary]]**: rename 시 `sed \b` 대신 `perl`
- [ ] **[[type-change-tsc-missing]]**: type 변경 phase 면 성공 기준에 `pnpm tsc --noEmit` baseline 비교
- [ ] **[[punt-orphan-deliverable]]**: punt 한 산출물이 받는 phase 작업목록 + 성공기준에 실재 (고아 참조 없음)

---

# 2. team 운영

`build-with-teams` 가 팀원 스폰 / 메시지 / 브랜치 작업 시 self-check. 사고가 자주 발생하는 영역.
