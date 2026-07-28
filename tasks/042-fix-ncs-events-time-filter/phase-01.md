# Phase 01 — 공유 시간 정규화와 logs·events 연결

**Execution profile**: standard
**Status**: pending

---

## 목표

`workload logs`와 `workload events`의 `--from`·`--to`를 같은 규칙으로 검증하고 UTC 초 단위 `Z` 문자열로 바꾼다.
잘못된 시간 입력은 자격증명 조회, 스피너, API 접근 전에 `EXIT_PARAM_ERROR`로 끝낸다.

**범위 외**: NCS endpoint, 인증, 응답 형식, 출력 열, 저장 상태는 바꾸지 않는다.

---

## 실행 전제

구현 전에 최신 `origin/main`을 반영한다.
#58의 ADR-022가 병합된 뒤 실행해도 ADR 번호와 command catalog 기준이 자연스럽게 이어져야 한다.

```bash
# cwd: <repo root>
set -e
test "$(git branch --show-current)" = "fix/042-fix-ncs-events-time-filter"
git fetch origin
if ! git merge-base --is-ancestor origin/main HEAD; then
  git rebase origin/main
  git push --force-with-lease origin fix/042-fix-ncs-events-time-filter
fi
test -f docs/adr/022-loadbalancer-ipacl-safety.md
test -f src/commands/loadbalancer/binding.ts
test -f tasks/041-2-feat-loadbalancer-ipacl-write/index.json
```

선행 파일이 없으면 `PHASE_BLOCKED: #58 읽기·쓰기 PR 병합 필요`를 보고한다.
rebase 충돌이 #54 범위를 벗어나면 `PHASE_BLOCKED: origin/main 충돌 해결 범위 확인 필요`를 보고한다.

---

## 확정 근거와 계약

- 공식 NCS 문서는 `events`의 `from`·`to` 쿼리를 제공하지만 형식은 명시하지 않는다.
- 2026-07-27 조회 실측에서 쿼리 생략, UTC `Z` 초·밀리초, 한쪽 옵션은 성공했다.
- 시간대 오프셋, 시간대 없는 절대시간, 유닉스 초·밀리초, 상대시간 원문은 서버 내부 오류를 반환했다.
- 같은 제약이 `logs`에도 적용됐고, `ky`는 `+09:00`의 `+`를 `%2B`로 인코딩했다.
- `docs/adr/023-ncs-workload-time-filter-utc.md`가 입력과 정규화 결정의 단일 소스다.
- 새 dependency, endpoint, credential, cache, schema를 추가하지 않는다.
- `src/utils/time.ts`는 Log & Crash 전용 지역 시간 계약이므로 재사용하거나 바꾸지 않는다.

---

## 작업 항목 (4)

### 1. 순수 시간 범위 정규화 함수

`src/commands/ncs/helpers.ts`에 다음 계약의 순수 함수를 추가한다.

```ts
normalizeNcsTimeRange(
  from?: string,
  to?: string,
  now?: Date,
): { from?: string; to?: string }
```

- 절대시간은 날짜, 시, 분, 초, 명시적 시간대가 있는 RFC3339만 받는다.
  소수 초와 `Z` 또는 `±HH:mm` 오프셋을 허용한다.
- 상대시간은 `now` 또는 음이 아닌 정수와 `m`·`h`·`d` 단위만 받는다.
  예시는 `30m`, `1h`, `2d`다.
- 함수 호출마다 기준 시각을 한 번만 캡처하고 두 값에 공유한다.
  `now` 인수가 있으면 테스트 기준 시각으로 사용한다.
- 출력은 `YYYY-MM-DDTHH:mm:ssZ`로 고정하고 소수 초를 제거한다.
- 둘 다 없으면 빈 객체, 한쪽만 있으면 해당 필드만 반환한다.
- 존재하지 않는 날짜, 잘못된 시각·오프셋, 시간대 없는 절대시간, `Number.isSafeInteger`와 유효한 `Date` 범위를 벗어난 상대시간, `from > to`를 `NhnCloudCliError`와 `EXIT_PARAM_ERROR`로 거부한다.
- 오류 문구에 실패한 옵션과 허용 예시를 포함해 AI 에이전트가 입력을 수정할 수 있게 한다.

### 2. logs·events command 연결

`src/commands/ncs/workload.ts`의 두 action에서 필수 인자를 확인한 직후 정규화 함수를 호출한다.
반환된 `from`·`to`만 기존 client 쿼리에 전달한다.
두 명령의 `--from`·`--to` 도움말에는 시간대 포함 RFC3339, 상대시간, UTC 정규화와 옵션 생략 시 API 기본 범위 유지 계약을 반영한다.

호출 순서는 아래 계약을 지킨다.

1. 기존 필수 인자와 시간 범위를 검증한다.
2. `resolveNcsClient`로 자격증명을 읽는다.
3. 스피너를 시작하고 API를 호출한다.
4. 데이터는 stdout, 스피너와 오류는 stderr에 유지한다.

명령 경로, 옵션 이름, 표·JSON·quiet 출력은 바꾸지 않는다.

### 3. 정규화와 부작용 경계 테스트

`src/commands/ncs/helpers.test.ts`에 다음을 추가한다.

- `+09:00`과 `Z` 입력의 UTC 초 단위 변환.
- 소수 초 제거와 윤년 2월 29일 허용.
- `30m`, `1h`, `2d`, `now`가 하나의 고정 기준 시각을 공유하는지 확인.
- 두 값 생략과 한쪽 값만 입력한 결과.
- 존재하지 않는 날짜, 시간대 누락, 잘못된 시각·오프셋·상대시간, 안전 범위 초과, 역전 범위의 `EXIT_PARAM_ERROR`.

`src/commands/ncs/workload.test.ts`를 추가해 잘못된 시간 입력에서는 `resolveNcsClient`, 스피너, client가 호출되지 않는지 확인한다.
정상 입력에서는 logs와 events 모두 client에 정규화된 값만 전달되는지 확인한다.

### 4. client 전달 계약 테스트와 상태 갱신

`src/services/ncs/client.test.ts`에서 logs와 events의 `searchParams`가 제공된 `from`·`to`를 정확히 전달하고 생략된 필드는 만들지 않는지 고정한다.
client 자체에 시간 파싱을 중복 구현하지 않는다.

Phase 1을 `completed`, `current_phase`를 `2`로 갱신한다.
검증 후 team-lead는 아래 코드·테스트 파일만 별도 커밋한다.
task 상태 파일은 Phase 3의 실행 기록 커밋까지 작업 트리에 유지한다.

- `src/commands/ncs/helpers.ts`
- `src/commands/ncs/helpers.test.ts`
- `src/commands/ncs/workload.ts`
- `src/commands/ncs/workload.test.ts`
- `src/services/ncs/client.test.ts`

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/commands/ncs/helpers.ts` | 시간 범위 정규화 |
| `src/commands/ncs/helpers.test.ts` | 입력·출력 경계 테스트 |
| `src/commands/ncs/workload.ts` | logs·events 선검증 연결·시간 옵션 도움말 |
| `src/commands/ncs/workload.test.ts` | 자격증명·API 이전 오류 테스트 |
| `src/services/ncs/client.test.ts` | 쿼리 전달 테스트 |
| `tasks/042-fix-ncs-events-time-filter/index.json` | 상태 갱신 |

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm test -- src/commands/ncs/helpers.test.ts src/commands/ncs/workload.test.ts src/services/ncs/client.test.ts
git diff --check
```

성공 기준은 세 명령의 종료 코드가 0이고, 잘못된 시간 입력 테스트에서 자격증명과 API 호출 수가 0인 것이다.

## Blocked 조건

- 실측 계약과 다른 공식 시간 형식 근거가 발견되면 `PHASE_BLOCKED: NCS 시간 형식 계약 재검토 필요`를 보고하고 추측 구현을 중단한다.
- Commander action을 테스트하기 위해 명령의 공개 경로나 실행 계약을 바꿔야 한다면 `PHASE_BLOCKED: command 부작용 경계 테스트 구조 재검토 필요`를 보고한다.
