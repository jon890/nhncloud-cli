# Common Pitfalls

skills 가 공유하는 사고 / 실수 회피 패턴. 카테고리별로 호출 시점이 다르므로 필요한 섹션만 grep 해서 참조.

| 섹션 | 카테고리 | 호출 시점 | 사용 스킬 |
|---|---|---|---|
| 1 | plan 작성 (critic 회피) | task 파일 작성 직후 self-check | `planning`, `build-with-teams` |
| 2 | team 운영 | 팀원 스폰 / 메시지 / 브랜치 작업 시 | `build-with-teams` |
| 3 | PR review 학습 (코드 패턴 함정) | 리뷰 댓글 처리 후 누적 | `review-fix` |
| 4 | 레포별 +α (dooray-cli) | task 도메인 코드 작성 시 | `planning`, `build-with-teams` |

**관련 docs**:
- [`code-review-pitfalls.md`](./code-review-pitfalls.md) — build-with-teams code-reviewer 회피 패턴. 본 docs 가 *plan 작성 회피* 라면 거긴 *코드 작성 회피*. 호출 시점이 다르므로 분리 유지.

## 축적 규칙

- 새로운 사고 타입 발견 시 해당 섹션에 **패턴 한 줄 + 실측 명령 + self-check** 추가
- 같은 사고 재발 시 패턴 강화 (예시 / 체크 엄격화)
- "왜 이 가드가 필요한지" 1줄 단서는 반드시 — 미래 AI 가 의도 모르고 우회하지 않도록
- 사고 사례 (plan###) 는 1개로 충분, 복수 나열 금지

---

# 1. plan 작성 (critic 회피)

`/planning` 또는 `build-with-teams` 가 task 파일 작성 시 self-check. 이 섹션의 모든 항목을 plan 생성 **전에 소진** 하면 critic 이 1-shot APPROVE 할 확률이 높다.

## 1-1. 수치 추측 (파일 수 / 줄 수)

**증상**: "약 30개 파일", "100줄 줄어듦" 같은 수치를 실측 없이 적음.
**왜**: critic 이 가장 먼저 검증하는 것은 phase 약속 수치 ↔ 실제 코드 일치 여부. 추측은 즉시 REVISE 사유.

```bash
git diff <base>..<target> --stat | tail -5
git diff <base>..<target> --name-only | wc -l
```

**Self-check**: 모든 수치가 실측 명령 결과? 명령 자체가 plan 에 인용되어 있는가?

## 1-2. 파일 범위 부정확

**증상**: "commands 전체 수정" — "전체" 표현은 critic 이 추적 불가.
**왜**: 누락된 파일이 conflict 진앙이 되면 executor 가 헤맨다.

```bash
git diff <base>..<target> --name-only -- <scope-dir>/
```

**Self-check**: 파일 목록을 plan 에 전부 나열했고, 각 파일 처리 원칙이 서술됐는가?
디렉터리 단위 정리 task (docs 일괄 backfill / lint 전 적용 등) 는 `ls <dir>/*.md` 결과를 plan 본문에 직접 인용하여 큰 파일 누락 회피 (plan034 PR #69 — `docs/guide-mvp-with-ai-agent.md` 878줄 누락이 critic REVISE 사유).

## 1-3. 이전 plan / main 커밋과의 상호작용 누락

**증상**: 이번 plan 이 다른 최근 plan 산출물과 충돌하는데 본문에 그 관계 미서술.
**왜**: executor 가 rebase 중 "어느 쪽이 final state 인가" 모르고 잘못된 방향으로 병합.

```bash
git log origin/main --oneline -20 -- <scope-dir>/
ls -dt tasks/*/ | head -5
```

**Self-check**: 최근 10개 커밋 중 plan 범위 파일을 건드린 게 있는가? 있으면 "어느 쪽이 final" 명시?

## 1-4. 실행 컨텍스트 모호 (cwd / branch)

**증상**: Bash 블록에 `cd` 없거나 "메인 디렉터리에서" 같은 애매한 서술.
**왜**: worktree 에서 main repo 로 잘못 커밋이 박히면 force-push 로 PR 에 섞임.

**규칙**: 모든 Bash 블록 위에 `# cwd: {절대경로}` 주석 + 브랜치 의존 시 `# branch: {expected}`.

**Self-check**: 모든 Bash 블록이 실행 위치 명시? worktree 사용 plan 이면 main vs worktree 구분 명확?

## 1-5. "눈으로 확인" 검증

**증상**: 성공 기준에 "수동 검토", "눈으로 확인" 같은 인간 의존 문구.
**왜**: executor (LLM) 가 "확인했다" 단정 가능 → 사실상 검증 없음.

**규칙**: 성공 기준의 각 항목은 grep / test / diff + 기대값 (건수 / exit / 문자열 포함) 명시. dooray-cli 는 `pnpm build && pnpm test` 가 기본 게이트.

**Self-check**: "확인" / "검토" 문구 0건? 각 명령에 기대값 명시?

## 1-6. 외부 상태 gate 부재

**증상**: 외부 시스템 변경 (push, merge, PR comment, npm publish) 단계 앞에 상태 확인 명령 없음.
**왜**: PR 이 close / merge 됐는데 force-push 하거나 CI 실패 모르고 "검증 완료" 댓글. dooray-cli 는 `npm publish` 가 추가 외부 동작.

```bash
STATE=$(gh pr view {N} --json state -q .state)
[ "$STATE" = "OPEN" ] || { echo "PR is $STATE"; exit 1; }
```

**Self-check**: 외부 가시 동작 앞에 gate, 뒤에 rollback 절차?

## 1-7. 새 불변식 도입 시 4면 가드 누락

**증상**: 캐시 스키마에 신규 필드 추가 + 일부 read 경로에만 가드 + writer 누락.
**왜**: 같은 불변식이 다른 표면에서 깨짐 (cache writer 드랍 / resolver 통과 / formatter 미반영 / config schema 미반영 등).

**4면 검사 체크리스트** (load-bearing 불변식인 경우 필수):
1. **Schema / Type**: `src/api/types.ts` / `src/cache/types.ts` 에 정의
2. **Cache writer & reader**: `src/cache/store.ts` 양쪽 모두 신 필드 처리 + atomic write
3. **Resolver / Mapper**: 입력 매퍼가 새 필드를 드랍하지 않는지 (`grep` 확인)
4. **Command / Formatter**: 사용자 가시 출력에서 일관 처리

**Self-check**: load-bearing 불변식 도입 시 4면 가드 모두 phase 작업 목록에 명시?

## 1-8. 마지막 phase 에 index.json `completed` 마킹 지시 누락

**증상**: 마지막 phase 본문에 "index.json status + 모든 phase status 를 `completed` 로 + 단일 commit 포함" 지시 없음.
**왜**: executor 는 scope 가드로 자체 추가 안 함 (올바른 행동) → team-lead 가 PR 직전 amend / 별도 commit. main 직접 수정 유혹 발생.

```bash
sed -i '' 's/"status": "pending"/"status": "completed"/g' tasks/{plan}/index.json
grep -c '"status": "completed"' tasks/{plan}/index.json   # = (1 + total_phases)
grep -lE "index\.json.*completed" tasks/{plan}/phase-*.md   # 마지막 phase 파일 매칭
```

**Self-check**: 마지막 phase 에 마킹 지시 + 단일 commit 포함 명시?

**`current_phase` 도 함께 갱신** (PR #62 review 추가): 위 sed 는 `status` 3건만 치환. `index.json` 의 `current_phase` 필드는 그대로 남아 "완료지만 phase 1 진행 중" 모순 발생. 마지막 phase 본문에 다음 1줄 sed 도 명시:

```bash
sed -i '' 's/"current_phase": 1/"current_phase": 2/' tasks/{plan}/index.json
grep -cE "\"current_phase\": {total_phases}" tasks/{plan}/index.json   # = 1
```

## 1-9. macOS BSD `sed` `\b` 미지원

**증상**: rename plan 에 `sed -i '' 's|foo\b|bar|g'`. macOS BSD `sed` 는 `\b` 미지원 → 0 매치.
검증: `echo "x.contentReview.y" | sed 's|contentReview\b|X|g'` → 변경 없음.
**왜**: 핵심 치환 누락, 빌드 / 타입 검증 실패하지만 phase 본문은 통과로 보일 수 있음.

**Good** (rename 시): `perl -i -pe 's/\bfoo\b/bar/g' file` (perl 은 `\b` 지원).

**Self-check**: rename / mass-replace plan 에 `sed \b` 사용? 있으면 perl 로 치환.

## 1-10. type 추가/삭제 phase 의 성공 기준에 `tsc --noEmit` 누락

**증상**: phase 성공 기준이 `pnpm build && pnpm test` 만 명시. 신규 type 정의/import/시그니처 변경을 포함한 phase 가 빌드/테스트 통과해도 tsc 검증을 우회 → 머지 후 다음 PR 에서 회귀 발견.
**왜**: tsup (esbuild) 과 vitest 모두 type-check 를 스킵. dooray-cli CI 도 historically `pnpm build && pnpm test` 만 돌림. type 회귀가 생산 build 에서는 안 보이고 type 전용 step (`tsc --noEmit`) 에서만 보인다.

**Good** (type 변경을 포함한 phase 의 성공 기준):
```bash
# 새/수정된 type 의 회귀 검사
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l
# 기대: <baseline 수치>  (변경 전 기준선 또는 0)
```

**검출 (plan 작성 시 grep)**: phase 본문에 `interface ` / `export type ` / `import type` / `: Promise<` / `: never` / 새 시그니처 추가 / catch 블록 패턴 변경 같은 키워드가 등장하는데 성공 기준에 `tsc --noEmit` 0건. → 누락.

## 1-11. plan 본문이 기존 함수 시그니처 미검증 → executor 빌드 실패

**증상**: phase 본문에 `await someExistingHelper(a, b, c)` 같은 코드 스니펫이 들어가는데 실제 `someExistingHelper` 가 `(a, b)` 2 인자만 받음.
  또는 반환 타입이 `Promise<void>` 인데 plan 본문이 결과를 변수에 받는 코드 작성.
  executor 가 plan 본문 그대로 작성 → 즉시 `TS2554: Expected N arguments, but got M` 또는 type 불일치.

**왜**: plan 작성자가 "이 함수가 이렇게 동작하면 좋겠다" 의도로 호출 시그니처를 쓰면서 실제 src 의 시그니처를 grep 으로 확인 안 함.
  critic 도 시그니처까지 grep 안 하면 놓침.
  executor 가 발견 + 자체 수정하는 경우도 있지만 (PR #64 사례) 시그니처가 직관에 반하는 경우 (예: `validateMandatoryTags` 가 입력 검증 아니라 mandatory 그룹 존재만 검사) 잘못된 분기 작성 가능.

**Good**: phase 본문에 외부 함수 호출 코드 스니펫을 쓸 때 (1) `grep -nE "^export (async )?function {함수명}" src/` 로 정확한 시그니처 확인, (2) 반환 타입까지 인용. 두 줄 검증이 plan 본문에 들어가야 critic 도 함께 검증 가능.

```bash
# plan 작성 시 (또는 critic 재평가 시) 검증:
grep -nE "^\s*(export )?async function (validateMandatoryTags|resolveTags|toNhnCloudCliError)\b" src/
# 인자 수 + 반환 타입 + 동작 (검증만 / 변환만 / 둘 다) 까지 plan 본문에 인용
```

**Why**: PR #64 (plan031) critic 재평가 — 1차 REVISE 반영 후 신규 Critical 1건 발견.
  plan 본문이 `validateMandatoryTags(client, projectId, effectiveTags)` 로 3인자 호출 작성.
  실제 시그니처는 `(client, projectId)` 2인자 + 입력 검증 안 함 (mandatory 그룹 존재 여부만).
  executor 가 알아서 `resolveTags` vs `validateMandatoryTags` 분기로 회피했지만 plan 본문 그대로 실행됐으면 tsc 실패 + 의도와 다른 검증.

**Self-check**: type 추가·변경·삭제를 포함한 phase 의 성공 기준 점검:
- `pnpm tsc --noEmit` 의 baseline 비교 명령이 있는가?
- CI 가 tsc 게이트를 돌리는 경우라도 phase 가드는 별도로 명시
- CI 는 PR scope 외 회귀까지 잡아주지만, phase 자체 검증은 plan-local

**Why**: PR #46 (post comment get) 가 `PostCommentDetailResponse` 를 사용했지만 import 누락.
  plan026 (PR #48) `await Promise<never>` 패턴이 TS2366 발생.
  둘 다 build/test PASS 로 머지 → 다음 PR 의 review-fix 단계에서야 발견.
  tsup 의 type-check 우회 특성은 dooray-cli 모든 type-touching phase 의 공통 함정.

## 1-12. type optional 완화 시 cascade 파일 grep 누락

**증상**: 기존 type 의 필드 `code: string` → `code?: string` 같은 optional 완화 / undefined 가능 변경을 plan 본문에 한 번 명시.
  그러나 해당 필드를 *사용하는* 다른 파일 (`commands/project/groups.ts` 의 `[g.id, g.code]` 같은 `string[][]` 단언) 에서 type narrowing 실패 → tsc 실패.
  plan 본문 `## 변경 파일` 섹션에 그 cascade 파일이 누락.

**Good**: type 변경 (특히 optional 완화 / 새 필드 추가 / 필드 제거) 을 plan 에 넣을 때 `grep -rn "\.{필드명}\b" src/` 로 모든 사용처 grep + `## 변경 파일` 에 추가.
  type narrowing 손실 가능성 (배열 element type, .map 결과 type, return type 추론 등) 도 같이 점검.

```bash
# plan 작성 시 (또는 critic 평가 시) 검증:
# 예: MemberGroup.code 를 optional 로 완화
grep -rn "\.code\b" src/ | grep -v "test\|\.md$"   # 사용처 전수 조사
grep -rn "MemberGroup\|CachedMemberGroup" src/    # type 참조 전수 조사
# 결과 파일들이 plan 의 `## 변경 파일` 에 모두 있는지 확인
```

**Why**: PR #67 (plan032) critic Major #1 — `MemberGroup.code: string → string | undefined` 완화로 `groups.ts:24` `[g.id, g.code]` 가 `(string | undefined)[][]` 가 되어 TS2322.
  plan 본문에 `groups.ts` 누락.
  executor 가 자체 `g.code ?? ""` 패치로 회피했지만 plan-only 실행이면 tsc 실패.
  다른 resolver 의 type 완화 작업 시 동일 패턴 재발 가능.

## 1-13. `.filter()` 후 TypeScript 타입 자동 미좁힘

**증상**: `arr.filter((x) => typeof x.field === "string")` 후 `arr.map((x) => ({ name: x.field }))` 작성.
  사람은 "필터 후니까 string 보장" 으로 이해하지만 TypeScript 는 filter callback 의 boolean return 으로 narrowing 안 함 → x.field 는 여전히 `string | undefined`.
  다음 사용처에서 type 불만족 (`NameRecord extends { name: string }` 위반 등) 으로 TS2345/TS2339.

**Good**: 두 가지 방법:
- **type predicate** (선호 — 안전): `.filter((x): x is X & { field: string } => typeof x.field === "string" && x.field.length > 0)` — TypeScript 가 narrowing 인지
- **`as string` 단언** (간단): `arr.map((x) => ({ name: x.field as string }))` + 단언 안전성 주석 (`// filter 로 string 보장`)

```ts
// BAD — narrowing 안 됨
const valid = groups.filter((g) => typeof g.code === "string");
const adapter = valid.map((g) => ({ name: g.code }));   // TS2345: string | undefined

// GOOD A — type predicate
const valid = groups.filter(
  (g): g is CachedMemberGroup & { code: string } =>
    typeof g.code === "string" && g.code.length > 0
);
const adapter = valid.map((g) => ({ name: g.code }));   // OK

// GOOD B — as string + 주석
const adapter = valid.map((g) => ({ name: g.code as string }));   // filter 로 string 보장
```

**검출**: type optional 완화 후 `filter` + `map` 체인이 plan 에 등장하면 narrowing 패턴 확인. 단언 사용 시 주석 필수.

**Why**: PR #67 (plan032) critic Major #3 — `member-group.ts` 의 `valid.map((g) => ({ name: g.code }))` 에서 TS2345/TS2339.
  executor 가 `as string` 추가로 회피.
  type predicate 가 더 안전하나 본 케이스는 단언 + 주석으로 처리.
  다른 resolver 의 optional 필드 filter 패턴에서 반복 가능.

## 1-14. nonInteractive trigger 확장 시 interactive 분기의 옵션 경고 정리 누락

**증상**: `nonInteractive` 진입 조건에 새 옵션을 추가 (`|| hasTagChange` 등).
  그러나 interactive `else` 블록에 기존에 있던 `if (hasOption) { stderr "...단독 사용 안 됨..." }` 경고를 그대로 둠.
  새 옵션이 trigger 에 포함됐으므로 else 분기에서는 절대 true 가 안 됨 → **dead code + 메시지가 사실과 반대** (단독 호출이 이번 기능의 핵심인데 "단독 호출 안 됨" 안내 출력 가능성 0이지만 의도 충돌).

**Good**: nonInteractive trigger 에 새 옵션 추가하는 phase 면 같은 phase 본문에 "interactive else 블록 안의 동일 옵션 경고 (`if (hasX)`) 제거" 를 명시. 또는 의도 주석으로 대체 ("trigger 에 포함되므로 도달 불가").

```bash
# 검출: nonInteractive 조건에 추가한 옵션이 interactive else 안에 if 로도 등장하면 dead code
grep -nE "if \(hasTagChange\)|if \(opts\.parent\)|if \(.*\.cc.*\)" src/commands/post/edit.ts
# 같은 옵션이 nonInteractive 조건 + interactive 분기 if 양쪽에 동시에 있으면 한쪽이 dead
```

**Why**: PR #68 (plan033) docs-verifier VIOLATION — `nonInteractive = ... || hasTagChange` 확장 후 interactive else 안에 `if (hasTagChange) stderr "단독 호출 안 됨"` 그대로 둠.
  도달 불가 + 메시지 정반대.
  cc/parent 같이 trigger 미포함 옵션의 경고 패턴을 그대로 적용할 때 발생.

## 1-15. resolver 의 검증 정책 일관성 — 신규 검증 helper 가 기존 정책 일부만 포함

**증상**: 기존 `resolveTags` 가 mandatory + selectOne 둘 다 검증.
  새 helper `validateMandatoryCoverage` 추가 시 이름이 "Mandatory" 라 mandatory 만 검증하고 selectOne 누락.
  post create 는 정책 모두 검사하는데 post edit (신규 helper) 는 mandatory 만 → 정책 비대칭.

**Good**: 같은 도메인의 신규 검증 helper 추가 시:
- reference function (resolveTags, resolveUsers 등) 의 검증 블록을 grep 으로 모두 인용
- 새 helper 가 어떤 정책을 포함/제외하는지 plan 본문에 명시
- 이름이 한 정책만 가리켜도 실제 검증은 reference 와 일치해야 일관성 유지

```bash
# resolver 의 검증 블록 grep — phase 본문 작성 시 reference function 참조
grep -nE "selectOne|mandatory|MandatoryGroups|SelectOneGroups" src/resolvers/tag.ts
# 신규 helper 가 위 정책 중 어느 것을 포함하는지 plan 본문에 명시
```

**Why**: PR #68 (plan033) code-reviewer MEDIUM — `validateMandatoryCoverage` 가 mandatory 만 검증, selectOne 누락. `resolveTags` 는 둘 다 검증이라 post create 와 post edit 의 정책 비대칭.
  다른 helper 분리 시 (예: `validateUsersCoverage`, `validateWorkflowChange` 등) 동일 패턴 재발 가능.

## 1-16. executor 가 critic 평가 결과 대기 안 하고 자체 구현 진행

**증상**: build-with-teams 5단계 critic 평가 (APPROVE/REVISE) → 6단계 executor 실행.
  그런데 executor 가 5단계 critic 회신을 받기 전에 plan 본문만 보고 자체 구현 시작.
  critic REVISE 가 도착해도 이미 옛 plan 본문 기준으로 코드 작성 + 사용자 결정 반영 안 됨 (이름·시그니처 임의).
  team-lead 가 reset 후 재투입 필요 → 1 cycle 낭비.

**Good**: executor 프롬프트에 "team-lead 의 phase 시작 SendMessage 받기 전에는 자체 진행 금지 — critic REVISE 가능성 있음" 명시.
  team-lead 도 executor 스폰 시점에 "대기 상태로 시작, SendMessage 까지 작업 시작 금지" 강조.
  또 plan 본문 v1 → v2 차이가 있을 때 SendMessage 메시지에 "이전 자체 진행 결과는 reset 됨, plan 본문 v2 강제" 명시.

**Why**: PR #64 (plan031) / PR #67 (plan032) / PR #68 (plan033) 3회 연속 발생.
  plan031 때는 executor 가 알아서 critic 발견 패턴 회피했지만, plan032/033 에서는 사용자 결정 옵션 a 와 다른 옵션 b 변형으로 진행 → reset 후 재투입.
  매 plan 마다 1 cycle 낭비.
  critic 평가가 비동기로 도착하는 점이 근본 원인.
  executor 가 "대기" 명시받지 않으면 자체 진행 본능적 경향.

## 1-17. plan-and-build 표준 task 를 build-with-teams 로 실행 시 마지막 phase commit/push 책임 충돌

**증상**: `/planning` + `task-create` 로 작성된 task 의 마지막 phase 가 "commit + push + index.json 마킹" 을 한 묶음으로 담음 (plan-and-build 표준).
  이 task 를 build-with-teams 로 실행하면 executor 가 그 지시대로 `git commit`/`git push`/`gh pr` 까지 수행 → team-lead 의 phase 별 atomic commit + 최종 PR 책임과 충돌.
  특히 마지막 phase 모델이 haiku 면 지시를 문자 그대로 실행할 확률이 높아 더 위험.
  부수적으로 phase 들의 `# cwd:` 가 main repo 절대경로로 하드코딩돼 있으면 worktree 가 아닌 main 에서 실행돼 오염 (1-4 와 연관).

**Good**: build-with-teams 로 plan-and-build 표준 task 를 실행하기 전 critic 평가 단계에서 다음을 보정:
- 마지막 phase 를 "index.json 완료 마킹만" 으로 축소. commit/push/PR 문구 제거 + "team-lead 가 마킹과 함께 최종 commit·push·PR 수행" 명시. 성공 기준에서 `git log`/`git status --porcelain` 검사 제거, index.json 마킹 grep 만 유지.
- 모든 phase 의 `# cwd:` 를 `<레포 루트>` 플레이스홀더로 교체하고, executor 에게 worktree 절대경로를 스폰 프롬프트로 전달.

**Self-check**: build-with-teams 로 실행하려는 task 의 마지막 phase 가 `git commit`/`git push`/`gh pr` 를 담고 있는가? 담겨 있으면 마킹만 남기고 commit/push 책임을 team-lead 로 이관했는가?

**Why**: PR #1 (plan001) — plan-and-build 표준으로 작성된 task 를 build-with-teams 로 실행. critic 이 phase-07 의 commit/push 책임 충돌 + 7개 phase cwd 하드코딩을 REVISE 로 잡음. plan-and-build 표준 task 를 build-with-teams 로 재실행할 때마다 재발 가능.
  PR #2 (plan002) 재발 확인 — phase-06 이 동일하게 commit/push 를 담고 6개 phase cwd 가 main 절대경로였음. critic 이 다시 CRITICAL 로 잡음. 두 번 연속 재발했으므로 근원(`planning` / `task-create`)에서 마지막 phase 를 "마킹만 + cwd 플레이스홀더" 로 생성하도록 고치는 것이 정석. 그 전까지는 critic 단계 보정에 의존.
  PR #9 (plan007) 세 번째 재발 — phase-01/02 의 `# cwd:` 가 main repo 절대경로. critic 이 MAJOR 로 잡아 worktree 경로로 보정 후 APPROVE. 근원 수정 착수 — plan-and-build SKILL "Phase 프롬프트 작성 핵심 규칙" 9번에 "성공 기준 bash 블록 cwd 는 절대경로 금지 → `<레포 루트>` 플레이스홀더" 규칙 추가. 이후 task 생성부터 cwd 하드코딩이 안 나오는지 확인 필요.

## 1-18. 신규 명령 task 가 영향 표 필수 사용자 가이드 docs 를 "범위 외" 로 스킵

**증상**: 신규 CLI 명령 task 의 마지막 (사용자 가이드) phase 가 `skills/nhncloud-cli/SKILL.md` 만 작성하고 `README.md` 사용 예 섹션을 "PoC 범위 외" 로 명시 스킵.
  planning SKILL 8단계 A항 "변경 유형별 docs 영향 표" 의 "신규 CLI 명령" 행은 README.md 사용 예 + CLAUDE.md "N개 명령 카운트" 를 **필수** (조건부 아님) 로 표시 → docs-verifier UPDATE_NEEDED.

**Good**: 신규 명령 task 의 phase 작성 시 영향 표 해당 행이 필수로 표시한 docs 를 모두 phase 작업 목록에 포함. "PoC 라서 생략" 판단으로 표의 필수 항목을 빼지 않는다 (표가 단일 소스).
  CLAUDE.md 는 결정 doc 이라 phase 안에서 못 고치므로, team-lead 가 phase 루프 밖 별도 commit 으로 "N개 명령 카운트" 보완.

**Self-check**: 신규 명령 phase 가 영향 표의 README/SKILL/CLAUDE 필수 항목을 모두 다루는가? "범위 외" 로 표의 필수 항목을 뺀 곳이 없는가?

**Why**: PR #1 (plan001) — phase-06 이 "README.md 는 PoC 범위 외" 로 명시 스킵했으나 영향 표는 README 사용 예를 필수로 요구 → docs-verifier UPDATE_NEEDED. 신규 명령마다 재발 가능.

**메타 문구 누락 보강 (PR #10·#11 연속 관측)**: 사용 예 섹션은 갱신하면서 **README intro "지원 명령" 문구 + `skills/nhncloud-cli/SKILL.md` 프론트매터 description + 본문 명령 목록** 을 빠뜨리는 누락이 008·009 연속으로 docs-verifier UPDATE_NEEDED 를 유발했다. 이 셋은 명령 본문 추가와 떨어진 "한 줄 요약"이라 잊기 쉽다.
  - **backlog 일괄 생성 task 의 함정**: 008·009 처럼 docs sweep 으로 미리 만든 phase 파일은 **회고 이전에 작성**되어, 회고로 planning 영향 표를 보강해도(008 PR #10 에서 intro/description 을 표에 추가) 그 phase-02 작업 목록에는 반영돼 있지 않다. executor 는 영향 표를 능동 대조하지 않고 phase 작업 목록을 따르므로 또 놓친다.
  - **대응**: backlog task 를 build-with-teams 로 돌릴 때 team-lead 가 executor 스폰 프롬프트에 "새 명령 추가 시 README intro 지원 명령 문구 + SKILL 프론트매터 description + 본문 명령 목록도 갱신" 을 명시한다 (영향 표 보강만으로는 backlog phase 에 소급 안 됨).
  - **SKILL.md 는 두 곳 (PR #11·#13 연속 재발)**: 프론트매터 `description`(line 3, 파일 최상단 메타) 과 본문 명령 목록·매핑 표는 **별개 위치**다. executor 가 "SKILL 갱신" 을 받으면 눈에 띄는 본문(사용 예·매핑 표)만 고치고 프론트매터 description 을 빠뜨리는 사고가 반복된다(009 PR #11, 011 PR #13 둘 다 docs-verifier 가 프론트매터 description 만 UPDATE_NEEDED). 스폰 프롬프트에서 "프론트매터 description(line 3) **과** 본문 명령 목록 **둘 다**" 로 분리해 명시한다. 프론트매터 description 은 AI 에이전트의 스킬 선택 트리거라 누락 시 새 명령이 자연어 매칭에서 빠진다.

## 1-19. 검증 helper 가 캐시 우선(cache-first) 함수를 재사용 → false-positive

**증상**: 자격증명·연결 검증 helper 가 기존 캐시 우선 getter (예: `getAccessToken` 이 `readToken(profile)` 캐시 히트 시 외부 호출 생략) 를 그대로 재사용.
  캐시 키가 검증 대상 (UAK 값) 이 아니라 다른 축 (profile) 기준이면, **틀린 입력인데도 직전 유효 캐시가 남아 있어 검증이 통과** (false-positive).
  configure 재실행 시 틀린 UAK 재입력 → 직전 profile 토큰 캐시 히트 → verify 가 성공으로 오판. "검증 없으면 잘못된 키를 실제 명령에서야 발견" 이라는 검증 도입 취지 자체를 무력화.

**Good**: 검증/테스트 helper 는 **반드시 캐시를 우회**한다.
- 재사용 함수에 `forceRefresh?: boolean` 추가 (true 면 캐시 읽기·쓰기 양쪽 건너뜀). 기존 호출은 default false 로 동작 유지.
- verify helper 가 `forceRefresh=true` 로 호출. plan 본문에 "캐시 우회 필수" 명시 + 성공 기준에 `grep forceRefresh` 추가.

**Self-check**: 새 검증/테스트 helper 가 재사용하는 함수가 캐시·메모이즈를 하는가? 그 캐시 키가 검증 대상 값과 무관한 축이면 우회 경로를 뚫었는가?

**Why**: PR #3 (plan003) critic MAJOR — `verifyUserAccessKey` 가 캐시 우선 `getAccessToken` 재사용. 캐시는 profile 키라 틀린 UAK 도 false-positive. 향후 다른 검증 helper (토큰·세션·연결 테스트) 가 캐시 우선 함수를 재사용할 때 재발 가능.

## 1-20. on-disk 구조에 대해 phase 가 복수 옵션 허용 → 단일 소스 docs 와 불일치

**증상**: type/스키마 phase 작업목록이 직렬화 구조를 "A 또는 B 중 깔끔한 쪽 선택" 으로 둘 다 허용.
  executor 가 data-schema.md (단일 소스) 와 다른 쪽을 택하면 on-disk JSON 이 이미 commit 된 docs 및 기존 읽기 경로와 불일치.
  예: data-schema 는 `profiles.X.{ userAccessKey, logncrash }` flat sibling 인데 phase 가 nested `services:` 래퍼 옵션도 허용 → 후자 선택 시 기존 `getServiceCredential` 읽기 경로 파손.

**Good**: 디스크에 직렬화되는 구조는 plan 본문에서 **단정** (옵션 제시 금지). data-schema.md 가 단일 소스이므로 그 구조를 그대로 못박는다.
  내부 메모리 표현은 자유롭게 두되, on-disk 형태는 docs 와 1:1.

**Self-check**: type/스키마 phase 가 디스크 직렬화 구조에 "또는" 으로 복수 옵션을 남겼는가? data-schema.md 와 정확히 일치하는 단일 구조로 단정했는가?

**Why**: PR #3 (plan003) critic MAJOR — phase-01 이 flat union 과 nested `services:` 를 둘 다 허용. data-schema.md 는 flat sibling 단일 소스라 nested 선택 시 불일치 + 읽기 경로 파손. 스키마 변경 phase 마다 재발 가능.

## 1-21. phase 간 punt 한 산출물이 받는 phase 에 작업항목으로 없음 (고아 참조)

**증상**: phase A 가 "이건 phase B 에서 만든다" 고 미룬(punt) 산출물이, 정작 phase B 작업목록에는 없음.
다른 phase 가 그 산출물을 전제 (예: forceRefresh 를 "verify 용" 이라 설명) 하는데도 생성 task 자체가 누락 → executor 가 "다른 phase 가 한다" 고 믿고 아무도 안 만듦.
예: phase-1 이 `verifyIaas` 를 "phase 3 에서 추가" 라 적었으나 phase-3 작업목록에 0건. token 발급 함수 (`getIaasToken`) 가 phase-2 라 의존상 phase-3 에서 못 만드는데도 punt 대상이 틀림.

**Good**: punt 하는 산출물은 (1) 받는 phase 번호를 정확히 (의존성 기준) 지정하고, (2) 그 받는 phase 작업목록에 실제 작업항목 + 성공기준 grep 을 넣는다.
punt 표현 (`phase N 에서 추가 예정`) 을 쓴 산출물 이름을 grep 해 받는 phase 에 실재하는지 확인.

**검출**:
```bash
# punt 문구에서 산출물 이름 추출 → 받는 phase 에 작업항목으로 있는지
grep -rnE "phase [0-9]+ 에서|예정|추가한다" tasks/{plan}/
# 각 산출물 이름을 받는 phase 파일에서 grep — 작업목록 + 성공기준 양쪽에 있어야 함
```

**Self-check**: punt 한 산출물마다 받는 phase 번호가 의존성상 가능한가? 그 phase 작업목록 + 성공기준에 실제로 등장하는가?

**Why**: PR #6 (plan004) critic MAJOR — phase-1 이 `verifyIaas` 를 phase-3 으로 punt 했으나 phase-3 에 작업항목 0건. token 발급이 phase-2 라 phase-3 에선 못 만드는 의존성 오류까지 겹침. 검증 helper·헬퍼 추출을 다른 phase 로 미루는 작업마다 재발 가능.

## 1-22. 성공 기준이 핵심 위험을 enforce 못함 (구조 검사만 / 변별력 없는 grep)

**증상**: phase 성공 기준이 `tsc`·`build`·구조 grep 만 담아, 그 task 의 *진짜 위험* 을 자동으로 막지 못한다. 자율 pipeline 에서 estimate·누락이 green 으로 통과한다. 두 갈래:
- **실측 미강제**: "추측 금지·실측 확정" 이 전제인 task 인데, 성공 기준에 실측을 강제하는 게이트가 없어 추정값으로 코드를 채워도 전부 통과 (예: 새 endpoint host/경로 estimate).
- **변별력 없는 docs grep**: `grep -c 'image'` 처럼 **기존 텍스트로도 통과**하는 토큰을 검증에 써서, 신규 행을 안 넣어도 green (false-pass). PR #10·#11 의 docs drift 학습이 정확히 이 구멍으로 다시 샜다.

**Good**:
- 실측 필요 task 는 성공 기준에 forcing function 을 넣는다 — 실측 후 제거되는 `⚠️ 추정값` 주석 잔존 0 검사, 또는 실측 결과(HTTP status 등) 기록 + 실패 시 `PHASE_BLOCKED`.
- docs 검증 grep 은 **신규 고유 토큰**(`instance images`·`listImages` 등 그 변경으로만 생기는 문자열)으로 한다. 기존 코드/문서에 이미 있는 부분문자열(`image`·`--image`) 금지. 편집 전 baseline 이 0 인지 확인.

**검출**:
```bash
# phase 성공 기준의 docs grep 이 기존 텍스트로도 통과하는지 — 편집 전 baseline
git stash; grep -c '<검증토큰>' <docs>; git stash pop   # baseline >0 이면 변별력 없음
```

**Self-check**: 이 task 의 핵심 위험(실측 확정 / 신규 docs 행 / 런타임 불변식)이 성공 기준의 자동 검사로 *실제로 막히는가*? 추정값·누락 상태로 성공 기준을 전부 통과시킬 수 있으면 게이트가 비어 있는 것.

> **자기참조 grep 함정 (PR #19/plan014)**: 성공 기준이 `grep -c "<토큰>" 같은_파일.md` 형태인데 `<토큰>` 이 **그 grep 명령줄 자체에도 등장**하면 항상 ≥1 을 반환해 "기대 0" 을 절대 만족 못 한다(placeholder 완성 여부 검사에서 흔함). grep 을 절(`sed -n '/## 시작/,/## 끝/p' | grep`)로 한정하거나, 검사 대상이 사전 충전돼 의미 없으면 기준을 삭제한다.

**Why**: PR #12 (plan010) critic 2 MAJOR — ① image endpoint 실측이 성공 기준에 없어 estimate 완료 가능, ② docs 검증이 `grep -c 'image'` 라 기존 `--image` 텍스트로 통과. 둘 다 성공 기준 문구를 forcing/변별 토큰으로 바꿔 해소. 외부 의존 실측·신규 docs 행이 있는 task 마다 재발 가능.

## 1-23. 새 endpoint (다른 host·인증) 의 응답 봉투 형태를 docs 대조 없이 "(확정)" 으로 단정

**증상**: 기존 서비스와 host·인증이 다른 새 endpoint 를 추가하면서, 응답 봉투 형태(예: `header` 중첩 vs flat)를 기존 코드 패턴으로 가정하고 phase 본문에 "(확정)" 으로 적는다.
host·인증이 다르면 응답 형태도 다를 개연성이 큰데, 코드가 `res.header.isSuccessful` 로 단정하면 실제가 flat 일 때 `header` undefined → TypeError → catch 로 빠져 **전송 성공인데도 "오류"로 보고**되는 묻혀버린 실패가 된다.

**Good**: phase 작성 시 새 endpoint 의 응답 예제 JSON 을 **공식 docs 에서 인용**해 형태를 못박는다 (CLAUDE.md "API 스펙 확인 절차" — response body 구조도 docs 예제로 대조, 추측 머지 금지). docs 로도 불확정이면 (a) HTTP 2xx 를 성공으로 판정하고 body 는 방어적으로만 검사하거나 (b) 실측으로 확정한다. ADR 본문에도 응답 형태 확정 근거(어느 docs 예제)를 남긴다.

**Self-check**: 새 endpoint 의 응답 판정 코드(`res.header...` 등)가 추측이 아니라 docs 예제 인용 또는 실측 근거를 갖는가? 자동 성공 기준이 실제 전송을 안 한다면 이 형태 오류는 수동 QA 에서만 드러난다 — 머지 전 수동 QA 를 성공 기준에 명시했는가?

**Why**: PR #16 (plan012) critic MAJOR — logncrash collector 응답을 `header.isSuccessful` 로 단정("확정"). 실제로는 docs 가 검색과 동일한 중첩 봉투임을 확인해 통과했으나, 확인 전엔 flat 가정 리스크가 열려 있었다. 새 서비스·새 host endpoint 추가마다 재발 가능.

## 1-24. backlog task 의 phase 가 결정 docs(adr/CLAUDE/flow/code-architecture) 편집을 묶음 → 갱신 시점 분리 위반

**증상**: 미리 만들어 둔(backlog) task 의 phase-01 이 코드 + `docs/adr/NNN-slug.md`(ADR 본문) + `CLAUDE.md`(카운트·표) + `docs/flow.md` + `docs/code-architecture.md` 편집을 한 phase 작업 목록에 묶어 executor 에게 지시한다.
planning SKILL "갱신 시점 분리" 표는 이 6개를 **결정 docs = planning 단계 즉시 반영(team-lead docs-first)** 으로 규정하고, phase 안 편집을 critic REVISE / docs-verifier VIOLATION 사유로 본다. 묶으면 executor in-phase 편집 + team-lead out-of-loop 편집이 겹쳐 이중 편집·소유권 모호가 된다.

**Good**: build-with-teams 로 backlog task 를 돌릴 때 **team-lead 가 실행 전에 결정 docs 를 phase 에서 떼어내 docs-first commit 으로 분리**하고, phase 변경 파일을 코드(+ 마지막 phase 의 README/SKILL)만 남긴다. 신규 ADR 동반 task 는 거의 항상 이 분리가 필요하다 — backlog 라 회고 이전 작성이면 phase 본문이 옛 구조(docs 묶음)일 수 있으니 plan{N} 마다 선제 확인한다.

**Self-check**: phase 변경 파일에 `docs/adr/`/CLAUDE.md/flow.md/code-architecture.md 가 있는가? 있으면 team-lead docs-first 로 이관하고 phase 는 코드 전용으로 줄였는가? 성공 기준의 결정-docs grep(ADR grep·카운트 grep)도 phase 에서 빼 docs-verifier 로 이관했는가?

**Why**: PR #16 (plan012) critic MAJOR — phase-01 이 ADR-014 + CLAUDE.md + flow + code-architecture 편집을 묶어 pitfall 1-18·갱신 시점 분리와 충돌. team-lead docs-first 분리로 해소. plan012~019 처럼 일괄 생성된 backlog task 군은 모두 같은 구조라 매 plan 재발 가능 — 실행 전 선제 분리.

> **변형 (실측 의존 결정 docs)**: 결정 docs 내용이 phase 의 **실측 확정값**(예: endpoint host, API 가 받는 id 종류)에 의존하면, team-lead 가 docs-first 를 코드 phase **이전**이 아니라 **이후**(실측값 반영 후) 별도 commit 으로 작성한다. 소유권(team-lead)은 유지, 타이밍만 코드 뒤로. commit 순서: feat(코드) → docs(결정) → docs(공개). repo 의 ADR-013(image)·ADR-013 보강(network)이 실측 후 작성된 선례 — PR #17(plan013).

## 1-25. source-feeding 명령의 round-trip 미검증 — list 가 내놓는 id 가 소비 명령에 실제 먹히는지 안 봄

**증상**: 새 "조회/목록" 명령의 존재 이유가 다른 명령의 인자 소스("이 `list` 의 id 를 `create --X` 에 넣어라")인데, 실측·docs 가 **목록 API 가 200 인지**만 확인하고 **그 id 가 소비 명령에 실제 round-trip 되는지**는 확인 안 한다.
공개 docs(README/SKILL)·CLI help(`.description`)에 "이 id 를 --X 에 그대로" 단정을 ship 하는데, 실제로는 다른 id(상위/하위 리소스 id)를 요구하면 사용자가 발급 실패하고 원인을 못 찾는다.

**Good**: source-feeding 명령은 **round-trip 을 명시 검증**한다 — (a) 소비 명령(`create` 등)의 해당 인자 docs 예제로 어느 id 인지 확인, (b) read-only 로 기존 리소스의 첨부 정보(`get`/`list --json`)에서 그 id 가 어느 목록의 id 와 일치하는지 대조, (c) 불확정이면 동의 하 1회 테스트로 확정. 확정 전엔 docs·`.description` 에서 "그대로 --X 에" 단정을 빼고 보수 표기. 확정 결과를 모든 docs(README/SKILL/flow/ADR/CLAUDE)+CLI help 에 일관 반영.

**Self-check**: "이 list 의 id 를 다른 명령 인자로" 라는 주장이 있는가? 그 id 가 소비 명령에 실제 먹히는지(상위 vs 하위 리소스 id) 확인하는 단계가 실측·수동 QA 에 있는가? CLI `.description` 같은 바이너리 ship 텍스트의 단정도 확정에 맞췄는가? **`index.json` 의 `description` 필드도 고쳤는가** — 단정 완화 시 phase 본문·README·SKILL·`.description` 은 손대면서 task 메타데이터(index.json description)를 빠뜨리기 쉽다(PR #20/plan015 critic MAJOR — 거기만 옛 단정 잔존). 소비처 옵션이 **아직 없으면**(consumer 미존재 — grep 으로 확인) round-trip 자체가 불가하니 docs 에서 그 연계 단정을 전부 뺀다.

**Why**: PR #17 (plan013) critic MAJOR — `network list` 의 VPC id 가 `instance create --network` 에 먹히는지 미검증인 채 docs 단정. 실측(인스턴스 addresses=VPC name 1:1)으로 "VPC id = --network" 확정 후 반영. availability-zone·floating-ip 등 "조회→다른 명령 인자" 구조마다 재발 가능.

## 1-26. 쓰기 작업(resize/attach/create/delete) plan — live 실측 자율 실행 대신 표준 설계 + 수동 QA + 정정 loop

**증상**: 새 명령이 실제 클라우드 리소스를 변경(쓰기)하는데, phase-01 이 "실제 호출로 동작 확정(실측)" 을 executor 작업으로 둔다. executor 가 자율로 리소스를 생성/변경/삭제하면 비용·다운타임·되돌리기 어려움이 발생한다(사용자 자원).

**Good**: 쓰기 plan 은 (a) **동작을 docs/표준으로 확정**한다(예: OpenStack Nova v2 resize 2단계는 표준 — VERIFY_RESIZE 후 confirm/revert, ADR-010 으로 NHN=Nova v2 확립). (b) **코드는 가능한 동작 분기 모두에 견고**하게 작성(예: fire-and-return + 사용자 `get` 확인 → 자동/수동 confirm 어느 쪽도 사용자를 가두지 않음). (c) **live 쓰기 실측은 수동 QA(사용자)** 로 남긴다 — executor 자율 실행 금지. (d) **QA contingency loop** 한 줄: "QA 가 표준 추론과 어긋나면 PR review-fix 로 명령 surface·카운트·docs 정정". build-with-teams 의 자동 성공 기준은 자격증명 없이 검증되는 부분(tsc/build/help/exit code)만 두고, live 부분은 "수동 QA" 절로 분리한다.

**Self-check**: 이 명령이 쓰기 작업인가? phase-01 의 "실측" 이 executor 자율 live 호출을 요구하는가 → 수동 QA 로 바꾸고 동작은 docs/표준 근거로 확정했는가? 코드가 동작 분기 양쪽에 견고한가? 표준 추론이 틀릴 때의 정정 loop 가 문서화됐는가?

**Why**: PR #19 (plan014) — `instance resize` 는 쓰기 작업이라 사용자 정책상 live 호출을 수동 QA 로 남기고, Nova v2 표준 + ADR-010 근거로 (B) 수동 confirm 확정, 코드는 (A)/(B) 양쪽 견고. plan017(volume attach/detach)·018(floating ip create/delete) 등 쓰기 plan 마다 재발.

> **변형 (backlog "선행 의존" hedge stale)**: 백로그 plan 의 phase 가 "선행 task X 폴더가 아직 없으니 먼저 만들라/사용자 확인하라" 같은 hedge 를 담는데, 실행 시점엔 X 가 **이미 머지돼 base 에 존재**하는 경우. executor 가 그 hedge 를 보고 halt 하거나 엉뚱하게 선행 폴더 신설을 시도할 위험. team-lead 가 실행 전 grep 으로 선행이 base 에 있는지 확인하고 hedge 를 "이미 머지 완료 — 검증: grep ≥1" 로 교체한다. PR #22(plan017) — phase-01 이 013(network)을 "아직 없음" 으로 기술했으나 이미 머지됨.

## 1-27. "기존 X 패턴과 동일" 이라 적고 코드 블록은 **수정 전 옛 버전**을 보여줌 + bot 차단 docs 를 "확정" 으로 단언

**증상 A (stale code in reuse-claim)**: plan 이 `(011 의 parsePositiveInt 패턴과 동일)` 처럼 기존 helper 재사용을 주장하면서, 보여준 코드 블록은 그 helper 가 **이미 고친 옛 버전**(예: regex 대신 `Number()`)이다. executor 가 literal 복사하면 이전에 잡았던 결함(4-4 등)이 재도입된다 — 주장↔코드 모순.
**증상 B (bot-blocked docs 확정)**: docs 가 봇차단(WebFetch 제한)인데 endpoint 경로(단/복수)·응답 형태·필드 타입을 "(확정)" 으로 단언. CLAUDE.md "API 스펙 확인 절차"(추측 머지 금지)와 충돌.
**증상 C (1-24 헤딩 잔존 모순)**: 1-24 분리를 적용하며 "team-lead docs-first" 노트는 넣었으나 옛 섹션 헤딩 `## 내부 docs 반영 (이 phase 안에서)` 를 안 고쳐 두 지시가 정면 충돌.

**Good**:
- A: "동일" 주장 시 **실제 파일을 grep 으로 열어 현재(수정 후) 코드를 그대로 복사**한다. `import`·helper·가드는 reference 파일의 라인을 인용. literal 단일 줄 import 는 "기존 블록에 merge(교체 금지)" 로 명시.
- B: bot 차단 docs 항목은 "(확정)" → **"실측 pending — 수동 QA 1차 호출로 확정"** 으로 격하하고 ⚠️ 표시. 쓰기 작업이면 어차피 수동 QA(1-26)라 거기서 함께 확정. 코드는 분기 양쪽에 견고하게 + 어긋날 때의 review-fix 경로 명시.
- C: 1-24 적용 시 **옛 헤딩까지** `## ... (team-lead docs-first — executor 범위 밖)` 로 고친다 (노트만 추가하지 말 것).

**Self-check**: "기존 X 와 동일/재사용" 주장의 코드가 실제 파일과 1:1 인가(grep 대조)? 새 타입 검증이 기존 가드보다 **과하게 엄격**하지 않은가(number|string 관용)? bot 차단 docs 를 "확정" 으로 단언한 곳이 있는가? 1-24 분리에서 옛 헤딩이 "이 phase 안에서" 로 남아 있는가?

**Why**: PR #21 (plan016) critic 4 MAJOR — parsePositiveInt 옛 약화 버전 재도입(A) · binaryKey number 강제(과엄격) · download 응답/endpoint "확정"(B) · 내부 docs 헤딩 모순(C). 모두 reference 코드 grep 대조 + 실측 pending 격하 + 헤딩 통일로 해소. "기존 패턴 재사용" + "bot 차단 API" plan 마다 재발.

## 1-28. 이미 버전 segment(`/v2.0`·`/v2`)를 포함한 endpoint base 에 경로를 붙이며 버전을 또 붙임 → 이중 prefix(404)

**증상**: 기존 서비스 client 의 endpoint base(`networkEndpoint`·`blockStorageEndpoint`·`imageEndpoint` 등)가 이미 API 버전 segment 를 포함(`https://host/v2.0`)하는데, 새 메서드 URL 을 `${this.networkEndpoint}/v2.0/floatingips` 처럼 버전을 **다시** 붙인다 → 실제 호출은 `https://host/v2.0/v2.0/floatingips` 로 404.
같은 파일의 기존 메서드(`${this.networkEndpoint}/vpcs`)와 내부 모순인데, tsc·`--help` 성공 기준은 URL 문자열을 실행하지 않아 잡지 못하고 수동 QA 첫 호출에서야 404 로 드러난다. plan 이 endpoint 재사용을 주장할수록(같은 catalog type) 재발한다.

**Good**: endpoint 재사용 plan 은 **base 가 버전 segment 를 이미 포함하는지 reference 메서드로 확인**한 뒤 경로만 붙인다.
- 새 메서드 작성 전 기존 메서드 URL 을 grep: `grep -n "this.<endpoint>}" src/services/<svc>/client.ts` → `${...}/vpcs`(버전 없음)면 base 에 버전 포함 → 새 메서드도 `${...}/floatingips`(버전 빼고).
- phase 성공 기준에 음수 검증 grep 추가: `grep -c "<endpoint>}/v2" client.ts` = **0** (base 가 버전 포함일 때).

**Self-check**: endpoint base 변수가 host 만인가, 버전까지 포함하나(`keystone.ts`·endpoint 해석부에서 확인)? 새 URL 이 기존 형제 메서드와 같은 prefix 깊이인가? base 가 버전 포함이면 새 경로에 `/v2`·`/v2.0` 리터럴이 없는가?

**Why**: PR #23 (plan018) critic CRITICAL — floatingip 6개 메서드 전부 `${networkEndpoint}/v2.0/...` 로 이중 `/v2.0`. networkEndpoint 가 이미 `https://host/v2.0`(keystone.ts) 라 전 명령 404. 6곳 모두 `/v2.0` 제거로 해소. compute/image/network/blockstorage 처럼 버전 포함 base 를 공유하는 IaaS 명령마다 재발 가능.

## 1-29. list/조회 명령의 출력 컬럼을 docs 에 적을 때 실제 `headers: [...]` 배열과 1:1 누락

**증상**: 새 `list` 명령의 가시 컬럼을 CLAUDE.md·flow.md·README 에 "(id·name·status, 전체는 --json)" 식으로 적으면서, 실제 `output()` 의 `headers: [...]` 배열보다 **컬럼을 빠뜨린다**(예: headers 5개인데 docs 엔 4개). 사용자가 docs 만 보고 특정 컬럼이 안 나온다고 오인하거나, docs 에만 있는 유령 컬럼을 기대한다 — 문서 부패(A).

**Good**: 출력 컬럼을 docs 에 나열할 땐 **command 의 `headers` 배열을 grep 해 그대로 옮긴다**.
- `grep -n "headers:" src/commands/<svc>/<cmd>.ts` → 배열 원소를 docs 컬럼 설명과 1:1 대조.
- 컬럼이 4개 이상이면 모두 적거나 "주요 N개 + 전체는 --json" 로 명시(임의 누락 금지).

**Self-check**: docs 의 "(컬럼1·컬럼2·…)" 가 실제 `headers` 배열 길이·원소와 일치하는가? CLAUDE.md·flow.md·README 세 곳의 컬럼 나열이 서로, 그리고 코드와 일관되는가?

**Why**: PR #23 (plan018) docs-verifier UPDATE_NEEDED — `floatingip list` headers 는 `[id, floating_ip_address, status, port_id, fixed_ip_address]` 5개인데 CLAUDE.md·flow.md 가 `fixed_ip_address` 누락한 4개로 기재. 두 곳 보강으로 해소. 새 list 명령마다 재발 가능.

> **확장 — 옵션 표도 동일**: README/SKILL 의 새 명령 **옵션 목록**도 commander `.option(...)` 정의와 1:1 이어야 한다. 특히 수치 옵션의 범위·기본값(`--size` 범위 10~100·기본 100)을 docs 에 빠뜨리면 사용자가 허용값을 모른다. `grep -nE "\.option\(" src/commands/<svc>/<cmd>.ts` → README/SKILL 옵션 표와 대조. (PR #24 plan019 docs-verifier UPDATE — export `--size` 범위·`--profile` 가 README 표에 누락.)

## 1-30. plan 의 REVISE/FIX 수정이 자기 plan 의 성공기준 grep 토큰·회피항목을 깨뜨림 (변경 전파 누락)

**증상**: REVISE 반영으로 코드의 **문자열(에러 메시지·상수·식별자)을 바꿨는데**, 그 문자열을 부분일치로 검사하던 **성공기준 grep 토큰**이나 **회피 항목의 예시 문구**를 같이 안 고친다. 결과: (a) 올바른 구현인데 성공기준이 옛 토큰을 못 찾아 **false-fail**, (b) 그 false-fail 을 "고치려고" executor 가 옛 문자열을 도로 넣어 **방금 한 수정이 되돌아간다**.

**Good**: 문자열을 바꾸는 수정은 **그 문자열을 참조하는 모든 곳을 같은 수정에서 갱신**한다.
- 바꾼 문자열을 plan 전체에서 grep: `grep -n "<옛 토큰>" tasks/<plan>/phase-*.md` → 성공기준·회피항목·docs 인용 전부 새 토큰으로.
- 성공기준 grep 토큰은 **변경에 안정적인 마커**를 고른다 — 자주 바뀌는 단정 문구 대신 구조적 마커(`원인:` 같은 "원본 보존" 표식).
- 회피 항목이 옛 메시지를 "예시"로 들고 있으면 구현과 어긋나므로 같이 갱신 — executor 가 회피항목을 스펙으로 읽고 되돌릴 위험 차단.

**Self-check**: 이번 수정이 바꾼 문자열(메시지·상수)을 grep 하는 성공기준이 있는가? 그 grep 토큰이 새 문자열과 일치하는가? 회피항목·docs 인용에 옛 문자열이 남았는가?

**Why**: PR #24 (plan019) critic M4 — M3 가 만료 메시지를 `"scrollKey 가 만료되었습니다..."` → `"...(원인: ${err.message}). 만료(유효 1분)일 수 있으니..."` 로 바꿨는데 성공기준 #9 가 여전히 `grep -c "scrollKey 가 만료"` → 올바른 구현이 false-fail. 그 게이트 압박이 M3 를 되돌릴 경로를 염. #9 토큰을 `"원인:"`(원본보존 마커)로 교체 + 회피항목 갱신으로 해소. 문자열 바꾸는 REVISE 마다 재발 가능.

## 1-31. 새 API 의 수치 파라미터 범위(pageSize/limit/maxResults)를 docs 확인 없이 추측 기본값·상한으로 박음

**증상**: 새 endpoint 의 `pageSize`·`limit` 같은 수치 파라미터의 **허용 범위·기본값**을 docs 확인 없이 추측한다(예: "pageSize 기본 1000·최대 1000"). 실제 docs 한도가 다르면(10~100) 코드 검증·기본값·help 텍스트가 전부 틀린 채 ship 되고, 첫 실호출에서 422/400 또는 조용한 절단으로 드러난다. tsc·help 성공기준은 수치 범위를 모르니 못 잡는다.

**Good**: 수치 파라미터는 **공식 docs 의 범위 명세를 인용**해 확정한 뒤 검증·기본값·help·docs 를 모두 그 값으로 맞춘다.
- API 가이드에서 "pageSize: 10~100" 같은 범위 문구·예제 값을 찾아 plan 에 인용.
- 검증은 4-4(정수 regex) 후 docs 범위로 clamp/거절. help·README·SKILL·코드 기본값이 한 값으로 일치하는지 cross-check.
- docs 가 봇차단이면 1-27(B) 처럼 "추정 — 수동 QA 확정" 으로 격하하고 보수적 기본값.

**Self-check**: 새 수치 옵션의 범위·기본값이 docs 인용에 근거하는가, 추측인가? 코드 검증·기본값·help·README·SKILL 다섯 곳이 같은 범위로 일치하는가?

**Why**: PR #24 (plan019) critic M2 부수발견 — export `--size`(scroll pageSize)를 1~1000·기본 1000 으로 추측했으나 공식 Log & Crash Search API docs 는 **10~100**. WebFetch 로 응답 예제·범위 확정 후 10~100·기본 100 으로 전 경로 정정. 새 API 의 페이지네이션·한도 수치마다 재발 가능.

## 1-32. 테스트 작성 phase 의 기대값(에러 wrap 여부·exit code·반환 형태)을 대상 함수 실제 동작 확인 없이 추측

**증상**: 테스트 작성 task 의 phase 본문에 단언 기대값을 적으면서 대상 함수의 실제 분기를 읽지 않고 추측한다. 특히 "원형 보존 vs wrap"·"throw vs 무반환" 같이 정반대인 두 동작은 코드 미확인 시 거꾸로 적기 쉽다. phase 캐논(index.json description)에까지 틀린 기대값이 박히면 executor 가 (a) 틀린 단언으로 테스트를 깨거나 (b) 코드를 "버그" 로 오인해 프로덕션을 수정(외과적 위반)·허위 버그 리포트로 샌다.

**Good**: 테스트 phase 작성 시 단언 기대값은 추측이 아니라 대상 함수의 실제 코드(파일:라인)를 읽고 그 동작을 mirror 한다 — "테스트가 코드를 mirror, 코드를 테스트에 맞추지 말 것". 에러 변환 함수는 각 분기(status→exit code, raw Error→wrap/passthrough)를 코드에서 직접 인용해 기대값으로 박는다. 단언은 동작에 맞는 형태로: wrap 이면 `exitCode === EXIT_API_ERROR`, passthrough 면 `toBe(original)` 참조 동일성 — `instanceof` 만으로 wrap/원형을 구분하려 하지 않는다. instanceof 분기를 타는 입력은 **실제 인스턴스로** 만든다(`new HTTPError(...)`); 평범한 객체(`{response:{status}}`)는 `instanceof` 가 false → 다른 분기로 빠져 우연히 같은 값이면 잘못된 이유로 green 된다.

**Self-check**: phase 의 모든 테스트 기대값이 대상 함수 코드(파일:라인)에 근거하는가? "원형 보존/wrap"·"throw/무반환" 같은 반대쌍을 코드로 확인했는가? instanceof 분기 입력이 실제 인스턴스인가?

**Why**: PR #25 (plan020) critic MAJOR — httpError 테스트 phase 가 raw Error 를 "원형 보존(감싸지 않음)" 으로 단언했으나 실제 `httpError.ts:25-27` 은 `NhnCloudCliError(EXIT_API_ERROR)` 로 wrap. index.json description 에까지 정반대 기대값 전파. MINOR 로 HTTPError 를 평범한 객체로 만들면 404/500 이 분기를 안 타고 잘못된 이유로 통과하는 함정도 지적됨. 테스트 작성 task 마다 재발 가능.

## 1-33. 통합 명령(configure 등)에 신규 서비스 옵션 추가 시 통합 표면 일부만 수정

**증상**: `configure` 처럼 여러 서비스 자격증명을 한 명령으로 받는 통합 진입점에 새 서비스 옵션(`--ncr-appkey` 등)을 추가하면서, plan 이 "옵션 + verify 추가" 한두 줄로 압축한다. 실제로는 통합 표면 5곳을 동시에 손대야 하고 한 곳만 빠져도 조용히 오작동한다:
1. 옵션 타입(`XxxOptions`) + Commander `.option` 정의.
2. 비대화형 파싱(`runNonInteractive`)에서 옵션→자격증명 객체 변환.
3. 비대화형 빈-가드(`if (!a && !b && !c)`)에 `&& !new` — 누락 시 신규 옵션 단독 호출이 "설정할 항목 없음" 오류로 잘못 빠진다.
4. `hasFlag` OR-체인 — 누락 시 신규 옵션이 비대화형이 아닌 **대화형으로 빠진다**(스크립트·AI 호출 차단).
5. **고정 위치인자 헬퍼**(`saveAndVerify(a, b, c, verify)` 같은) 시그니처 + 호출처 전부 — 위치인자라 한 곳만 빠뜨려도 인자가 밀려 타입 에러 또는 잘못된 값 전달.

**Good**: 통합 명령 옵션 추가 phase 는 본문에 위 5곳(또는 해당 명령의 실제 표면) 체크리스트를 명시하고, 작성 직전 `grep -nE "hasFlag|<헬퍼명>|runNonInteractive|<빈가드조건>" src/commands/<명령>.ts` 로 현재 줄을 재확인한다(line drift 대비 — 번호는 참고값). 고정 위치인자 헬퍼는 시그니처 + 호출처를 grep 으로 전수 확인.

**Self-check**: 신규 옵션 식별자가 위 5곳 전부에 등장하는가? interactive ↔ 비대화형 분기 mismatch 0건(옵션이 한 분기에만 있지 않은가)?

**Why**: PR #26 (plan021) critic MAJOR — `--ncr-appkey` 추가를 "옵션 + verifyNcr" 로 압축했으나 configure.ts 의 hasFlag·빈가드·runNonInteractive·saveAndVerify(고정 위치인자 호출처 4곳)를 빠뜨림. 1-14(nonInteractive trigger 확장)의 인접 패턴이나 **고정 위치인자 헬퍼 시그니처+호출처 동시 수정** 측면이 별도. configure 에 새 서비스 자격증명을 추가하는 plan 마다 재발 가능.

## 1-34. 새 목록 endpoint 의 pagination 미처리 → 기본 page_size 묻혀버린 절단

**증상**: 새 목록 조회 endpoint 를 추가하면서 단일 호출로 전체를 받는다고 가정한다. 그러나 REST API(특히 Harbor·Kubernetes·GitHub 등 표준 구현)는 기본 page_size(보통 10~25)로 **앞부분만** 돌려주고 나머지는 `Link: rel="next"` 헤더나 `next` 토큰·`marker` 로 페이지네이션한다. plan 의 실측이 항목 적은 리소스로만 통과하면 큰 리소스에서 **조용히 앞 N개만** 반환 — 목록 명령의 정확성이 깨지는데 tsc·help·작은 실측은 못 잡는다.

**Good**: 새 목록 endpoint 는 pagination 방식을 실측으로 확인하고(첫 응답의 `Link`/`x-total-count`/`next` 헤더·필드) 전수 수집한다.
- `page_size` 를 API 최대값(예 Harbor 100)으로 두고 `Link: rel="next"` 가 없을 때까지(또는 marker 소진까지) 루프 누적.
- ky 사용 시 `await ky.get(...)` Response 를 받아 `.json()` 과 `.headers.get("link")` 를 **함께** 쓴다(`.json<T>()` 체이닝하면 헤더를 못 봐 pagination 불가).
- 무한루프 방어로 max-page cap 은 선택. 항목 많은 리소스로 실측해 2페이지 이상 수집을 단위테스트로 박제(`ky.get` 2회 호출 단언).
- 이 프로젝트는 이미 `instance images`(marker)·`logncrash export`(scroll) 등에서 pagination 을 다룬다 — 새 목록도 같은 결로 맞춘다.

**Self-check**: 새 목록 명령의 첫 응답에 pagination 헤더/필드가 있는가? 있으면 전수 수집하는가, 단일 호출인가? 항목 많은 리소스로 실측해 truncation 이 없는지 확인했는가?

**Why**: PR #28 (plan022) critic MAJOR — `ncr images`/`ncr tags` 가 Harbor REST 를 단일 호출로 가정. 실측에서 한 repo 에 artifact 60·145개 + `Link: rel="next"`·`x-total-count: 60` 확인 — 기본 page_size 면 앞부분만. `getAllPages`(page_size=100·rel="next" 전수)로 정정, artifact 145개 repo 2페이지 수집을 실측·테스트로 박제. 새 목록 endpoint 추가마다 재발 가능.

## 1-35. 여러 서비스에 같은 명령 이름(images/list/get) → index.ts import 식별자 충돌

**증상**: `images`·`list`·`get`·`create` 처럼 흔한 서브명령을 새 서비스에 추가하면서 command 객체를 `imagesCommand` 같은 bare 이름으로 export·import 한다. 이미 다른 서비스(예: `instance/images.ts` 의 `imagesCommand`)가 같은 이름을 export 하고 index.ts 가 둘 다 import 하면 **duplicate identifier → tsc 실패**.

**Good**: index.ts 에서 서비스별 서브명령을 import 할 때 **서비스 prefix alias** 를 쓴다 — `import { imagesCommand as ncrImagesCommand } from "./commands/ncr/images.js"`. 등록도 alias 로(`ncrCommand.addCommand(ncrImagesCommand)`). 기존 같은 서비스의 `listCommand as ncrListCommand` 컨벤션을 따른다. 새 서브명령 추가 phase 면 `grep -nE "<명령>Command" src/index.ts` 로 동명 import 가 이미 있는지 확인한다.

**Self-check**: 새 서브명령 이름이 다른 서비스에 이미 있는가(`grep <명령>Command src/index.ts`)? 있으면 alias 로 import 했는가?

**Why**: PR #28 (plan022) critic MAJOR — `ncr images` 를 bare `imagesCommand` 로 등록하려 했으나 `index.ts:33` 에 instance `imagesCommand` 가 이미 존재 → duplicate identifier. `ncrImagesCommand`/`ncrTagsCommand` alias 로 정정. images/list/get/create 등 공통 서브명령을 새 서비스에 추가할 때마다 재발 가능.

## 1-36. 파일 경로/구조 이전 시 참조 grep 범위에 `.claude/agents/` 누락 (custom agent 가 스킬 스크립트를 복제 보유)

**증상**: 단일 파일 → 디렉터리 같은 경로/구조 이전에서 참조 갱신 grep 범위를 `.claude/skills/` 까지만 잡고 `.claude/agents/` 를 빠뜨린다. custom agent 정의(executor·docs-verifier 등)가 스킬의 임베드 검증 스크립트를 **복제 보유**하는 경우가 있어, 스킬만 갱신하고 agent 를 누락하면 그 agent 의 스크립트가 없어진 옛 경로를 가리켜 **조용히 깨진다**(파일 부재 → 에러 또는 garbage pass).

**Good**: 경로/구조 이전 phase 의 참조 grep 범위에 `.claude/agents/` 를 항상 포함한다 — `grep -rn "<옛경로>" CLAUDE.md docs/ .claude/skills/ .claude/agents/ README.md skills/ src/`. 특히 검증 에이전트(docs-verifier 등)는 docs-check SKILL 의 검증 스크립트를 복제하므로 둘을 같은 로직으로 동기화한다(거울 — 이상적으로는 단일 소스화).

**Self-check**: 경로 이전 grep 범위에 `.claude/agents/` 가 있는가? custom agent 의 임베드 스크립트(ADR/docs 검증 등)가 새 구조를 반영하는가?

**Why**: PR #29 (plan023) code-reviewer FIX_NEEDED — adr.md → docs/adr/ 이전에서 phase-02 grep 이 `.claude/skills/` 만 봐 `.claude/agents/nhncloud-cli-docs-verifier.md` 의 ADR 검증 스크립트(docs-check 복제) 10건 + executor.md 1건을 놓침. critic 도 grep 범위를 못 잡음. 경로/구조 이전 task 마다 재발 가능.

## 섹션 1 소진 체크리스트

plan 제출 전 10개 패턴 모두 self-check:

- [ ] **1-1**: 모든 수치가 실측 명령 결과
- [ ] **1-2**: 파일 목록이 `--name-only` 결과와 일치
- [ ] **1-3**: 최근 10개 커밋과 이 plan 의 관계 서술
- [ ] **1-4**: 모든 Bash 블록에 `# cwd:` 주석
- [ ] **1-5**: 성공 기준에 인간 의존 문구 없음
- [ ] **1-6**: 외부 상태 변경 단계에 gate + rollback
- [ ] **1-7**: load-bearing 불변식 도입 시 4면 가드
- [ ] **1-8**: 마지막 phase 에 index.json `completed` 마킹 지시
- [ ] **1-9**: rename 시 `sed \b` 대신 `perl`
- [ ] **1-10**: type 변경 phase 면 성공 기준에 `pnpm tsc --noEmit` baseline 비교
- [ ] **1-21**: punt 한 산출물이 받는 phase 작업목록 + 성공기준에 실재 (고아 참조 없음)

---

# 2. team 운영

`build-with-teams` 가 팀원 스폰 / 메시지 / 브랜치 작업 시 self-check. 사고가 자주 발생하는 영역.

## 2-1. 팀원 SendMessage 회신 누락

**증상**: sub-agent 가 평가 결론을 자기 화면에만 출력하고 종료. team-lead inbox 미도달.
**왜**: idle 알림만 도착 → team-lead 평가 미수신 상태로 다음 단계 진행 불가.

스폰 프롬프트 + 작업 지시 메시지 양쪽에:
```
회신은 반드시 SendMessage 로 team-lead 에 송신.
화면 텍스트만 출력하고 종료 시 라우팅 안 됨.
```

team-lead 가 idle 알림 2회 연속 + 평가 메시지 0 → 즉시 강제 재요청.

## 2-2. 팀원 자발적 실행

**증상**: idle 대기 지시 무시하고 team-lead 의 SendMessage 전에 자발 실행 / 검증 시작.
**왜**: critic 게이트 시점 정합성 망가짐.

스폰 프롬프트에:
```
team-lead 의 명시적 "시작" 지시 전 절대 자발 실행 금지. idle 유지.
```

team-lead 는 critic 평가 중 worktree git status 점검으로 자발 실행 조기 감지.

## 2-3. self-shutdown 패턴

**증상**: `oh-my-claudecode:code-reviewer` / `architect` (docs-verifier) 가 `run_in_background: true` 로 스폰해도 idle 직후 자체 shutdown.
**왜**: critic 만 idle 유지 성공. reviewer / verifier 는 shutdown.

**우회**: 검사 결과 준비 시점에 즉시 새로 spawn (idle 대기 의존 금지). 죽었다는 시스템 알림 받으면 침묵 말고 새로 스폰 + 즉시 검사 지시 묶음.

## 2-4. executor cwd 격리 (main repo 오염 방지)

**증상**: worktree 절대경로 명시했는데 executor 가 main repo 에서 `cd /main-repo` 로 작업.
**왜**: main 오염 → origin 다이버전스 / 다른 plan 미푸시 작업과 충돌.

executor 프롬프트에:
```
모든 cd / git / 파일 편집은 worktree 절대경로 기준만. main repo 직접 cd 금지.
의심 시 `pwd` 확인.
```

team-lead 는 executor 작업 중 `git -C {main-repo} status` 주기 점검. dirty 시 즉시 중단.

## 2-5. executor scope 확장 자체 판단

**증상**: phase 도중 task 범위 외 (pre-existing 에러 / 발견한 bug / ADR 위반 자체 변경) 를 자체 추가. 또는 `@ts-ignore` / `@ts-expect-error` 자체 추가.
**왜**: critic 게이트 우회 → 사후 평가 사이클 추가 + task 본문 / 성공 기준 어긋남.

executor 프롬프트에:
```
task 범위 외 수정은 자체 판단 금지.
@ts-ignore / @ts-nocheck / @ts-expect-error 자체 추가 = 정책 변경 → 보고 필수.
SendMessage 로 team-lead 에 보고: "X 발견, Y 수정 필요. 본 phase 포함 / 별도 plan 결정 부탁".
```

team-lead 흐름: 보고 → critic 사후 평가 → ACCEPT (scope 확장 commit 명시) 또는 REJECT (별도 plan).

## 2-6. critic v2 재평가 시 신 파일 미재읽기

**증상**: REVISE 후 v2 commit hash 받고도 v1 평가 그대로 반복 송신.
**왜**: critic 이 이전 평가 컨텍스트만 가지고 회신 → 신 파일 Read 누락.

team-lead 재평가 메시지에 **3가지 필수 포함**:
1. `Read tool 로 다음 파일을 다시 읽고 재평가해 줘` 명시 + 변경 파일 절대경로
2. 4-5개 확인 포인트 체크리스트
3. "직전 메시지가 첫 평가 사본일 수 있음 — 실제 파일 상태 기준으로 판정"

회신이 v1 동일하면 즉시 강제 재읽기.

## 2-7. code-reviewer 에 plan 비자명 설계 결정 미전달

**증상**: code-reviewer 가 plan 컨텍스트 모르면 정상 helper 사용을 권장하다 설계 의도와 충돌 (false positive LOW 양산).
**왜**: team-lead 가 일일이 판정해야 함.

team-lead 의 검사 시작 메시지에 plan 의 비자명 결정 (helper 우회 사유 / 의도된 raw pattern / 의도된 placeholder 등) 1-2 줄 첨부.

## 2-8. task 재분할 시 index.json 갱신 누락

**증상**: critic REVISE 후 phase 파일 재작성 / 추가 / 제거 시 `index.json.total_phases` + `phases` 배열 미갱신.
**왜**: 파이프라인이 신 phase 인식 못 해 executor 가 구 phase 만 실행 → plan 핵심 누락.

```bash
jq -r '.total_phases as $t | .phases | length as $p | "total=\($t), len=\($p)"' tasks/{plan}/index.json
ls tasks/{plan}/phase-*.md | wc -l   # 위 두 값과 일치
```

phase 파일과 index.json 은 같은 commit 으로 갱신.

## 2-9. cwd 추적 + 양쪽 git status 검증

**증상**: team-lead 가 task 재작성 / commit 시 cwd 가 main repo 인지 worktree 인지 헷갈림. 동일 상대경로가 다른 파일 가리킴.
**왜**: main repo 의 task 파일 의도치 않게 수정 / 삭제. system-reminder 알림이 어느 working tree 인지 명확히 표기 안 됨.

commit 전 `pwd` + 양쪽 동시 점검:
```bash
git -C /Users/.../dooray-cli status --short
git -C /Users/.../dooray-cli/.claude/worktrees/{plan} status --short
```

## 2-10. 브랜치 확인 누락 commit 사고

**증상**: skill / docs 변경 commit 직전 `git branch --show-current` 안 함 → PR 작업 브랜치에 무관 commit 박힘.
**왜**: skill 외부 작업이라도 자동 mode 가 자동 switch 하는 듯. 같은 세션 두 번 발생.

**규칙**: 모든 commit 직전 `git branch --show-current` 강제 확인. main 작업이면 main, PR 브랜치 작업이면 PR 브랜치 확인 후 commit.

## 섹션 2 소진 체크리스트

스폰 / 메시지 / 검증 / commit 단계마다 해당 패턴 self-check.

---

# 3. PR review 학습 (코드 패턴 함정)

`review-fix` 가 PR 리뷰 댓글 처리 후 재발 가능 패턴을 누적하는 자리. 같은 지적이 다음 PR 에서 반복되지 않도록.

> 누적 양식 (CLI# 또는 패턴 한 줄):
>
> ```markdown
> ## 3-N. {짧은 패턴 이름} (PR #N)
> **증상**: {1줄}
> **왜**: {1줄}
> **Good**: {해결책 + 코드 패턴}
> **검출**: {grep / find 명령}
> ```

(아직 누적 항목 없음. PR 리뷰 처리 시 `review-fix` 6.5단계 절차에 따라 채움.)

## 섹션 3 누적 규칙

- 누적 대상: 재현 가능한 라이브러리 / API / 타입 함정 (ky / vitest / commander / imapflow / mailparser / nodemailer 등)
- 누적 금지: 1회성 오타, 특정 plan 컨텍스트 종속 코멘트, 칭찬, 단순 확인 요청
- 도메인 의사결정 가치가 있으면 `docs/adr/` 에 신규 ADR 파일로 (ADR 작성 전 점검 통과 시)

---

# 4. 레포별 +α (dooray-cli — TypeScript / Commander.js / tsup / vitest)

## CLI1. exitCode 누락

**증상**: 에러 분기에서 `process.exit(N)` 또는 `throw new NhnCloudCliError(msg, exitCode)` 호출 누락 → 0 으로 종료되어 호출 스크립트가 실패 인지 못함.
**Good**: 모든 에러 경로는 `NhnCloudCliError` 또는 명시적 `process.exit(N)`. exitCode 정책은 `src/utils/exit-codes.ts` 참조.
**검출**: `grep -nE 'console\.error.*\n.*return\b' src/commands/`.

## CLI2. ky 외 HTTP 클라이언트 사용

**증상**: `axios` / `node-fetch` / `got` import → 번들 크기 증가 + ADR-002 의 retry / timeout 정책 일관성 깨짐.
**Good**: 모든 HTTP 호출은 `src/api/client.ts` 의 ky 인스턴스 통과. 신규 외부 API 도 동일 helper 확장.
**검출**: `grep -rnE "from ['\"](axios|node-fetch|got)['\"]" src/`.

## CLI3. 캐시 일관성

**증상**: `~/.nhncloud/cache/` 쓰기 후 읽기 시 부분 쓰기 / 스키마 불일치 노출.
**Good**: write 는 atomic (`writeFile` to temp + rename), read 는 schema 검증 (타입 가드). ADR-004 / ADR-010 참조.
**검출**: `grep -nE 'fs\.writeFile.*cache' src/cache/` 결과 중 atomic 패턴 미적용 라인.

## CLI4. `~/.nhncloud/` 민감 파일의 mode 미지정

**증상**: `writeFile(path, data)` 만 호출하면 OS umask (보통 644) 로 파일 생성 → 공유 머신에서 다른 사용자가 sanitized argv (project code / postId 등) 또는 캐시된 멤버 정보를 읽을 수 있음.
**Good**: 사용자 데이터를 담는 `~/.nhncloud/` 하위 파일은 `writeFile(..., { mode: 0o600 })` 으로 owner-only. 특히 `last-run.json` / cache 하위 / config.json 등.
**검출**: `grep -nE 'writeFile\([^,]+,\s*[^,]+\)' src/cache/ src/config/ | grep -v "mode:"` (옵션 인자가 없는 호출).
**Why**: PR #36 review — last-run.json 이 sanitized 후에도 argv 에 프로젝트 코드 / 19자리 ID 가 남아 있어 정보 노출 표면.

## CLI5. JSON.parse 결과를 `as Type` 단언

**증상**: 디스크/네트워크에서 읽은 JSON 을 검증 없이 `as LastRun` / `as CachedMember` 등 단언. 타입 시스템은 통과하지만 런타임 형태가 다르면 후속 호출에서 `TypeError: x.y is not a function`.
**Good**: 검증 로직을 **타입 가드 함수** (`function isLastRun(o: unknown): o is LastRun`) 로 추출하고 `isLastRun(parsed) ? parsed : null` 패턴 사용. 인터페이스 필드 추가 시 가드 함수도 같이 갱신해야 컴파일 통과 — 동기화 강제.
**검출**: `grep -rnE 'JSON\.parse.*\)\s+as\b' src/` (즉시 단언 패턴).
**Why**: PR #36 review — 이전에 인라인 검증 + `as` 단언은 검증 블록과 캐스트가 따로 진화하다 결국 어긋남.

## CLI6. 사용자 데이터를 markdown 코드 블록에 직접 삽입

**증상**: `\`\`\`\n${last.errorMessage}\n\`\`\`` 처럼 외부에서 받은 문자열을 fenced code block 안에 그대로 삽입. 데이터에 `\`\`\`` 가 포함되면 GitHub Markdown 파서가 거기서 코드 블록을 닫아 본문이 깨짐 (누출 가능).
**Good**: 삽입 전 `s.replace(/\`\`\`/g, "'''")` 로 이스케이프하거나, 인용 블록 (`>`) 으로 감싸기. issue body / PR body / wiki 모두 동일.
**검출**: `grep -rnE '"\`\`\`"' src/utils/feedback-meta.ts src/` 영역의 fenced block builder 코드.
**Why**: PR #36 review — `buildLastRunBlock` 가 errorMessage 를 ` ``` ` 안에 직접 넣어 GitHub 표시가 깨질 가능성.

## CLI7. 외부 응답의 fileName 으로 경로 조립 (path traversal)

**증상**: 서버 / API 가 반환한 `fileName` 을 검증 없이 `path.join(outDir, fileName)` 에 사용. 악의적 (또는 버그있는) 서버가 `../../etc/passwd` 같은 값을 반환하면 지정 디렉토리 밖으로 파일이 기록됨.
**Good**: 외부에서 받은 fileName 은 항상 `basename(fileName)` 으로 directory component 제거 후 join. 다운로드 / 첨부 / 사용자가 통제하지 않는 모든 경로 입력에 적용.
**검출**: `grep -rnE 'join\([^)]*\bfileName\b' src/commands/` 중 `basename` 미적용 라인.
**Why**: PR #40 review — `post comment file download` 가 Dooray 응답의 fileName 을 그대로 join. 보안 측면에서 1줄로 막을 수 있는 취약점.
**재발 빈도 높음**: PR #40 (🔴) → PR #72 (🔴) 두 PR 에서 동일 버그가 반복됨.
download 명령 신설 시 `basename(decodeURIComponent(fileName))` grep 강제.

## CLI8. "정상 빈 결과" 메시지를 stderr 로 출력

**증상**: 첨부 0 개 / 댓글 0 개 같은 **정상 빈 상태** 메시지를 `process.stderr.write` 로 보냄. CLAUDE.md 컨벤션은 `데이터=stdout / 에러·진행로그=stderr`. 빈 결과는 에러가 아니므로 stderr 위반 + 자동화 파이프 처리 어색함.
**Good**: 빈 결과는 `--json` 시 `[]` / `{}` stdout, 일반 모드는 `'결과 없음'` 등 stdout 또는 무출력. `--quiet` 시 무출력.
**검출**: `grep -rnE 'stderr\.write.*없음|stderr\.write.*empty' src/commands/`.
**Why**: PR #40 review — `comment file list` 가 "첨부 없음" 을 stderr 출력 → 컨벤션 위반.

## CLI9. `--quiet` 모드에서 식별자 출력 누락

**증상**: 자동화 / 파이프 친화 모드 (`--quiet`) 에서 fileId / postId / pageId 같은 후속 처리에 필요한 식별자를 stdout 에 출력하지 않음. 호출자 (스킬 / shell pipe) 가 `dooray foo upload --quiet | xargs dooray bar` 패턴으로 체이닝 불가.
**Good**: `--quiet` 분기에서 사람용 메시지는 생략하되 **식별자 1 줄** (`fileId`, `pageId` 등) 은 stdout 출력. `--json` 과 별개로 quiet 도 자동화 진입점.
**검출**: `--quiet` 분기에서 `stdout.write` 가 0 줄인 명령 — 신규 명령 PR review 시 grep.
**Why**: PR #40 review — `comment file upload --quiet` 가 fileId 미출력 → 다음 명령 체이닝 불가.

## CLI10. 외부에서 받은 문자열을 sanitize 없이 stderr/stdout 출력

**증상**: 서버 응답·사용자 입력에서 받은 문자열 (파일명, 멤버 displayName, 에러 메시지 등) 을 그대로 `process.stderr.write` / `process.stdout.write` 로 출력.
  악의적 측이 ANSI escape 시퀀스나 control char (`\x00-\x1F`, `\x7F`) 를 삽입하면 터미널 색상·커서·title 변조 가능.
**Good**: 출력 직전 `name.replace(/[\x00-\x1F\x7F]/g, "?")` 로 제거. 공통 helper (`sanitizeFileName` / `sanitizeForTerminal`) 로 추출하여 신규 출력 지점에서도 재사용.
**검출**: `grep -nE "(stderr\|stdout)\.write\(.*\\$\\{[a-zA-Z]+\\.(name\|content\|title\|message)" src/` — sanitize 안 거친 동적 출력 의심 패턴.
**Why**: PR #43 review — `guardDroppedAttachments` 가 서버 `file.name` 을 그대로 stderr 출력 → 악의적 파일명에 ANSI escape 시 터미널 변조. dooray API 는 사용자 업로드 파일명을 그대로 echo 하므로 sanitize 가 boundary 책임.

## CLI11. non-interactive / interactive 분기 동일 가드 inline 중복

**증상**: 한 명령이 두 입력 모드 (`--body` non-interactive vs `$EDITOR` interactive) 를 가지면서 동일한 사전 검사 시퀀스 (find + warn + confirm 등) 를 양쪽에 inline 으로 중복. 후속 변경 시 한쪽만 갱신되어 모드 간 동작이 달라지는 회귀 위험.
**Good**: orchestrator helper 로 추출 (예: `checkAndGuardDropped(oldBody, newBody, attachments, noConfirm)`), 두 분기에서 한 줄로 호출. helper 내부에서 검사 → 경고 → 확인 → throw 순서를 단일 정의.
**검출**: 한 명령 파일 안에서 같은 helper 가 2회 이상 호출되면서 사이에 비슷한 입력 준비 (`(... ?? []).map`) 가 반복되면 후보.
**Why**: PR #43 review — `post edit` non-interactive + interactive 두 분기가 `findDroppedAttachments → guardDroppedAttachments` 시퀀스를 inline 중복.

## CLI12. I/O + throw 결정을 한 함수에 묶음 → 단위 테스트 불가

**증상**: 한 helper 가 (1) stderr 출력, (2) readline 사용자 입력, (3) NhnCloudCliError throw 를 동시에 담당. vitest 에서 stdin/stdout mock 없이 단위 테스트 작성 불가 → 결국 테스트 누락.
**Good**: 책임 분리 — `printWarning(...)` (stderr 만) / `confirmPrompt(): Promise<boolean>` (입력만) / `orchestrator(...)` (throw 결정). 순수 helper 만이라도 단위 테스트로 보호.
**검출**: `async function ... Promise<void>` 안에 `process.stderr.write` + `readline.createInterface` + `throw` 셋이 동시에 있으면 분리 후보.
**Why**: PR #43 review — `guardDroppedAttachments` 가 세 책임을 묶어 테스트 작성 안 됨. 분리 후 sanitize / extract / findDropped 단위 테스트로 회귀 보호.

## CLI13. `--dry-run` / 출력 분기에서 `--json` / `--quiet` 모드 누락

**증상**: 같은 옵션 세트(`--json` / `--quiet` / `--dry-run`)를 받는 4 명령에서 dry-run 분기가 일부 명령에만 `globalOpts.json` 처리를 가지고, 나머지에는 `process.stdout.write(body + "\n")` 평문만.
CLI 자동화 스크립트가 같은 플래그 조합을 명령별로 다른 형식으로 받음.
**Good**: 새 출력 분기 (`if (opts.dryRun)`, "변경사항 없음" 등) 추가 시 `globalOpts.json` / `globalOpts.quiet` 분기를 같은 자리에서 처리. helper 추출 권장 (`writeBodyOutput(body, globalOpts)`).
**검출**: `grep -nE "opts\.dryRun|process\.stdout\.write" src/commands/post/` 결과를 4 명령 사이 비교 — 한 명령에만 `JSON.stringify` 가 있으면 다른 3개도 동일 분기 필요.
**Why**: PR #44 review — `comment add` / `post create` 만 dry-run JSON 분기, `comment edit` / `post edit` 누락. 같은 `OutputOptions` 인터페이스를 공유하는 명령 그룹은 출력 분기도 동일해야 한다.

## CLI14. client 의존 helper 를 `utils/` 에 두면 layer 위반

**증상**: 새 helper (`resolveTaskLinks(client, ...)`) 가 도메인 응집을 이유로 `src/utils/task-link.ts` (기존 `escapeLinkText` / `buildTaskLink` 동거 모듈) 에 작성됨.
  utils 는 client 의존 없는 building blocks 가 컨벤션 — `mention.ts` 의 `prependMentions` 도 client 안 받음.
**Good**: client 를 받는 함수는 `src/resolvers/` (예: `src/resolvers/task-link.ts` 신규). 같은 도메인의 building blocks 는 utils, lookup / API 호출 orchestrator 는 resolvers 로 분리. 같은 디렉터리 이름 충돌은 layer 가 우선.
**검출**: `grep -nE "DoorayApiClient" src/utils/*.ts` 결과 0 건 유지. utils 안에 client import 가 등장하면 resolver 후보.
**Why**: PR #44 review — task-link orchestrator 를 utils 에 두는 안과 resolvers 에 두는 안 둘 다 "허용" 댓글이 있었으나, layer 컨벤션 (utils=building block, resolvers=client+cache+lookup) 에 따르면 resolvers 가 정답.
  잘못 두면 utils 가 점진적으로 client 의존 모듈로 오염.

## CLI15. resolver/parser boundary 검증 (빈/공백 식별자가 API URL path 로 흘러감)

**증상**: `commentId` / `fileId` 같은 식별자를 trim·non-empty 검증 없이 `parseXxxPositional` 이 통과시킴.
  사용자가 빈 문자열 / 공백만 / 인용 부호 안 빈 값을 넘기면 그대로 `GET /posts/<postId>/comments//logs//files/` 같은 깨진 URL 로 합성.
  서버 4xx 또는 더 나쁘게 path traversal 가까운 동작 발생.
  `resolvePostInput` 의 numeric 검증 패턴과 비대칭.
**Good**: `parseXxxPositional` 진입부에서 모든 path 식별자에 `assertNonEmpty(value, "<label>")` (trim 후 빈 거부) 가드.
  discriminated union + 오버로드와 함께 "필수 secondary" 도 같은 가드 적용. `resolveCommentFileInput` 의 `assertNonEmpty` 헬퍼가 reference 구현.
**검출**: 신규 resolver/parser 추가 시 `grep -nE "throw new NhnCloudCliError.*가 필요|EXIT_PARAM_ERROR" src/resolvers/<file>.ts` 결과의 가드 다음에 trim 검증이 있는지 확인. 없으면 boundary 미보호.
**Why**: PR #47 review #5 — `comment-file-input.ts` 가 `commentId` / `fileId` 를 trim 없이 그대로 `client.getPostComment` URL 에 합성.
  resolver helper 가 향후 추가될 때마다 같은 boundary 가드 누락 위험 — 검증 책임을 caller (commands/) 가 아니라 resolver 가 단일 지점에서 진다.

## CLI16. 동일 변환 `.map` 블록이 N 파일에 복붙 → critic / planner 단계에서 헬퍼 추출 누락

**증상**: 같은 입력 (`linkInputs: string[]`) 을 같은 외부 호출 시퀀스 (`parseLinkRef → resolvePostInput → getPost → 변환`) 로 변환하는 15 줄 블록이 4 명령 파일에 그대로 복사됨.
  critic 이 sub-pattern 으로 지적했으나 "executor 재량" 으로 흡수 안 함 → code-reviewer 가 다시 지적 → 사후 별도 PR review-fix 로 추출.
**Good**: phase 작성 시 "동일 변환 N 파일 복붙" 이 보이면 plan 본문에 helper 명시 (`src/resolvers/<domain>.ts` 신규). critic 의 sub-pattern 도 MAJOR 로 승격할지 판단 — 4 파일 이상 복붙은 사후 review-fix 보다 phase 안에서 추출하는 게 cheaper.
**검출**: `git diff --name-only` 결과의 `commands/post/*.ts` 가 3 개 이상이고 각 diff 의 +라인 패턴이 `for/map(... await ...)` 형태로 유사하면 추출 후보.
**Why**: PR #44 review — phase-02 plan 이 인라인 `linkInputs.map` 을 4 파일에 명시 → 적용 후 review 에서 헬퍼 추출 요구.
  critic minor 1번에서도 "split 검증 부족" 같은 sub-pattern 을 지적했으나 본 패턴 (4 복붙 자체) 은 미지적.
  critic prompt 에 "동일 .map N 복붙" 검출을 명시 필요.

## CLI17. ADR-020 분기에서 silent fallback (`opts.X ?? positional`)

**증상**: positional 인자와 옵션이 같은 값 (예: `arg3` = 댓글 ID, `--comment-id` = 댓글 ID) 을 받을 때 `opts.commentId ?? arg3` 처럼 nullish coalescing 으로 옵션 우선 처리.
깔끔해 보이지만 두 입력이 동시에 들어오면 한쪽이 silent 하게 무시되어 사용자 의도 모호.
**Good**: ADR-020 의 *"모호한 입력 = 명시적 에러"* 정책 — `if (arg3 && opts.commentId) throw NhnCloudCliError(EXIT_PARAM_ERROR)` 후 어느 쪽이든 단독 사용. `parseGetArgs` / `parseCommentFilePositional` 등 분기 헬퍼에 동일 가드.
**검출**: `grep -rnE 'opts\.[a-zA-Z]+\s*\?\?\s*arg[0-9]' src/commands/` (옵션 우선 fallback 패턴).
**Why**: PR #46 review — `comment/get.ts` 의 `parseGetArgs` 가 `opts.commentId ?? arg3` 로 옵션 우선.
  사용자가 `dooray post comment get myproject 337 id-A --comment-id id-B` 입력하면 `id-A` 가 silent 무시.
  ADR-020 의 분기 게이트는 모호한 입력을 거부해야 함.

## CLI18. 같은 도메인 인접 명령의 defensive 패턴 동일 적용 누락

**증상**: `comment/list.ts` 가 `buildMemberNameMap` 호출을 try-catch + 빈 `Map` fallback 으로 감싸 멤버 조회 실패 시에도 댓글 목록은 그대로 반환. `comment/get.ts` 가 신설되면서 동일 패턴 누락 → 멤버 API 실패 시 단건 댓글 조회 자체가 실패.
**Good**: 같은 도메인 (`commands/post/comment/`) 신규 명령 작성 시 인접 파일 (`list.ts`, `add.ts` 등) 의 enrich / cleanup / dry-run / 출력 분기 패턴을 grep 으로 먼저 확인하고 그대로 적용. 일관성이 회귀 방어선.
**검출**: phase 작성 / review 시 `grep -nE "try\s*\{|catch\s*\(|new Map" src/commands/post/comment/*.ts` 결과를 신규 명령과 인접 명령 사이 diff. 인접 명령에 있는 가드가 신규 명령에 없으면 의도적인지 확인.
**Why**: PR #46 review — `comment/get.ts` 가 `buildMemberNameMap` 을 raw 호출.
  critic / docs-verifier 모두 잡지 못했고 code-reviewer 가 PR review 단계에서 발견.
  plan 작성 시 *"인접 명령 동일 패턴 적용 점검"* 을 self-check 에 포함하면 사전 차단 가능.

## CLI19. dead 필드 접근 fix 후 함수명-동작 불일치

**증상**: `member?.emailAddress ?? memberId` 같은 dead 필드 접근 (`emailAddress` 가 타입에 없어 항상 fallback) 을 `.name` 등으로 fix 해 tsc 통과 시켰지만, 함수명 `memberIdToEmail` 은 그대로 둠.
함수가 실제로는 name 을 반환하는데 호출자는 email 로 오인할 수 있음.
  PR #52 review 가 ADR-013 SMTP 발송 위험까지 언급 (이번 케이스는 false alarm 이었지만 패턴 자체는 실재 위험).
**Good**: dead 필드 접근 / undefined fallback fix 시점에 함수명 + 호출자 변수명 (`emails: string[]` → `names: string[]`) 까지 일괄 점검.
  fix scope 안에서 rename 가능하면 같은 commit 에 흡수, 별도 PR 이 깔끔하면 follow-up commit.
  **호출자 검색**: `grep -rn "<함수명>\b" src/` 로 caller 모두 확인 후 의미상 충돌 없는지 검토.
**검출**: tsc fix PR 작성 시 변경된 함수명을 `git diff <base>..HEAD --diff-filter=M -U0 src/` 로 추출 → 함수 시그니처가 *값의 의미를 전달* 하는데 동작이 바뀌었으면 rename 후보. 자동 검출 어렵지만 review 단계에 명시적 self-check 항목으로.
**Why**: PR #52 review — `memberIdToEmail` 이 dead `.emailAddress` fix 후 `.name` 반환하는데 함수명은 email 시사.
  흐름상 SMTP 와 무관해 실제 위험 0 이었지만, 다음에 비슷한 케이스에서는 진짜 SMTP 흐름과 엮일 수 있음.
  tsc fix 와 rename 을 한 묶음으로 처리하는 습관이 회귀 방어.

## CLI20. `T | false` union 반환 라이브러리에 `??` 사용 부적합

**증상**: `mailparser.ParsedMail.html: string | false`. `parsed.text ?? parsed.html ?? "(default)"` 작성 시 `parsed.text === undefined` 이고 `parsed.html === false` 면 `??` 가 `false` 를 통과시켜 `body = false` 로 결과 —
타입 string 위반 + 런타임 false 노출.
**Good**: 외부 라이브러리가 `T | false` / `T | 0` / `T | ""` 반환 가능하면 `||` 사용 (falsy 전체를 default 로 흘림). 단 의도된 빈 문자열 보존이 필요하면 명시적 `typeof` / `=== false` 가드 + 한 줄 주석으로 의도 명시.
**검출**: `grep -rnE "\?\?.*(html|raw)\b" src/` 로 nullish coalescing 후보 리뷰. 타입 정의에 `| false` / `| 0` / `| ""` 이 있는 union 이면 `??` 부적합.
**Why**: PR #53 review — `parsed.text ?? parsed.html ?? "(본문 없음)"` 에서 `parsed.html: string | false` 의 `false` 통과 위험. `||` 로 교체 + 의도 주석. 다른 라이브러리 (`yaml.load` 일부 형, `dotenv` 등) 도 유사 패턴 가능.

## CLI21. 같은 옵션을 두 명령에 추가할 때 dry-run 분기 위치 비대칭

**증상**: 새 옵션 (`--cc-group` / `--to-group` 등) 을 `post edit` + `post create` 양쪽에 추가.
`post edit` 은 dry-run 분기 *이후* 에 cc/to resolve 가 일어나도록 작성돼서 `--dry-run --json` 출력이 `{ body, users: { to, cc } }` 를 포함.
`post create` 는 dry-run 분기가 cc/to resolve *이전* 에 조기 반환되어 `{ body }` 만 출력.
같은 옵션 + 같은 `--dry-run --json` 입력에 대해 명령마다 출력 범위 비대칭 → README 가 "포함된다" 로 일괄 서술하면 한 쪽 명령에서 docs↔코드 불일치.

**Good**: phase 작성 시 새 옵션이 두 명령 (`edit` + `create` 등) 에 들어가면:
- 양 명령의 dry-run 분기 라인을 phase 본문에 명시
- "dry-run JSON 출력 범위가 두 명령에서 동일한가" self-check
- 범위 통일이 불가능하면 (예: create 가 신규 자원이라 resolve 비용 회피) README/SKILL.md 에 명령별로 범위를 분리 서술

**검출**: phase diff 에 동일 옵션이 2 개 이상 `commands/post/*.ts` 에 추가됐으면 `grep -nE "opts\.dryRun|JSON\.stringify" <변경 파일들>` 결과 비교.
dry-run 분기 직전 코드에 무엇이 resolve 됐는지 라인 단위로 대조. 비대칭이면 docs 도 두 명령을 분리해서 서술.

**Why**: PR #55 review.
`post edit` 은 dry-run 가드를 cc/to resolve 후에 두는 게 자연스러웠고 (기존 mention/link-task 패턴 그대로 적용), `post create` 는 dry-run 가드가 다른 resolve 보다 위에 있었음.
README 가 "post edit/create 의 --dry-run --json 출력에 users 포함" 으로 일괄 서술 → docs-verifier UPDATE_NEEDED.
CLI13 의 변형 — 같은 옵션 4 명령 dry-run 분기 누락은 CLI13 이 잡고, 같은 옵션 2 명령 dry-run *위치 차이로 출력 범위 비대칭* 은 CLI21.

## CLI22. dry-run 실증 시나리오에서 non-interactive 진입 조건 누락

**증상**: phase 본문 실증 시나리오에 `--dry-run --json` 만 명시 (예: `node dist/index.js post edit <project> <number> --parent <ref> --dry-run --json`).
  그런데 `post edit` 의 분기는 `nonInteractive = !!(title || body || bodyFile)` — `--dry-run` 자체는 non-interactive 진입 조건이 아니라서 interactive ($EDITOR) 분기로 빠짐.
  dry-run JSON 출력 블록은 non-interactive 안에만 존재 → 실증 시나리오가 통과 불가능.
**Good**: post edit/comment edit 류의 실증 시나리오에 `--dry-run` 을 쓰려면 항상 `--title "<원제목>"` 또는 `--body "..."` 동반. phase 본문 실증 단계에 "non-interactive 진입 보장을 위해 `--title` 동반 필수" 한 줄 명시.
**검출**: phase 본문에 `--dry-run` 등장 시 같은 명령 라인에 `--title` / `--body` / `--body-file` 중 하나가 있는지 grep:
```bash
grep -nE "\-\-dry-run" tasks/{plan}/phase-*.md | grep -vE "\-\-title|\-\-body"
# 결과 있으면 의심
```
**Why**: PR #62 critic REVISE — phase-01 실증 시나리오 #5 가 `--parent --dry-run --json` 만 명시.
  실제 코드에서 interactive 분기로 진입해 dry-run JSON 자체가 실행 안 됨.
  executor 가 "통과한 것처럼" 보고하거나 디버깅 미궁 위험.
  comment edit / post edit / wiki page edit 동일 패턴.

## CLI23. sequential endpoint 호출 — partial-failure stderr 안내 + spinner pair 누락

**증상**: 본문 변경(`updatePost`) + 메타데이터 변경(`setPostParent` / `setPostWorkflow` / `deletePostFile` + `updatePost` 댓글 PUT 합성 등) 을 sequential 로 호출.
  atomic 보장 없으므로 첫 호출 성공 + 두 번째 실패 시 부분 상태 발생.
  catch 가 `toNhnCloudCliError` 로 throw 만 하면 사용자는 "전체 실패" 로 오해 → 본문 재실행으로 mention prepend 중복 등 부작용.
**Good**: sequential 호출의 catch 안에서 (1) `stopSpinner(false, "...")`, (2) `process.stderr.write("⚠  본문은 수정되었으나 X 변경에 실패했습니다. 본문 재실행 금지 — ...")`, (3) re-throw.
  phase 본문 작업 항목에 try/catch + stderr 안내 코드 스니펫 명시.
**검출**: phase diff 에 `client.X` + `client.Y` 두 호출이 같은 비-Promise.all 블록에 있으면 의심. grep 패턴:
```bash
git diff main..HEAD -- src/commands/ | grep -E "^\+\s+await client\." | wc -l
# 같은 함수에서 2 이상이면 sequential 패턴 — partial-failure 처리 확인
```
**Why**: PR #62 critic REVISE — `updatePost` 성공 후 `setPostParent` 실패 시 본문은 저장된 상태.
  사용자가 명령 재실행하면 mention prepend 중복 / link-task 중복 추가 가능.
  ADR-019 (post create --workflow), ADR-024 (comment file delete) 도 동일 패턴 — sequential 추가 시 반드시 partial-failure UX 점검.

## CLI24. `as unknown as X | Y` 이중 단언 — API client 반환 타입 union 으로 우회

**증상**: API client 의 메소드 반환 타입이 spec 과 실제 응답 shape 다를 때 (예: Dooray `result` 가 nested array) resolver 단에서 `(res.result as unknown as MemberGroup[][] | MemberGroup[]).flat()` 같이 이중 단언 사용.
  TypeScript 의 구조적 호환성 검사가 우회되어 다른 shape mismatch 가 silent 통과할 위험.
**Good**: `MemberGroupListResponse.result: MemberGroup[] | MemberGroup[][]` 처럼 **반환 타입 자체를 union 으로 선언** + resolver 에서 `res.result.flat()` 단언 없이 호출. `Array.prototype.flat()` 시그니처가 union 양쪽 case 자동 흡수.
**검출**: 신규 resolver / parser 추가 시:
```bash
grep -nE "as unknown as .*\|" src/
# 결과 있으면 의심 — API client 반환 타입 union 으로 옮길 수 있는지 검토
```
**Why**: PR #77 review — `member-group.ts:21` 이중 단언으로 ADR-028 nested array unwrap 구현.
  리뷰 권장에 따라 `MemberGroupListResponse.result` union 으로 옮기고 단언 제거 (PR #77 commit `76105b5`).
  같은 패턴이 향후 spec ↔ runtime mismatch 흡수 (ADR-028 류) 에 재발 가능 — API client 단에서 union 으로 흡수하는 게 type-safety 측면에서 우선.

## 1-17. 테스트 mock — self-mock (vi.mock("./same-file.js")) 금지

**증상**: `vi.mock("./project.js", ...)` 처럼 테스트 대상 파일 자체를 mock 하면 동일 파일 내부 함수 참조가 교체되지 않아 실제 구현이 호출됨.
캐시/네트워크 접근이 발생하여 환경마다 flaky.

**self-check**:
```bash
# phase 의 테스트 코드 블록에서 vi.mock 경로가 테스트 대상과 같은 파일인지 확인
grep -n 'vi\.mock("\./' tasks/*/phase-*.md
# "vi.mock("./project.js")" 같이 같은 디렉터리 파일을 mock 하면 self-mock 의심
```

**대안**: 테스트 대상이 내부에서 호출하는 **외부 의존성** (`../cache/store.js` 등) 을 mock.
기존 패턴: `member-group.test.ts` 참조.

**Why**: plan039 critic REVISE — `ensureProjects` 를 self-mock 했으나 CommonJS 번들에서 동일 파일 내부 참조는 원본 유지. 실제 `getProjects` 가 `~/.nhncloud/cache/` 에 접근하며 flaky 테스트 발생.

## 1-18. 테스트 정규식 — 에러 메시지 개행 시 dotAll (`s`) 플래그 필수

**증상**: `.toThrow(/패턴A.*패턴B/)` 에서 에러 메시지 중간에 `\n` 이 있으면 `.` 가 매칭 안 해서 테스트 항상 실패.

**self-check**:
```bash
# phase 테스트 코드에서 .toThrow 정규식이 멀티라인 에러 메시지를 잡는지 확인
# 에러 메시지에 \n 포함 여부: 대상 함수의 throw 구문 확인
grep -A2 'toThrow(/' tasks/*/phase-*.md | grep -v '/s)'
# /s) 없이 .* 로 멀티라인 매칭 시도하면 실패
```

**대안**: `/패턴A.*패턴B/s` — `s` (dotAll) 플래그로 `.` 가 `\n` 포함 매칭.

**Why**: plan039 critic REVISE v2 — `NhnCloudCliError` 메시지에 `\n` 2개 포함. dotAll 없이 `.*` 가 연결 실패해 테스트 항상 red.

---

이 파일은 dooray-cli 전용. 시드 1 / 2 패턴은 fos-blog 와 동일 구조이지만 도메인별 예시는 dooray-cli 컨텍스트로 표현. 3 / 4 / ... 는 이 레포 고유.
