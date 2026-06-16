# Phase 01 — pitfalls 디렉터리 + INDEX 라우터 골격 (docu-parser 거울)

## 목표 (검증 가능)

`_shared/pitfalls/{plan,code-review,team}/` 디렉터리 + `_shared/pitfalls/INDEX.md` 라우터(소비 방식·축적 게이트·파일 형식)가 docu-parser 형식을 거울로 생성된다.

- 검증: `ls .claude/skills/_shared/pitfalls/` → `plan/ code-review/ team/ INDEX.md`.
- 검증: INDEX.md 에 소비 3단계·축적 게이트 4조건·prune/automate·파일 형식·retros 참조가 있다.

## 선행 — docu-parser INDEX 거울

작성 전 docu-parser 의 INDEX 를 읽어 형식을 그대로 따른다(번역·재작성 아닌 구조 거울):
- `/Users/nhn/projects/ai-playground-docu-parser/.claude/skills/_shared/pitfalls/INDEX.md`
- 파일 형식 참고: `/Users/nhn/projects/ai-playground-docu-parser/.claude/skills/_shared/pitfalls/plan/adr-number-collision.md`

근거는 ADR-018(누적 docs 디렉터리 구조). pitfalls 는 **slug only**(내부 참조라 번호 불요 — ADR 의 NNN-slug 와 다름).

## 구현 항목

### 1. 디렉터리 3개

`.claude/skills/_shared/pitfalls/{plan,code-review,team}/` 생성. 빈 디렉터리 유지를 위해 분리 전이면 `.gitkeep` 또는 phase-02 에서 파일이 채워지므로 phase-01 에서는 INDEX 만 둬도 된다(executor 판단 — git 은 빈 디렉터리를 안 받으니 INDEX + 첫 파일이 디렉터리를 살린다).

### 2. `_shared/pitfalls/INDEX.md` (docu-parser 거울)

다음 섹션을 포함(docu-parser INDEX 구조 그대로, nhncloud-cli 맥락으로):

- **헤더**: "회피 패턴 모음 — 모놀리식이 아니라 패턴 1개 = 파일 1개. 통째로 읽지 말고 이 INDEX 로 변경 유형에 해당하는 파일만 골라 읽는다."
- **소비 방식 3단계**: (1) 라우터 표에서 변경 유형 행 찾기 → (2) 그 행이 가리키는 파일만 self-check → (3) 애매하면 카테고리 디렉터리(`plan/`·`team/`·`code-review/`) 통째로(과소선택보다 안전).
- **소비자별 카테고리 표**:
  | 카테고리 | 디렉터리 | 호출 시점 | 사용 스킬 |
  |---|---|---|---|
  | plan 작성 | `plan/` | task 파일 작성 직후 self-check | planning, build-with-teams |
  | team 운영 | `team/` | 팀원 스폰·메시지 작성 시 | build-with-teams |
  | code-review | `code-review/` | 코드 작성·리뷰 시(diff 대상) | build-with-teams, review-fix |
- **축적 규칙 4조건**(모두 통과해야 파일 추가, 1회성은 PR reply 로 종료): (1) 재발성(2회+ 또는 구조적 가능성) (2) 심각도(데이터/문서 전체/보안급) (3) 도구로 못 잡음(tsc/vitest 가 잡는 건 제외) (4) 인시던트 너머 추상화.
- **prune·automate 패스(의무)**: 회고 10회마다 또는 분기 1회 — stale 파일 `git rm`, 도구 승격 가능 패턴은 린터/ast-grep 으로 옮기고 파일 삭제(ADD 편향 방지).
- **회고 절차 단일 소스**: `_shared/retros/{critic,code-reviewer,docs-verifier}-retro.md`(task 025 에서 신설 — 지금은 "후속 task 025" placeholder).
- **파일 형식**: frontmatter(`id`·`category`·`title`·`triggers[]`·`tool_catchable`·`source[]`·`related[]`) + 본문(증상/Good/검출/Self-check/Why).
- **라우터 표**: 변경 유형 → 해당 slug 파일. phase-01 시점엔 파일이 아직 없으니 **카테고리 수준 골격**으로 두고, phase-02 분리 후 실제 slug 로 채운다(phase-02 완료 조건에 포함).

### 3. codex 미러 INDEX (동시)

codex 미러도 같은 골격: `.agents/skills/_shared/pitfalls/{plan,code-review,team}/` + `INDEX.md`(동일 내용). 1-36(경로/구조 이전 시 codex 미러 동기) 회피.

## 완료 조건

1. `.claude/skills/_shared/pitfalls/` 에 plan/·code-review/·team/ + INDEX.md.
2. INDEX.md 가 docu-parser 형식 거울(소비 3단계·축적 게이트 4조건·prune·파일 형식·retros placeholder).
3. codex 미러 `.agents/skills/_shared/pitfalls/` 도 동일 골격.
4. index.json `current_phase: 1`.

## 커밋

```
refactor(pitfalls): pitfalls 디렉터리 + INDEX 라우터 골격 (ADR-018, docu-parser 거울)
```
