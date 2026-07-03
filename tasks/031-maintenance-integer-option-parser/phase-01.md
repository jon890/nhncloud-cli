# Phase 01 — 숫자 옵션 parser helper 일관화

## 목표

Issue #38의 유지보수 항목을 처리한다.
CLI 숫자 옵션 파싱을 공통 helper로 일관화해 `parseInt` 부분 파싱과 `Number()` 지수·공백 허용을 제거한다.

유효한 숫자 입력의 동작은 유지한다.
잘못된 숫자 표기만 더 일찍, 더 일관된 `EXIT_PARAM_ERROR`로 거부한다.

## 구현 가능성

- 외부 의존성 추가는 필요 없다.
- DB, API, 인증, endpoint 변경은 없다.
- 기존 `NhnCloudCliError`와 `EXIT_PARAM_ERROR`를 그대로 사용한다.
- 기존 command 구조에서 spinner와 자격증명 resolve 전에 파라미터 검증을 수행하는 패턴을 유지한다.

## 적용 범위

이번 task에서는 아래 5개 명령만 우선 적용한다.
NKS 명령은 별도 구현 세션에서 같은 helper를 재사용한다.

- `src/commands/instance/create.ts`
- `src/commands/instance/images.ts`
- `src/commands/instance/flavors.ts`
- `src/commands/logncrash/search.ts`
- `src/commands/deploy/run.ts`

## parser 정책

새 helper는 `src/commands/parse-options.ts`에 둔다.
테스트는 `src/commands/parse-options.test.ts`에 둔다.

권장 helper:

- `parsePositiveIntegerOption(value, flag)`
  - `1`, `10` 허용.
  - `0`, 음수, 빈 문자열, 공백, 소수, 지수 표기, suffix 문자는 거부.
- `parseNonNegativeIntegerOption(value, flag)`
  - `0`, `1`, `10` 허용.
  - 음수, 빈 문자열, 공백, 소수, 지수 표기, suffix 문자는 거부.
- `parseIntegerOption(value, flag, { min, max })`
  - 내부 공통 구현.
  - `min`과 `max`가 있으면 범위 밖 값을 거부한다.

오류 메시지는 입력값을 `JSON.stringify(value)`로 표시한다.
빈 문자열이나 공백 입력도 사람이 구분할 수 있어야 한다.

## 명령별 정책

| 명령 | 옵션 | 정책 |
|---|---|---|
| `instance create` | `--timeout <sec>` | 1 이상 정수 |
| `instance create` | `--boot-volume-size <gb>` | 1 이상 정수 |
| `instance create` | `--ephemeral-disk-size <gb>` | 1 이상 정수 |
| `instance images` | `--limit <n>` | 1 이상 정수 |
| `instance flavors` | `--min-disk <gb>` | 0 이상 정수 |
| `instance flavors` | `--min-ram <mb>` | 0 이상 정수 |
| `logncrash search` | `--page <n>` | 0 이상 정수 |
| `logncrash search` | `--size <n>` | 1 이상 100 이하 정수 |
| `deploy run` | `--concurrent <n>` | 1 이상 정수 |

`logncrash search --size`의 최대 100 제한은 유지한다.
공식 API 범위는 이미 기존 코드와 help에 반영되어 있으므로 새 범위 추정은 하지 않는다.

## 구현 항목

### 1. 공용 parser 추가

- `src/commands/parse-options.ts`
  - `parseIntegerOption`
  - `parsePositiveIntegerOption`
  - `parseNonNegativeIntegerOption`
- 정규식은 십진 숫자 표기만 허용한다.
  - 양의 정수: `/^[1-9]\d*$/`
  - 0 이상 정수: `/^(0|[1-9]\d*)$/`
- `Number()`는 정규식 검증 후 변환에만 사용한다.

### 2. 단위 테스트 추가

- `src/commands/parse-options.test.ts`
- 정상 케이스:
  - positive: `"1"`, `"10"`
  - non-negative: `"0"`, `"1"`, `"10"`
  - range: min/max 경계값
- 거부 케이스:
  - `""`
  - `" "`
  - `"01"` 또는 정책상 허용하지 않을 선행 0 표기
  - `"1e2"`
  - `"10abc"`
  - `"1.5"`
  - `"-1"`
- 오류는 `NhnCloudCliError`이고 `exitCode`는 `EXIT_PARAM_ERROR`.

### 3. 대상 명령 적용

- 파일 내부 `parsePositiveInt` / `parseNonNegInt` helper는 제거한다.
- inline `parseInt`는 공용 helper 호출로 교체한다.
- spinner 시작 전 파라미터 검증 위치를 유지한다.
- `deploy run`은 `client.run()` 인자 구성 전에 `concurrentNum`을 검증한 변수로 만든다.
  spinner 내부에서 처음 파싱하지 않는다.

### 4. task 상태 갱신

- `tasks/031-maintenance-integer-option-parser/index.json`
  - Phase 1 완료 시 `status: completed`
  - `current_phase: 1` 유지
  - phase status를 `completed`로 갱신

## 회피 항목

구현 전후로 다음 pitfall을 읽고 self-check한다.

- `.agents/skills/_shared/pitfalls/code-review/positive-int-number-only.md`
- `.agents/skills/_shared/pitfalls/plan/numeric-param-range-unverified.md`
- `.agents/skills/_shared/pitfalls/plan/stale-code-in-reuse-claim.md`

필수 grep:

```bash
grep -rnE "parseInt\\(" \
  src/commands/instance/create.ts \
  src/commands/instance/images.ts \
  src/commands/instance/flavors.ts \
  src/commands/logncrash/search.ts \
  src/commands/deploy/run.ts
grep -rnE "Number\\(value\\)|Number\\(opts\\." src/commands
```

첫 번째 grep은 0건이어야 한다.
두 번째 grep은 공용 helper 내부 또는 정규식 선검증이 있는 기존 비대상 파일만 남아야 한다.

## 완료 조건

1. `pnpm build` 정상.
2. `pnpm test` 정상.
3. `src/commands/parse-options.test.ts`가 정상/거부 케이스를 모두 검증한다.
4. 대상 5개 명령에서 숫자 옵션 직접 `parseInt`가 사라진다.
5. 대상 5개 명령에서 regex 없는 `Number()` 기반 parser가 사라진다.
6. `node dist/index.js instance create --help` 정상.
7. `node dist/index.js instance images --help` 정상.
8. `node dist/index.js instance flavors --help` 정상.
9. `node dist/index.js logncrash search --help` 정상.
10. `node dist/index.js deploy run --help` 정상.

## 변경 파일

- `src/commands/parse-options.ts`
- `src/commands/parse-options.test.ts`
- `src/commands/instance/create.ts`
- `src/commands/instance/images.ts`
- `src/commands/instance/flavors.ts`
- `src/commands/logncrash/search.ts`
- `src/commands/deploy/run.ts`
- `tasks/031-maintenance-integer-option-parser/index.json`

## 커밋

```bash
git commit -m "refactor(commands): standardize integer option parsing"
```
