# Phase 03 — 참조 전수 갱신(1-NN·섹션→INDEX 라우터) + 단일 파일 제거 + 완료 마킹

## 목표 (검증 가능)

스킬·agent·codex 미러의 `common-pitfalls.md`/`code-review-pitfalls.md` 참조와 "1-NN"·"섹션 1+4" 번호 참조가 INDEX 라우터 방식으로 전환되고, 단일 파일이 제거되며, 죽은 참조가 0이다.

- 검증: `grep -rn "common-pitfalls\.md\|code-review-pitfalls\.md" CLAUDE.md docs/ .claude/ AGENTS.md .agents/ .codex/ skills/` → `pitfalls/` 경로 외 0건(단일 파일 참조 잔존 없음).
- 검증: 스킬의 "섹션 1"·"1-NN" 식 번호 참조가 "pitfalls/INDEX.md 라우터로 변경 유형 파일 선택" 으로 전환.

## 구현 항목

### 1. 참조 전수 갱신 (**grep authoritative — 범위에 .claude/agents/ + codex 미러 포함 (1-36)**)

```bash
grep -rln "common-pitfalls\.md\|code-review-pitfalls\.md" CLAUDE.md docs/ .claude/ AGENTS.md .agents/ .codex/ skills/ README.md 2>/dev/null
```

이 결과의 모든 파일 갱신. 확인된 대상:
- **planning/SKILL.md** — "Review 패턴 사전 해소" 표의 `common-pitfalls.md 섹션 1+4`·`code-review-pitfalls.md 전체` → "pitfalls/INDEX.md 라우터로 변경 유형 카테고리 선택(plan/code-review)". 8단계 self-check 명령의 경로.
- **build-with-teams/SKILL.md** — 7단계 "사전 해소 점검" 의 `code-review-pitfalls.md`·9단계 회고의 `common-pitfalls.md`/`code-review-pitfalls.md` 적재 경로 → `pitfalls/{category}/`(+ retros 는 task 025).
- **plan-and-build/SKILL.md** — 참조 doc 경로.
- **review-fix/SKILL.md (경로 치환이 아니라 *누적 절차 재작성* — critic MAJOR#1)**: review-fix 는 신규 패턴을 **번호로 append**(`### dooray-cli` 의 `CLI#`, 작성 형식 `**CLI4. {이름}**`, 보고 `→ _shared/common-pitfalls.md`)하라 지시한다. slug-only 전환이라 이 쓰기 절차가 깨진다.
  - "누적 위치 결정" 표(489 인근)·작성 형식(499 인근)·보고 형식(516 인근)을 **"`pitfalls/{category}/<slug>.md` 신규 파일(frontmatter) 생성 + INDEX 라우터 1줄"** 로 재작성.
  - **"회고 번호 충돌" pitfall(133 인근, `1-21` 양쪽 점유 → `1-22` 재할당)은 slug-only 에서 무의미** — 삭제하거나 "slug 라 번호 충돌 없음"으로 대체.
- **.claude/agents/nhncloud-cli-executor.md**, **nhncloud-cli-docs-verifier.md** — common-pitfalls/code-review-pitfalls 단일 소스 참조 → pitfalls/ INDEX.
- **codex 미러**: `AGENTS.md`·`.agents/skills/`·`.codex/agents/` 의 동일 참조(경로 + review-fix 누적 절차).

### 2. "1-NN"·"섹션 N" 번호 참조 → 라우터 전환

스킬이 `common-pitfalls 섹션 1`·`1-32` 식으로 **번호로** 가리키던 곳을, slug 전환으로 번호가 죽으므로 "INDEX 라우터로 변경 유형의 파일을 고른다" 방식으로 바꾼다. 개별 패턴을 콕 집어야 하면 slug 로(`[[<slug>]]`).

### 3. 단일 파일 제거

- `.claude/skills/_shared/common-pitfalls.md`·`code-review-pitfalls.md` `git rm`(이중 소스 금지).
- codex 미러 `.agents/skills/_shared/common-pitfalls.md`·`code-review-pitfalls.md` 도 `git rm`.

### 4. index.json 완료 마킹 (마지막 phase)

- `status: "completed"`, `current_phase: 3`, 모든 phase `status: "completed"`.

## 회피 항목 (executor self-check)

- **grep authoritative + 범위**: `.claude/agents/` + codex 미러(`.agents/`·`.codex/`·`AGENTS.md`) 포함(1-36). 단일 파일명 잔존 0.
- **번호→라우터**: "1-NN"·"섹션 N" 식 죽은 번호 참조 0(INDEX 라우터로).
- **이중 소스 금지**: 단일 파일 4개(.claude 2 + codex 2) 제거.
- **retros 의존**: retros 갱신 위치가 이 pitfalls 카테고리를 가리키나 retros 는 task 025 — INDEX 의 "회고 절차" 는 025 placeholder 유지(여기서 retros 신설 금지).

## 완료 조건

1. `grep -rn "common-pitfalls\.md\|code-review-pitfalls\.md"` (pitfalls/ 경로·tasks/ 과거·**`docs/adr/018-*`(이 마이그레이션을 기록하는 ADR — critic MAJOR#2)** 제외) → 0건. ADR-018:5 의 before→after 마이그레이션 기록은 **정당한 결정 기록이라 보존**(지우면 ADR 오염).
2. 스킬 "1-NN"·"섹션 N"·"CLIN" 번호 참조가 라우터/slug 방식으로 전환(죽은 번호 0).
3. review-fix 누적 절차가 번호 append → slug 파일 생성으로 재작성(번호 충돌 pitfall 제거).
4. 단일 파일 4개 제거(.claude 2 + codex 2).
5. `pnpm run build` 정상.
6. index.json `status: completed` 마킹.

## 커밋

```
refactor(pitfalls): 참조를 pitfalls/ INDEX 라우터로 전수 갱신 + 단일 파일 제거 (ADR-018 완료)
```
