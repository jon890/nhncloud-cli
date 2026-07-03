---
name: codebase-maintenance
description: 주기적으로 코드베이스를 검사해 최근 PR/commit, 변경 빈도, 중복 로직, 과한 추상화, 규칙 이탈, 문서 부패, 테스트 공백을 찾고 리팩토링 후보를 보고서나 작업으로 정리한다. 사용자가 "주간 코드베이스 점검", "일간 유지보수 점검", "리팩토링 후보 찾아줘", "최근 PR 보고 공통화할 것 찾아줘", "코드베이스 건강검진", "주기적 정리 작업 만들어줘"처럼 말하면 이 스킬을 사용한다. 직접 코드를 고치기보다 먼저 읽기 전용 점검을 수행하고, 승인된 후보만 build-with-teams 또는 ai-slop-cleaner로 넘긴다.
---

# 코드베이스 유지보수

주기적인 코드베이스 건강검진을 수행한다.
기본 모드는 읽기 전용 점검이며, 리팩토링은 후보를 작게 쪼개고 근거를 남긴 뒤 별도 실행 흐름으로 넘긴다.

## 실행 흐름

1. 범위를 정한다.
   - `daily`: 최근 1일 또는 최근 merged PR 중심.
   - `weekly`: 최근 7일과 전체 구조 이탈.
   - `full`: 전체 저장소 구조, 문서, 작업, 반복 패턴.
   - 사용자가 기간을 주면 그 값을 우선한다.

2. 반복 수집을 스크립트로 실행한다.
   - 실행: `node .agents/skills/codebase-maintenance/scripts/collect-maintenance-context.mjs --mode weekly --out <report.json>`
   - worktree에서 실행 중이면 `<skill-root>`의 절대경로를 사용한다.
   - `gh`가 없거나 인증되지 않았으면 git 근거만으로 계속한다.

3. 필요한 참고문서만 읽는다.
   - nhncloud-cli repo에서 실행하면 `references/nhncloud-cli-checks.md`를 읽는다.
   - 보고서 형식이 필요하면 `references/report-template.md`를 읽는다.

4. findings를 분류한다.
   - `P0`: 버그, 보안, 비밀 노출, docs 부패로 잘못된 구현을 유도할 수 있는 항목.
   - `P1`: 반복 중복, command UX 불일치, 테스트 공백, review 지적 재발.
   - `P2`: 이름, 작은 추상화 정리, 가독성 개선.
   - `Defer`: 대규모 설계 변경, 실측 필요, 동작 변경 위험.

5. 실행 방식을 결정한다.
   - 기본: 보고서만 작성하고 코드 수정 금지.
   - `--taskify` 요청: `tasks/NNN-maintenance-<slug>/` 작업 초안을 만든다.
   - cleanup 실행 요청: 변경 전 회귀 테스트가 있거나 만들 수 있을 때만 `ai-slop-cleaner`로 넘긴다.
   - 다중 단계 또는 문서 영향이 있으면 `build-with-teams`로 넘긴다.

## 안전장치

- 먼저 삭제하거나 고치지 않는다.
  점검 결과와 실행 후보를 분리한다.
- 한 PR/작업은 한 냄새 계열만 다룬다.
  죽은 코드, 중복, 경계 정리, 문서 부패를 섞지 않는다.
- 동작 변경 가능성이 있으면 회귀 테스트를 먼저 추가하는 작업으로 만든다.
- 기존 `AGENTS.md`, `docs/adr/`, `docs/code-architecture.md`, `.agents/skills/_shared/pitfalls/`를 repo-local 계약으로 본다.
- CI가 이미 잡는 포맷/타입 오류만 반복 보고하지 않는다.
  보고서는 사람이 판단해야 하는 구조 문제와 반복 패턴에 집중한다.
- skill/docs 규칙은 "사용자가 지시했다"는 이유만으로 유지하지 않는다.
  반복성, 위험도, 코드/설정 자명성, LLM 기본 행동 여부, 정적 도구 대체 가능성, stale 여부를 함께 본다.
  이 판단은 `docs-check`의 사용자 지시·규칙 품질 점검으로 넘긴다.
- public repo 식별자 검사를 유지한다.
  실제 도메인, appkey, secret, tenant, instance id 후보는 반드시 P0로 분류한다.

## 산출물

짧은 요청이면 대화 요약으로 끝낸다.
주간/full 점검이면 `reports/maintenance/YYYY-MM-DD-<mode>.md` 생성을 제안하거나 사용자가 요청했을 때만 파일로 쓴다.

보고서에는 다음을 포함한다.

- 점검 범위와 근거: 기간, 비교 기준, git/PR 명령 결과.
- 요약: P0/P1/P2/Defer 개수.
- 발견 항목: 파일/경로, 근거, 중요한 이유, 다음 행동.
- 리팩토링 후보: 작은 작업 단위로 쪼갠 후보.
- 권장 실행 경로: `build-with-teams`, `ai-slop-cleaner`, `docs-check`, 또는 조치 없음.
- 검증 계획: 각 후보를 안전하게 증명할 최소 테스트/빌드/grep.

## 작업화 규칙

`--taskify` 또는 사용자가 실행 가능한 backlog를 원하면 다음 기준을 따른다.

- `P0`는 독립 작업으로 먼저 만든다.
- `P1` 중복/경계 후보는 관련 파일 2~5개 이하로 제한한다.
- `P2`는 여러 개를 한 작업에 묶지 말고 보류 backlog로 둔다.
- 새 추상화는 다음 조건 중 하나를 만족할 때만 제안한다.
  - 같은 로직이 3곳 이상 반복된다.
  - 같은 review 지적이 2회 이상 반복됐다.
  - 공개 command 동작을 일관화하면서 테스트로 고정할 수 있다.
- 작업 파일에는 반드시 "동작 고정" 단계 또는 검증 기준을 넣는다.

## 넘겨줄 흐름

- 문서 부패 중심이면 `docs-check`를 먼저 실행한다.
- skill 규칙 품질, 사용자 지시 영속화, pitfall prune, 정적 도구화 후보가 핵심이면 `docs-check`를 먼저 실행한다.
- 코드 냄새 cleanup이면 `ai-slop-cleaner`에 파일 범위를 넘긴다.
- 여러 단계, 문서 갱신, critic/docs-verifier가 필요하면 `build-with-teams`로 넘긴다.
- 단순 PR diff review면 `code-review`를 사용하고 이 스킬은 사용하지 않는다.
