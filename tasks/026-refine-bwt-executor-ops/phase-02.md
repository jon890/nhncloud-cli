# Phase 02 — 특이사항 4종 집계 (executor 보고 + 9단계 집계) + 완료 마킹

## 목표 (검증 가능)

executor 가 phase 보고에 특이사항 4종을 적고, team-lead 가 종료 시 누적해 사용자에게 명시 보고하는 절차가 executor agent + build-with-teams SKILL 에 추가된다. `.claude/`(SKILL) ↔ `.agents/`(SKILL) 및 `.claude/agents/`(.md) ↔ `.codex/agents/`(.toml) 미러 동기.

- 검증: executor agent 보고 형식에 "특이사항 4종" 섹션 + build-with-teams 9단계에 집계 단계 존재.
- 검증: 미러 동기(SKILL .agents / agent .codex).

## 배경 (brain build-with-teams-rules)

각 executor 는 phase 보고에 특이사항을 함께 적고, team-lead 는 종료 시 누적해 사용자에게 명시 보고한다. 특이사항이 없으면 "없음"으로 명시 — 침묵으로 갈음하지 않는다(사용자 미인지 종료 → 후속 누락).

## 구현 항목

### 1. executor agent 보고 형식에 특이사항 4종 추가 (.claude/agents/ + .codex/ 미러)

`.claude/agents/nhncloud-cli-executor.md` 의 `## SendMessage 보고 형식` 코드 블록(PII gate 뒤)에 섹션 추가:
```
## 특이사항 (4종 — 없으면 "없음" 명시)
- pre-existing: 이번 변경과 무관하게 원래 있던 문제 (또는 "없음")
- 신규 deprecation: 이번 변경이 유발한 라이브러리 경고·예정 폐기 (또는 "없음")
- 미검증: 로컬에서 확인 불가해 검증 단계로 넘긴 영역 (또는 "없음")
- 범위 외 발견: plan 범위 밖이지만 후속 필요한 발견 (또는 "없음")
```
- **`.codex/agents/nhncloud-cli-executor.toml` 동일 추가**(미러).
- 침묵 금지 원칙(없으면 "없음" 명시)을 1줄 명시.

### 2. build-with-teams 9단계에 특이사항 집계 단계 추가 (.claude + .agents 미러)

build-with-teams/SKILL.md 9단계(완료 + PR 생성)에 항 추가:
- team-lead 는 각 phase executor 보고의 특이사항 4종을 **누적**해, PR 생성 보고(또는 사용자 최종 보고)에 명시 표시한다.
- 4종 모두 "없음"이면 "특이사항 없음" 한 줄로 명시(침묵 금지).
- **삽입 위치·재번호 (CLAUDE.md rule 10 — `.5` 금지, 정수 재번호)**: 9단계는 현재 1~8 번호 목록(8 = 팀 shutdown)이다. 특이사항 누적 보고를 **새 8번**으로 삽입하고 기존 8번(팀 shutdown)을 **9번**으로 민다. `7.5` 류 소수 번호 금지.
- `.agents/skills/build-with-teams/SKILL.md` 동일.

### 3. index.json 완료 마킹 (마지막 phase)

- `status: "completed"`, `current_phase: 2`, 모든 phase `status: "completed"`.

## 회피 항목 (executor self-check)

- **침묵 금지 명시**: 4종 모두 "없음"이어도 보고에 명시(빈 보고 금지)를 양쪽(executor agent·9단계)에 1줄.
- **미러 동기 (4중)**: SKILL `.claude`↔`.agents`, agent `.claude/agents/.md`↔`.codex/agents/.toml` 모두 동기. `.md`↔`.toml` 은 형식이 달라 byte 동일이 아니라 **내용 동등** 확인.
- **단일 소스**: 특이사항 4종 정의는 executor agent 보고 형식이 1차 소스, 9단계는 "집계해 보고"만(정의 재나열 최소화).

## 완료 조건

1. executor agent(.md + .toml) 보고 형식에 특이사항 4종 + "없음 명시".
2. build-with-teams(.claude + .agents) 9단계에 특이사항 집계 단계.
3. SKILL `.claude`↔`.agents` byte 동일, agent `.md`↔`.toml` 내용 동등.
4. `pnpm run build` 정상.
5. index.json `status: completed`.

## 커밋

```
docs(skill): build-with-teams 특이사항 4종 집계 — executor 보고 + 9단계 누적 (brain build-with-teams-rules)
```
