# Phase 01: Commander 필수 옵션 종료 코드 정규화

**Execution profile**: deep

---

## 목표

Commander의 `requiredOption`이 필수 옵션 누락을 발견하면 기존 조기 검증과 오류 문구를 유지하면서 종료 코드만 입력 오류인 3으로 바꾼다.
명령 파일마다 수동 검증을 복제하지 않고 완성된 명령 트리 전체에 공통 정책을 적용한다.

현재 저장소에는 16개 파일의 `requiredOption` 호출 46개가 있으며 기본 종료 코드는 1이다.
수동 필수값 검증은 `NhnCloudCliError`와 `EXIT_PARAM_ERROR`를 사용해 종료 코드 3을 낸다.

**범위 외**: 모든 Commander 문법 오류를 종료 코드 3으로 바꾸기, 오류 문구 번역, 46개 `requiredOption`을 일반 옵션과 수동 검증으로 교체하기, 새 명령·옵션·의존성 추가는 다루지 않는다.
`AGENTS.md`, `docs/prd.md`, `docs/flow.md`, `docs/code-architecture.md`, `docs/adr/`는 planning의 docs-first 커밋 `fd9fbba`에서 갱신됐다.
이 phase에서 다시 편집하지 않는다.

---

## 작업 항목 (4)

### 1. 명령 트리 전체에 적용하는 오류 변환 helper를 만든다

`src/commands/commander-errors.ts`에 `configureCommanderExitCodes(root: Command): void`를 추가한다.
Commander의 공개 `command.commands`를 재귀 순회하며 root와 모든 하위 명령에 `exitOverride` callback을 설정한다.

callback은 받은 `CommanderError`를 다음 규칙으로 처리한다.

- `error.code === "commander.missingMandatoryOptionValue"`이면 기존 객체의 `exitCode`만 `EXIT_PARAM_ERROR`로 바꾼 뒤 다시 던진다.
- 다른 Commander 오류는 `code`, `exitCode`, `message`, `nestedError`를 바꾸지 않고 그대로 던진다.
- 숫자 리터럴 `3`을 쓰지 않고 `src/utils/exit-codes.ts`의 `EXIT_PARAM_ERROR`를 import한다.

helper는 stderr 출력, `process.exit`, 메시지 번역을 맡지 않는다.
`requiredOption` 뒤에 action 내부 수동 존재 검증을 새로 넣지 않는다.

### 2. 완성된 프로그램 트리에 공통 정책을 한 번 적용한다

`src/index.ts`에서 `configureCommanderExitCodes`를 import한다.
모든 `program.addCommand(...)`와 `program.addCommand(createCommandsCommand(program))`가 끝난 뒤, `program.parseAsync()` 직전에 helper를 호출한다.

`addCommand`는 root의 `exitOverride`를 기존 하위 명령에 자동 복제하지 않으므로 명령 등록 전에 호출하거나 root에만 적용하지 않는다.
기존 preAction과 preSubcommand hook의 순서, command catalog 생성 시점, 전역 옵션 처리는 바꾸지 않는다.

### 3. 최상위 catch에서 Commander 오류를 중복 출력하지 않는다

`src/index.ts`가 Commander의 `CommanderError`를 import하고 catch의 첫 분기에서 처리하게 한다.
Commander는 파서 오류와 도움말·버전을 출력한 뒤 `exitOverride` callback을 호출하므로 최상위 catch는 메시지를 다시 쓰지 않고 `process.exit(err.exitCode)`만 호출한다.

기존 경로는 유지한다.

- `NhnCloudCliError`: 현재 terminal sanitization과 `오류: ...` stderr 출력, 오류가 가진 종료 코드를 유지한다.
- 그 밖의 예상하지 못한 오류: 현재 sanitization과 stderr 출력, 종료 코드 1을 유지한다.

필수 옵션 누락의 stderr에는 Commander의 영문 오류가 정확히 한 번만 남고 별도의 `오류:` 줄이 추가되지 않아야 한다.

### 4. 종료 코드와 출력 계약을 단위 테스트로 고정한다

`src/commands/commander-errors.test.ts`를 추가한다.
테스트마다 새 `Command` 트리를 만들고 `configureOutput`으로 stdout과 stderr를 메모리에 모은 뒤 `configureCommanderExitCodes`를 마지막에 적용한다.
테스트 대상 파일 자체를 mock하지 않는다.

다음 경로를 각각 검증한다.

- 2단계 이상 중첩된 하위 명령의 필수 옵션 누락은 `code`가 `commander.missingMandatoryOptionValue`, `exitCode`가 3이다.
- 필수 옵션 누락 stderr는 기존 Commander 문구 한 줄이며 `오류:`가 중복되지 않는다.
- 알 수 없는 옵션 또는 불필요한 인수는 기존 Commander `code`와 종료 코드 1을 유지한다.
- 도움말과 버전은 종료 코드 0을 유지한다.
- action이 던진 `NhnCloudCliError`는 helper가 바꾸거나 가로채지 않는다.
- root와 하위 명령 모두 정책이 적용돼 재귀 누락을 검출한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/commands/commander-errors.ts` | 추가: 명령 트리 재귀 순회와 필수 옵션 종료 코드 정규화 |
| `src/commands/commander-errors.test.ts` | 추가: 오류 종류별 종료 코드·stderr·재귀 적용 회귀 테스트 |
| `src/index.ts` | 수정: 명령 등록 뒤 helper 적용과 Commander 오류 중복 출력 방지 |

## 검증

```bash
# cwd: <레포 루트>
./node_modules/.bin/vitest run src/commands/commander-errors.test.ts
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/tsup
```

세 명령은 종료 코드 0이어야 한다.

빌드 결과로 실제 프로세스 계약도 확인한다.

```bash
# cwd: <레포 루트>
VERIFY_DIR=$(mktemp -d)

set +e
node dist/index.js volume create 2>"$VERIFY_DIR/required.err"
required_status=$?
node dist/index.js logncrash search 2>"$VERIFY_DIR/manual.err"
manual_status=$?
node dist/index.js --unknown-option 2>"$VERIFY_DIR/unknown.err"
unknown_status=$?
node dist/index.js --help >"$VERIFY_DIR/help.out" 2>"$VERIFY_DIR/help.err"
help_status=$?
node dist/index.js --version >"$VERIFY_DIR/version.out" 2>"$VERIFY_DIR/version.err"
version_status=$?
set -e

test "$required_status" -eq 3
test "$manual_status" -eq 3
test "$unknown_status" -eq 1
test "$help_status" -eq 0
test "$version_status" -eq 0
test "$(grep -c "required option" "$VERIFY_DIR/required.err")" -eq 1
! grep -q '^오류:' "$VERIFY_DIR/required.err"
test "$(grep -c '^오류:' "$VERIFY_DIR/manual.err")" -eq 1
! grep -q '^오류:' "$VERIFY_DIR/unknown.err"
test ! -s "$VERIFY_DIR/help.err"
test ! -s "$VERIFY_DIR/version.err"
```

전체 블록이 종료 코드 0이어야 한다.
`volume create`는 API나 자격증명을 해석하기 전에 `--size` 누락을 발견해야 한다.
`logncrash search`는 기존 수동 `--query` 검증을 통과하지 못하고 API 호출 전에 끝나야 한다.

```bash
# cwd: <레포 루트>
grep -n 'configureCommanderExitCodes' src/index.ts src/commands/commander-errors.ts
grep -n 'commander.missingMandatoryOptionValue' src/commands/commander-errors.ts
```

두 grep은 각각 출력이 있어야 한다.

## 의도 메모

- `requiredOption`을 유지하면 Commander의 help metadata와 action 전 조기 검증을 잃지 않는다.
- 오류 변환은 명령 트리 구성과 별도 파일에 둬 각 서비스 command 파일이 전역 종료 정책을 소유하지 않게 한다.
- Commander가 이미 출력한 메시지를 최상위 catch에서 다시 출력하지 않아 기존 문구를 보존하면서 중복만 막는다.
- 필수 옵션 누락만 바꾸므로 다른 파서 오류를 종료 코드로 분기하는 기존 자동화에 영향을 주지 않는다.

## Blocked 조건

- `docs/adr/035-required-option-exit-code.md`가 없거나 위 종료 코드 경계와 다르면 `PHASE_BLOCKED: ADR-035 계약 불일치`를 출력하고 종료한다.
- 설치된 Commander가 `commander.missingMandatoryOptionValue`와 `exitOverride` callback을 제공하지 않으면 실제 타입과 런타임을 확인한 근거를 남기고 `PHASE_BLOCKED: Commander 오류 계약 불일치`를 출력하고 종료한다.
- 현재 브랜치에 phase 시작 전 `src/index.ts` 동시 변경이 있어 최상위 catch를 안전하게 분리할 수 없으면 `PHASE_BLOCKED: index 동시 변경 충돌`을 출력하고 종료한다.
