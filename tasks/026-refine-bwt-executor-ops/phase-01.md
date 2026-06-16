# Phase 01 — build-with-teams 6.2 phase별 spawn-shutdown 사이클 신설

## 목표 (검증 가능)

build-with-teams SKILL 에 "phase별 spawn-shutdown 사이클"이 신설되어, 4+ phase(대규모) task 는 phase 마다 새 executor 를 스폰·즉시 shutdown 하고, 3 phase 이하는 현행 단일 executor 를 유지한다. `.claude/` ↔ `.agents/` 미러 byte 동일.

- 검증: build-with-teams/SKILL.md 에 "6.2" spawn-shutdown 섹션 존재 + 4+ phase 조건·직전 학습 인계·즉시 shutdown·3 phase 이하 예외 4요소 포함.
- 검증: `.claude` ↔ `.agents` 미러 동일.

## 배경 (brain build-with-teams-rules)

현재 build-with-teams 는 executor 1명이 `run_in_background: true` idle 로 대기하며 전 phase 를 순차 처리한다. 대규모 task 에서 한 executor 의 컨텍스트가 phase 누적으로 비대해진다. brain 정의를 조건부로 도입한다.

## 구현 항목

### 1. 6단계 뒤 "6.2 phase별 spawn-shutdown 사이클" 신설 (.claude + .agents 미러 동시)

build-with-teams/SKILL.md 의 `### 6.1 phase 별 atomic commit` 뒤에 `### 6.2 phase별 spawn-shutdown 사이클 (대규모)` 추가. 4요소:
- **적용 조건**: `total_phases` 4 이상(규모 판정 "대")일 때 phase 마다 새 executor 스폰. **3 phase 이하는 단일 executor 유지**(스폰 오버헤드 회피).
- **컨텍스트 격리**: phase 마다 새 컨텍스트라 토큰 누적을 끊는다. phase별 모델 정책 적용 가능.
- **즉시 shutdown**: team-lead 가 phase commit(6.1)을 마치면 그 executor 에게 곧장 `shutdown_request`. idle 잔존이 리소스 점유하는 것을 막는다.
- **직전 phase 학습 인계**: 새 executor 스폰 프롬프트에 직전 phase 의 도메인 발견(이동한 경로·갱신한 import·확정된 타입 등)을 1~2줄로 넘긴다.

### 2. 기존 단일 executor 모델과의 경계 명시 (carve-out — pitfalls/plan/carve-out-conflicting-prohibition)

현재 6단계·"정식 팀원 스폰 규칙"은 executor 를 idle 로 대기시켜 반복 협업한다고 규정한다. 6.2 가 이 모델을 전면 대체하지 않도록 **조건 carve-out**:
- 6.2 도입부에 "**3 phase 이하는 6단계 단일 executor 모델 그대로**, 4+ phase 만 본 사이클 적용"을 명시.
- "정식 팀원 스폰 규칙"이 idle 반복 협업을 전제하는 critic/code-reviewer/docs-verifier 에는 영향 없음(executor 만 해당) — 1줄 명시.

**원위치 carve-out (필수 — pitfalls/plan/carve-out-conflicting-prohibition)**: 6.2 안에만 주석을 두면 기존 무조건문이 latent drift 로 남는다. 6.2 와 충돌하는 SKILL 본문 2곳을 **그 위치에서** 좁힌다:
- `build-with-teams/SKILL.md` 의 6.1 끝 "다음 phase 진행 지시"(현행 단일 executor 전제) 뒤 → `(4+ phase: 해당 executor shutdown 후 새 executor 스폰 — 6.2 참조)` 1절 추가.
- `build-with-teams/SKILL.md` 의 "정식 팀원 스폰 규칙" executor `run_in_background: true`로 idle 대기 문장 → `(단 executor 는 4+ phase 에서 6.2 적용 — phase별 스폰·shutdown)` 1절 추가.
- 두 곳 `.agents/` 미러 동시.

### 3. 규모 판정 표 연결

`### 규모 판정 기준`(210 인근)의 "대(phase 4+)" 행에서 6.2 를 참조하도록 1줄 연결(별도 정의 신설 금지 — 표가 단일 소스).

## 회피 항목 (executor self-check)

- **carve-out**: 6.2 가 기존 단일 executor·정식 팀원 스폰 모델을 부정하지 않고 4+ phase 조건으로 좁힌다. executor 외 검증자(critic 등)는 영향 없음 명시.
- **단일 소스**: 규모 판정·모델 라우팅 표를 재정의하지 않고 참조(거울).
- **codex 미러 동기**: `.agents/skills/build-with-teams/SKILL.md` 동일.

## 완료 조건

1. build-with-teams/SKILL.md 에 "6.2 phase별 spawn-shutdown 사이클" 존재(4요소 + 3 phase 이하 carve-out).
2. 규모 판정 표 "대" 행에 6.2 참조 1줄.
3. **원위치 carve-out**: 충돌 2곳(6.1 끝 "다음 phase 진행 지시", "정식 팀원 스폰 규칙" executor idle 대기)에 4+ phase 조건 1절씩 추가.
4. `.claude` ↔ `.agents` 미러 byte 동일.
5. `pnpm run build` 정상(영향 없음 확인).

## 커밋

```
docs(skill): build-with-teams 6.2 phase별 spawn-shutdown 사이클 신설 (4+ phase 조건부)
```
