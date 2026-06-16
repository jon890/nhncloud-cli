# Phase 01 — _shared/retros/ 3파일 신설 (역할별 회고 절차 골격)

## 목표 (검증 가능)

`_shared/retros/{critic,code-reviewer,docs-verifier}-retro.md` 3파일이 brain `self-improving-harness` 의 회고 골격(트리거 / 반복 가능성 판정 / 갱신 위치 / 작성 형식·커밋 규약)으로 신설되고, `.claude/` ↔ codex 미러 `.agents/` 가 byte 동일하다.

- 검증: `ls _shared/retros/*.md` = 3개, 양쪽 미러 동일.
- 검증: 각 파일이 4개 골격 섹션(트리거/판정/갱신 위치/형식·커밋)을 갖는다.

## 핵심 원칙 — retro 는 *절차*만 (거울 구조)

retro 파일은 회고 "데이터" 를 담지 않는다. **데이터 갱신 위치(단일 소스)를 가리키는 절차 문서**다.

- critic → `pitfalls/plan/<slug>.md` 신규 + INDEX
- code-reviewer → `pitfalls/code-review/<slug>.md` 신규 + INDEX
- docs-verifier → planning 8단계 A항 docs 영향 표 행 추가/보강 (**별도 데이터 문서 신설 금지** — 거울 구조)

retro 에 회고 이력을 로그로 쌓으면 그 자체가 새 rot 소스(ADR-018 대안 기각). 절차만 둔다.

## 구현 항목

### 1. 추출 소스 (무손실 이전 — 신규 창작 아님)

현재 회고 절차는 3곳에 분산. 각 retro 는 해당 절차를 **추출·정리**해 담는다(phase-02 가 원본을 참조로 축약):
- `build-with-teams/SKILL.md` 9-7항 — 트리거 조건(REVISE/FIX/UPDATE 1회+, 1-shot skip, 0건이라도 자문), 역할별 갱신 위치, 반복 가능성 판정 기준, 커밋 규약(`docs(skill): accumulate review learnings from PR #<N>`).
- `review-fix/SKILL.md` 6.5항 — 추출 기준(✅ 재현 가능 / ❌ 1회성), 누적 위치 결정, 메인 디렉터리 사전 점검.
- `planning/SKILL.md` 거울 구조 원칙 — docs-verifier 는 별도 docs 신설 금지, docs 영향 표 행으로 흡수.

### 2. 각 retro 파일 골격 (3파일 공통 4섹션)

```markdown
# {역할} 회고 절차

## 트리거
- {역할}의 {판정 종류} 가 1회 이상 발생하면 PR 생성 직후·팀 shutdown 직전 의무 수행.
- 1-shot 통과(해당 판정 0회)면 skip. 트리거됐으나 추가 패턴 0개여도 자문 자체는 수행("신규 없음" 보고).

## 반복 가능성 판정
- `pitfalls/INDEX.md` 축적 규칙(재발성·심각도·도구로 못 잡음·추상화 가능 4조건)을 **참조**한다(여기 재정의 금지 — 단일 소스).
- 1회성 typo / 특정 plan 컨텍스트 종속 / 칭찬 / 단순 확인은 제외.

## 갱신 위치 (데이터 단일 소스)
- {역할별 위치}.

## 작성 형식 + 커밋 규약
- {형식}.
- 커밋: `docs(skill): accumulate review learnings from PR #<N>` (PR 번호 + 사고 plan 번호 본문 명시). 회고 commit 은 작업 브랜치 PR 에 포함하거나(plan 진행 중) main 직접(사후) — 메인 디렉터리 clean 사전 점검 후.
```

역할별 채움:
- **critic-retro.md**: 트리거=REVISE 1회+. 갱신 위치=`pitfalls/plan/<slug>.md` 신규(frontmatter id·category·title·triggers·tool_catchable·source·related) + INDEX 라우터 1줄·헤더 카운트 동기. 형식=증상/Good/Self-check/Why.
- **code-reviewer-retro.md**: 트리거=FIX_NEEDED 1회+. 갱신 위치=`pitfalls/code-review/<slug>.md` 신규 + INDEX. 형식 동일.
- **docs-verifier-retro.md**: 트리거=UPDATE_NEEDED/VIOLATION 1회+. 갱신 위치=planning 8단계 A항 docs 영향 표 행 추가/보강(**별도 docs 신설 금지** 명시 — 거울 구조). 형식=영향 표 한 행(변경 유형 + 각 docs 칸).

### 3. codex 미러 동시 신설

`.agents/skills/_shared/retros/` 에 동일 3파일(byte 동일).

## 회피 항목 (executor self-check)

- **절차만**: retro 에 회고 이력 로그·실제 패턴 데이터를 넣지 않는다(데이터는 pitfalls/·영향 표).
- **판정 4조건 재정의 금지**: `pitfalls/INDEX.md` 축적 규칙을 참조만(중복 정의는 drift 소스 — structure-migration 회고와 같은 거울 원칙).
- **무손실**: 3곳 분산 절차의 의미가 retro 에 빠짐없이 이전(phase-02 축약의 전제).
- **frontmatter 없는 절차 문서**: retro 는 pitfalls 패턴 파일과 달리 frontmatter 를 두지 않는다(절차 문서 — `structure-migration-frontmatter-placeholder` 오해 방지). 4섹션 markdown 본문만.
- **codex 미러 동기**: `.agents/` 도 같이 신설, byte 동일.

## 완료 조건

1. `_shared/retros/` 에 3파일(critic/code-reviewer/docs-verifier), 각 4섹션 골격.
2. docs-verifier-retro 에 "별도 docs 신설 금지" 거울 구조 명시.
3. 판정 4조건은 재정의 없이 `pitfalls/INDEX.md` 참조.
4. codex 미러 `.agents/skills/_shared/retros/` byte 동일.
5. `pnpm run build` 정상(영향 없음 확인).

## 커밋

```
docs(skill): retros 역할별 회고 절차 단일 소스 3파일 신설 (ADR-018)
```
