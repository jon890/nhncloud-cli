# Phase 02 — 회고 절차 3곳 → retro 참조 축약 + INDEX placeholder 해소 + 완료 마킹

## 목표 (검증 가능)

회고 절차가 흩어진 3곳(build-with-teams 9-7·planning 거울 구조·review-fix 6.5)이 `retros/{역할}-retro.md` 참조로 축약되고, `pitfalls/INDEX.md:34` placeholder 가 실제 참조로 해소되며, 절차의 단일 소스가 retro 로 일원화된다.

- 검증: 3곳 스킬에서 회고 절차 본문이 retro 참조로 대체(절차 중복 정의 0).
- 검증: `pitfalls/INDEX.md` 에 "후속 task 025 신설 예정" placeholder 문구 잔존 0.

## 무손실 요소 체크리스트 (필수 — critic MAJOR 2: 핵심 명제 기계 검증)

축약 전, 각 retro 로 옮길 **의미 요소**를 아래 5개로 고정한다. 축약 후 각 요소가 **① retro 에 정확히 1회 존재 ② 축약된 스킬 본문에는 부재(참조 1~2줄 + 스킬 고유 맥락만 잔존)** 임을 요소별로 대조한다. `single-file-split-section-boundary-leak` 교훈(무손실=수 일치와 경계 정합은 별개)을 절차 축약에 적용한 것.

| 의미 요소 | retro 에 1회 | 스킬 본문 부재(참조만) |
|---|:---:|:---:|
| 트리거 종류·조건 | ☐ | ☐ (실행 흐름 1~2줄 요약은 9-7 잔존 허용) |
| 갱신 위치(데이터 단일 소스) | ☐ | ☐ |
| 판정 4조건 참조(`pitfalls/INDEX.md`) | ☐ | ☐ |
| 작성 형식 | ☐ | ☐ |
| 커밋 규약 | ☐ | ☐ |

거울 무손상도 함께 확인 — 데이터 단일 소스(critic/code-reviewer → `pitfalls/{plan,code-review}/`, docs-verifier → planning 8단계 A항 표)가 retro 도입으로 바뀌지 않았다.

## 구현 항목

### 1. build-with-teams/SKILL.md 9-7 축약 (.claude + .agents 미러 동시)

9-7항(줄 462~475)의 역할별 갱신 위치·판정·커밋 규약 본문 → **"트리거된 역할의 `_shared/retros/{역할}-retro.md` 절차를 따른다"** 로 축약. 트리거 조건(REVISE/FIX/UPDATE 1회+, 1-shot skip)과 "0건이라도 자문" 은 실행 흐름이라 9-7 에 1~2줄 요약 유지하되, 상세 절차는 retro 참조.
- 9단계 흐름도(557~559 인근)의 회고 줄도 retro 참조로 정합.
- `.agents/skills/build-with-teams/SKILL.md` 동일 축약(양 미러 동시).

### 2. planning/SKILL.md 거울 구조 carve-out (.claude + .agents 미러 동시) — critic MAJOR 1

docs-verifier-retro 신설이 planning 의 "별도 회고 docs 신설 금지" 문구와 충돌하지 않도록 **line 단위로** 처리:
- **줄 37**(`축적 규칙: ... (build-with-teams SKILL 9-7항 참조)`) — 9-7 이 축약되므로 cross-ref 를 `(retros/{역할}-retro.md 절차 참조)` 로 갱신(stale 방지 — critic Missing).
- **거울 구조 원칙 3항**(`별도 회고 docs 신설 금지: ... _shared/docs-verifier-pitfalls.md 등 신설이 아니라 ... 표 갱신으로 흡수`) → **carve-out 갱신**: `별도 회고 *데이터* docs 신설 금지 — 절차 단일 소스는 retros/docs-verifier-retro.md, 데이터 단일 소스는 본 8단계 A항 표. retro 는 절차만 담고 데이터(표 행)는 여기 흡수.`
- **3항 하위 "흡수 방법" 줄**(`표에 행 추가 또는 기존 행 보강 (build-with-teams 9-7 회고 단계 참조)`) → 절차 상세는 retro 로 이전하고 planning 에는 `절차는 retros/docs-verifier-retro.md 참조` 1줄만 잔존.
- **유지(손대지 않음)**: 거울 구조 원칙 1·2·4·5항(docs 영향 표가 docs 갱신의 단일 소스라는 *표의 속성*) — 이는 절차가 아니라 원칙 정의라 planning 이 단일 소스. **해석 고정**: 절차 줄(37·3항·흡수방법)만 이전, 원칙 5개 항 정의는 잔존.

### 3. review-fix/SKILL.md 6.5 축약 (.claude + .agents 미러 동시)

6.5항(줄 478~)의 추출 기준(✅재현가능/❌1회성)·누적 위치 결정 본문 → retro 참조로 축약. review-fix 고유 맥락(reply 후 수행·메인 디렉터리 clean 사전 점검·사용자 confirm)은 6.5 에 유지, 일반 누적 절차는 retro 참조.
- `.agents/skills/review-fix/SKILL.md` 동일(양 미러 동시).

### 4. pitfalls/INDEX.md:34 placeholder 해소 (.claude + .agents 미러 동시)

`회고 절차의 단일 소스는 _shared/retros/{...}-retro.md (후속 task 025 에서 신설 예정 — 지금은 placeholder).`
→ placeholder 문구 제거, 실제 신설 반영: `회고 절차의 단일 소스는 _shared/retros/{critic,code-reviewer,docs-verifier}-retro.md. 각 retro 가 이 카테고리·planning 영향 표를 데이터 단일 소스로 가리킨다.`
- codex 미러 `.agents/skills/_shared/pitfalls/INDEX.md` 동일.

### 5. index.json 완료 마킹 (마지막 phase)

- `status: "completed"`, `current_phase: 2`, 모든 phase `status: "completed"`.

## 회피 항목 (executor self-check)

- **단일 소스(절차 중복 0)**: 위 무손실 요소 체크리스트로 요소별 ①②를 대조 — retro·스킬 양쪽 중복 0.
- **거울 구조 carve-out**: planning 원칙 1·2·4·5항(표=데이터 단일 소스) 정의는 유지, 3항은 "데이터 docs 신설 금지"로 carve-out, 절차 줄만 retro 이전. docs-verifier-retro 가 "별도 데이터 docs 신설 금지"를 담아 거울 유지.
- **stale cross-ref 0**: planning:37·거울 3항의 "9-7 참조"가 축약 후에도 가리키는 대상이 유효한지(retro 로 갱신) 확인.
- **codex 미러 동기**: 4개 스킬·INDEX 모두 `.agents/` 동기(`.codex/` 는 .toml agent 라 스킬 미러 아님 — 해당 없음). `diff -rq` 0.
- **placeholder 잔존 0**: `grep "후속 task 025\|placeholder" pitfalls/INDEX.md` 0건.

## 완료 조건

1. 무손실 요소 체크리스트 5요소 × (retro 1회 + 스킬 부재) 모두 충족(절차 중복 정의 0).
2. planning 거울 구조 원칙 정의(1·2·4·5항) 유지 + 3항 carve-out + 절차 줄 retro 이전.
3. `pitfalls/INDEX.md` placeholder 문구 0건, 실제 retros 참조로.
4. codex 미러 byte 동일(`diff -rq .claude/skills/_shared/retros .agents/skills/_shared/retros` 등 0).
5. `pnpm run build` 정상.
6. index.json `status: completed`.

## 커밋

```
refactor(skill): 회고 절차 3곳을 retros 참조로 축약 + INDEX placeholder 해소 (ADR-018 완료)
```
