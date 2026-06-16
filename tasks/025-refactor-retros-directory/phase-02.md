# Phase 02 — 회고 절차 3곳 → retro 참조 축약 + INDEX placeholder 해소 + 완료 마킹

## 목표 (검증 가능)

회고 절차가 흩어진 3곳(build-with-teams 9-7·planning 거울 구조·review-fix 6.5)이 `retros/{역할}-retro.md` 참조로 축약되고, `pitfalls/INDEX.md:34` placeholder 가 실제 참조로 해소되며, 절차의 단일 소스가 retro 로 일원화된다.

- 검증: 3곳 스킬에서 회고 절차 본문이 retro 참조로 대체(절차 중복 정의 0).
- 검증: `pitfalls/INDEX.md` 에 "후속 task 025 신설 예정" placeholder 문구 잔존 0.

## 구현 항목

### 1. build-with-teams/SKILL.md 9-7 축약

9-7항의 역할별 갱신 위치·판정·커밋 규약 본문 → **"트리거된 역할의 `_shared/retros/{역할}-retro.md` 절차를 따른다"** 로 축약. 트리거 조건(REVISE/FIX/UPDATE 1회+, 1-shot skip)과 "0건이라도 자문" 은 실행 흐름이라 9-7 에 1~2줄 요약 유지하되, 상세 절차는 retro 참조.
- 9단계 흐름도(557~559 인근)의 회고 줄도 retro 참조로 정합.

### 2. planning/SKILL.md 거울 구조 ↔ docs-verifier-retro 정합

- "Review 패턴 사전 해소" 표 + 축적 규칙(33~40 인근)의 docs-verifier 회고 절차 → `retros/docs-verifier-retro.md` 참조.
- **"거울 구조 원칙" 섹션 자체는 유지** — "docs 영향 표가 docs 갱신의 단일 소스" 는 표의 속성이라 planning 이 단일 소스. 단 docs-verifier *회고 절차*(어떻게 표에 흡수하나)는 retro 가 단일 소스가 되도록, 거울 구조 섹션에서 절차 부분만 retro 참조로 정리(원칙 정의는 남김).

### 3. review-fix/SKILL.md 6.5 축약

6.5항의 추출 기준·누적 위치 결정 본문 → retro 참조로 축약. review-fix 고유 맥락(reply 후 수행·메인 디렉터리 사전 점검·사용자 confirm)은 6.5 에 유지, 일반 누적 절차는 retro 참조.

### 4. pitfalls/INDEX.md:34 placeholder 해소

`회고 절차의 단일 소스는 _shared/retros/{...}-retro.md (후속 task 025 에서 신설 예정 — 지금은 placeholder).`
→ placeholder 문구 제거, 실제 신설됐음을 반영("회고 절차의 단일 소스는 `_shared/retros/{critic,code-reviewer,docs-verifier}-retro.md`. 각 retro 가 이 카테고리·planning 영향 표를 데이터 단일 소스로 가리킨다.").
- codex 미러 `.agents/skills/_shared/pitfalls/INDEX.md` 동일.

### 5. index.json 완료 마킹 (마지막 phase)

- `status: "completed"`, `current_phase: 2`, 모든 phase `status: "completed"`.

## 회피 항목 (executor self-check)

- **단일 소스(절차 중복 0)**: 축약 후 회고 절차 본문이 retro 와 스킬 양쪽에 중복되지 않는다. 스킬은 참조 + 고유 맥락만.
- **거울 구조 보존**: planning "docs 영향 표 단일 소스" 원칙 정의는 유지(절차만 retro 로). docs-verifier-retro 가 "별도 docs 신설 금지" 를 담아 거울 유지.
- **무손실**: 축약으로 사라진 절차 의미가 retro 에 다 있는지 대조(phase-01 이전 + phase-02 축약 = 합집합 보존).
- **codex 미러 동기**: 4개 스킬·INDEX 모두 `.agents/`(+ `.codex/` 해당 시) 동기. `diff -rq` 0.
- **placeholder 잔존 0**: `grep "후속 task 025\|placeholder" pitfalls/INDEX.md` 0건.

## 완료 조건

1. 3곳 스킬 회고 절차가 retro 참조로 축약(절차 중복 정의 0, 무손실).
2. planning 거울 구조 원칙 정의 유지(표 단일 소스).
3. `pitfalls/INDEX.md` placeholder 문구 0건, 실제 retros 참조로.
4. codex 미러 byte 동일(`diff -rq .claude/skills/_shared .agents/skills/_shared` 관련 0).
5. `pnpm run build` 정상.
6. index.json `status: completed`.

## 커밋

```
refactor(skill): 회고 절차 3곳을 retros 참조로 축약 + INDEX placeholder 해소 (ADR-018 완료)
```
