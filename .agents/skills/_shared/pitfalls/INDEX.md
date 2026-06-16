# Pitfalls — 사고/실수 회피 패턴 (파일-per-패턴 wiki)

skills 가 공유하는 회피 패턴 모음. **모놀리식 문서가 아니라 패턴 1개 = 파일 1개**다.
한 파일을 통째로 읽지 말고, 이 INDEX 로 **이 작업의 변경 유형에 해당하는 파일만** 골라 읽는다.

## 소비 방식 (중요 — 전부 읽지 않는다)

1. 이 INDEX 의 **라우터 표**에서 지금 작업의 변경 유형 행을 찾는다.
2. 그 행이 가리키는 pattern 파일만 읽고 self-check 한다.
3. **애매하면** 해당 카테고리 디렉터리(`plan/` · `team/` · `code-review/`)를 통째로 읽는다 (과소선택보다 안전).

소비자별 카테고리:

| 카테고리 | 디렉터리 | 호출 시점 | 사용 스킬 |
|---|---|---|---|
| plan 작성 | `plan/` | task 파일 작성 직후 self-check | planning, build-with-teams |
| team 운영 | `team/` | 팀원 스폰·메시지 작성 시 | build-with-teams |
| code-review | `code-review/` | 코드 작성·리뷰 시 (diff 대상) | build-with-teams, review-fix |

## 축적 규칙 (게이트 — 무분별한 성장 방지)

새 패턴은 **아래 4조건을 모두 통과할 때만** 파일로 추가한다. 1회성 지적은 PR reply 로 끝낸다.

1. **재발성** — 2회 이상 재발했거나, 다른 코드에서도 발생할 구조적 가능성이 있다.
2. **심각도** — 데이터 손상·문서 전체 실패·보안 등 영향이 크다 (경미한 1회성은 제외).
3. **도구로 못 잡음** — `pnpm tsc --noEmit` / `pnpm test` (vitest) 가 이미 잡는 것은 추가하지 않는다 (도구가 단일 소스).
4. **추상화 가능** — 커널이 특정 인시던트(plan/PR) 너머로 일반화된다. 인시던트 종속 예시는 재사용 코드 예시로 교체.

**주기적 prune·automate 패스 (의무)**: 회고 누적이 ADD 로만 기울지 않도록, 회고 10회마다 또는 분기마다 1회:

- **prune** — 가리키는 코드가 사라진 stale 파일 삭제 (`git rm`), 같은 커널 중복 파일 MERGE.
- **automate** — 도구로 승격 가능한 패턴은 `pnpm tsc` / vitest / ast-grep 으로 옮기고 파일 삭제.

회고 절차의 단일 소스는 `_shared/retros/{critic,code-reviewer,docs-verifier}-retro.md` (후속 task 025 에서 신설 예정 — 지금은 placeholder).

## 파일 형식

각 패턴 파일은 frontmatter + 본문(증상 / Good / 검출 / Self-check / Why).

```yaml
---
id: <kebab-slug = 파일명 stem>
category: plan | team | code-review
title: <한 줄 요약>
triggers: [<변경 유형 키워드>, ...]   # 라우터가 이 값으로 매칭
tool_catchable: <true|false>          # true 면 Why 에 그래도 유지하는 이유
source: [plan###, ...]                # 출처 plan/PR
related: [<다른 패턴 slug>, ...]      # 백링크
---
```

본문 규칙: 사고 사례(plan###)는 1개로 충분, 복수 나열 금지. "왜 이 가드가 필요한지" 1줄 단서 필수.

**링크 규칙**:

- 패턴 간 cross-ref(관련 패턴)는 본문 끝에 `관련: [[slug]], [[slug]]` 로 적는다.
  `[[slug]]` 는 brain·메모리 관례의 백링크 — **자동 로드하지 않는** 탐색·grep 토큰이다.
- `@경로` (import) 는 쓰지 않는다 — 그 파일 내용을 통째로 자동 포함시켜 선택적 로드 목적을 깨뜨린다.
- INDEX 의 카테고리 목록만 마크다운 링크(`[text](path)`) 로 둔다 (GitHub 클릭 네비게이션 허브).
- `related:` frontmatter 는 같은 slug 를 기계 필드로 유지한다 (본문 `[[ ]]` 와 중복 OK).

## nhncloud-cli 컨텍스트

- 빌드 검증: `pnpm tsc --noEmit && pnpm run build && pnpm test`
- 스택: TypeScript + Commander.js + ky + tsup (CJS 번들) + vitest
- 메인 브랜치: `main`
- 워크플로: 브랜치명 = `feat/<NNN>-<slug>` (`<NNN>` = task 번호)
- tsc/vitest 가 잡는다: exitCode 타입 오류 등 정적 타입 오류, vitest 가 커버하는 로직 — "도구로 못 잡음" 조건에서 제외

## 라우터 — 관련 패턴 고르는 법

전부 읽지 않는다. 두 가지 방법으로 이 작업에 해당하는 파일만 고른다.

1. **trigger grep** (1차) — 각 파일 frontmatter 의 `triggers:` 에 변경 유형 키워드가 있다. 작업 키워드로 좁힌다:

   ```bash
   # 예: spinner 순서를 바꾸는 코드 작성
   grep -rl "triggers:.*spinner" .claude/skills/_shared/pitfalls/code-review/
   # 예: 팀원 스폰·메시지 plan
   grep -rl "triggers:.*\(팀원 스폰\|SendMessage\)" .claude/skills/_shared/pitfalls/team/
   ```

2. **자주 쓰는 변경 유형 → 파일** (큐레이션 — phase-02 분리 완료 후 slug 채움):

| 변경 유형 | 카테고리 | 핵심 파일 |
|---|---|---|
| spinner·UX 순서 (validation 전 시작) | code-review | _(phase-02 이후 채움)_ |
| 에러 처리 일관성 (exitCode·catch) | code-review | _(phase-02 이후 채움)_ |
| 타입 안전성 (Map.get()! / 이중 단언) | code-review | _(phase-02 이후 채움)_ |
| API/HTTP 패턴 (redirect·throwHttpErrors) | code-review | _(phase-02 이후 채움)_ |
| exitCode 누락·mismatch | code-review | _(phase-02 이후 채움)_ |
| path-traversal (fileName basename) | code-review | _(phase-02 이후 채움)_ |
| interactive 경고 vs 실제 동작 | code-review | _(phase-02 이후 채움)_ |
| plan 작성 (phase 항목·검증 명령·완료 조건) | plan | _(phase-02 이후 채움)_ |
| 팀원 스폰·메시지 (build-with-teams) | team | _(phase-02 이후 채움)_ |
| worktree·cwd 격리 | team | _(phase-02 이후 채움)_ |

표에 없으면 trigger grep, 그래도 애매하면 카테고리 디렉터리 통째로 읽는다.

## 카테고리별 패턴 목록

_(phase-02 에서 slug 파일 분리 후 채움)_

### [plan/](plan/) (36)

### [team/](team/) (10)

### [code-review/](code-review/) (53)
