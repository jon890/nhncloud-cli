# Phase 02 — common-pitfalls·code-review-pitfalls 를 카테고리별 slug 파일로 무손실 분리

## 목표 (검증 가능)

`common-pitfalls.md`(4섹션) + `code-review-pitfalls.md`(27항목)의 각 패턴이 `_shared/pitfalls/{category}/<slug>.md` 파일 1개로 분리되고, 내용 유실이 0이다(.claude/ + codex 미러 양쪽).

- 검증: 분리 전 패턴 수 = 분리 후 파일 수(카테고리별).
- 검증: 각 파일이 frontmatter + 본문(증상/Good/Self-check/Why)을 갖는다.

## 카테고리 매핑 (분리 대상)

**실측 카테고리별 수 (critic ADVERSARIAL 확정)**: common-pitfalls 의 digit 패턴(`## N-M`) 48 + CLI 패턴(`## CLIN`) 24 = 72, code-review-pitfalls 27. 합 99.

`.claude/skills/_shared/common-pitfalls.md`:
- **섹션 1 (plan 작성, `## 1-N`)** → `pitfalls/plan/<slug>.md`. **진짜 섹션1 은 36개**(1-1~1-36). 아래 stray 1-17/1-18 은 섹션1 이 아님.
- **섹션 2 (team 운영, `## 2-N`)** → `pitfalls/team/<slug>.md` (10개).
- **섹션 3 (PR review 코드 패턴)** → **빈 템플릿이라 0개 파일**(헤더만 존재 — 분리 대상 없음).
- **섹션 4 (레포별 +α, dooray-cli, `## CLIN`)** → **`pitfalls/code-review/<slug>.md`** (24개. **plan 아님** — CLI 함정은 TypeScript/Commander/tsup/vitest 코드 패턴이라 code-review 카테고리. critic MAJOR#3).
- **섹션 4 말미 stray `## 1-17`(테스트 mock self-mock)·`## 1-18`(테스트 정규식 dotAll) 2개** → **`pitfalls/code-review/<slug>.md`**(테스트 코드 패턴 — plan 아님). 번호가 진짜 섹션1 의 1-17/1-18 과 충돌하므로 **분리 전 번호→slug 매핑 표를 먼저 작성**(아래 §1).
- 메타 섹션("섹션 1 소진 체크리스트" — top-11 우선 self-check 큐레이션) → INDEX.md 의 소비 안내로 흡수하되 **우선순위 신호 보존**(별도 파일 아님).

`.claude/skills/_shared/code-review-pitfalls.md` (27항목) → `pitfalls/code-review/<slug>.md`. "호출 시점"·"축적 규칙" 메타 섹션 → INDEX 로 흡수.

**카테고리별 기대 파일 수**: plan **36** + team **10** + code-review **(CLI 24 + stray 2 + code-review-pitfalls 27 = 53)** = **99**.

## 구현 항목

### 1. 패턴 1개 = 파일 1개 분리

- **split 키**: 각 `## <번호>. <제목>` 패턴 헤더를 경계로. 번호(`1-32` 등)는 버리고 **내용 기반 kebab slug** 파일명(docu-parser 거울 — 예 `test-phase-expected-value-guess.md`).
- **frontmatter**: `id`(=slug) / `category`(plan|team|code-review) / `title`(짧은 패턴 이름) / `triggers`(변경 유형 키워드 배열 — INDEX 라우터 매칭 키) / `tool_catchable`(true/false) / `source`(PR/plan 번호) / `related`(연결 slug). triggers·source·related 는 기존 본문 "Why"(PR #NN) 에서 추출.
- **본문**: 기존 증상/Good/Self-check/검출/Why 그대로 이전(무손실).
- **번호→slug 매핑 표 먼저(필수 — critic MAJOR#3)**: 분리 시작 전에 `번호(1-NN/2-NN/CLIN/stray) → slug → category` 매핑 표를 한 번 만든다. 특히 **stray 1-17/1-18(code-review) 과 진짜 섹션1 1-17/1-18(plan) 을 구분**해 둬야 본문 cross-ref "1-17" 을 올바른 slug 로 변환할 수 있다.
- **번호 참조 정리**: 본문 안에서 다른 항목을 "1-NN"·"CLIN" 으로 가리키던 cross-ref 는 위 매핑 표로 `[[<slug>]]` 전환(slug 전환이라 번호 죽음).

### 2. 무손실 검증

- **분리 전 패턴 수 (CLI 포함 — critic CRITICAL#1)**: `grep -cE "^## ([0-9]+-[0-9]+|CLI[0-9]+)\." common-pitfalls.md` (= 72, digit 48 + CLI 24) + `grep -cE "^## [0-9]" code-review-pitfalls.md` (= 27). 합 **99**. `## [0-9]` 만 쓰면 `## CLIN` 24개를 못 세어 silent loss.
- **카테고리별 기대 수 단언**: `ls pitfalls/plan/*.md|wc -l`=36, `team`=10, `code-review`=53(CLI 24 + stray 2 + code-review 27). 합 99.
- **파일당 1 패턴**: 각 파일에 `^# ` 또는 `^## ` title 1개(merge 검출).
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
