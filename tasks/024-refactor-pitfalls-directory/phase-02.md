# Phase 02 — common-pitfalls·code-review-pitfalls 를 카테고리별 slug 파일로 무손실 분리

## 목표 (검증 가능)

`common-pitfalls.md`(4섹션) + `code-review-pitfalls.md`(27항목)의 각 패턴이 `_shared/pitfalls/{category}/<slug>.md` 파일 1개로 분리되고, 내용 유실이 0이다(.claude/ + codex 미러 양쪽).

- 검증: 분리 전 패턴 수 = 분리 후 파일 수(카테고리별).
- 검증: 각 파일이 frontmatter + 본문(증상/Good/Self-check/Why)을 갖는다.

## 카테고리 매핑 (분리 대상)

`.claude/skills/_shared/common-pitfalls.md`:
- **섹션 1 (plan 작성, `## 1-N`, 38항목)** → `pitfalls/plan/<slug>.md`
- **섹션 2 (team 운영)** → `pitfalls/team/<slug>.md`
- **섹션 3 (PR review 코드 패턴)** → `pitfalls/code-review/<slug>.md`
- **섹션 4 (레포별 +α, dooray-cli)** → `pitfalls/plan/<slug>.md`(plan 카테고리에 흡수, slug 에 repo 맥락)
- "섹션 1 소진 체크리스트" 같은 메타 섹션 → INDEX.md 의 라우터/소비 안내로 흡수(별도 파일 아님).

`.claude/skills/_shared/code-review-pitfalls.md` (27항목, `## N-M`) → `pitfalls/code-review/<slug>.md`. "호출 시점"·"축적 규칙" 메타 섹션 → INDEX 로 흡수.

## 구현 항목

### 1. 패턴 1개 = 파일 1개 분리

- **split 키**: 각 `## <번호>. <제목>` 패턴 헤더를 경계로. 번호(`1-32` 등)는 버리고 **내용 기반 kebab slug** 파일명(docu-parser 거울 — 예 `test-phase-expected-value-guess.md`).
- **frontmatter**: `id`(=slug) / `category`(plan|team|code-review) / `title`(짧은 패턴 이름) / `triggers`(변경 유형 키워드 배열 — INDEX 라우터 매칭 키) / `tool_catchable`(true/false) / `source`(PR/plan 번호) / `related`(연결 slug). triggers·source·related 는 기존 본문 "Why"(PR #NN) 에서 추출.
- **본문**: 기존 증상/Good/Self-check/검출/Why 그대로 이전(무손실).
- **번호 참조 정리**: 본문 안에서 다른 항목을 "1-NN" 으로 가리키던 cross-ref 는 `[[<slug>]]` 또는 triggers 로 전환(slug 전환이라 번호 죽음).

### 2. 무손실 검증

- 분리 전 패턴 수: `grep -cE "^## [0-9]" common-pitfalls.md`(섹션 헤더 `# N.` 제외) + `grep -cE "^## [0-9]" code-review-pitfalls.md`.
- 분리 후: `ls pitfalls/{plan,team,code-review}/*.md | wc -l` 가 그 합과 일치(메타 섹션 제외분 반영).
- 각 파일에 `증상`·`Why`(또는 동등 키) 존재 샘플 확인.

### 3. codex 미러 동시 분리

`.agents/skills/_shared/common-pitfalls.md`·`code-review-pitfalls.md` 도 동일하게 `.agents/skills/_shared/pitfalls/{category}/<slug>.md` 로 분리(1-36 — codex 미러 동기). slug 는 `.claude/` 와 동일하게.

## 회피 항목 (executor self-check)

- **무손실**: 패턴 수 분리 전후 일치. 한 파일에 2 패턴 merge 없는지(파일당 `## ` 또는 `# ` title 1개).
- **slug only**: 파일명에 번호 prefix 금지(내용 kebab). ADR(NNN-slug)과 다름.
- **frontmatter triggers**: 라우터 매칭 키라 변경 유형 키워드를 빠짐없이.
- **cross-ref**: 본문의 "1-NN" 참조를 slug/triggers 로(죽은 번호 0).
- **codex 미러 동기**: `.agents/skills/_shared/pitfalls/` 도 같이 분리.

## 완료 조건

1. `pitfalls/{plan,code-review,team}/` 에 패턴별 slug 파일(분리 전 수와 일치).
2. 각 파일 frontmatter + 본문 무손실.
3. INDEX.md 라우터 표를 실제 slug 로 채움(phase-01 골격 → 완성).
4. codex 미러도 동일 분리.
5. index.json `current_phase: 2`(phase-03 대기 — 단일 파일은 아직 제거 안 함, phase-03 에서 참조 갱신 후 제거).

## 커밋

```
refactor(pitfalls): common-pitfalls·code-review-pitfalls 를 카테고리별 slug 파일로 분리 (ADR-018)
```
