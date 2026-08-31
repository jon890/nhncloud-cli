# Phase 02: Deploy 가이드 정합성과 전체 검증

**Execution profile**: standard

---

## 목표

Deploy 공개 가이드에 남은 필수 옵션 종료 코드 예외를 제거하고, 구현·공통 문서·실제 프로세스의 출력 계약이 일치하는지 전체 검증한다.
명령 표면이 바뀌지 않았음을 명령 카탈로그로 확인한 뒤 task를 완료 상태로 바꾼다.

**범위 외**: `src/commands/commander-errors.ts`, `src/index.ts`와 대상 테스트의 구현 책임은 phase-01에 있다.
새 명령·옵션, Commander 오류 문구 번역, 다른 문법 오류의 종료 코드 변경은 다루지 않는다.
planning 결정 문서와 ADR-035는 docs-first 커밋 `fd9fbba`에 있으므로 이 phase에서 편집하지 않는다.

이 phase는 phase-01의 대상 테스트와 실제 프로세스 검증이 통과한 상태를 전제한다.
필수 옵션 누락이 여전히 종료 코드 1이거나 stderr가 중복되면 base와 phase 상태를 확인하고 멈춘다.

---

## 작업 항목 (3)

### 1. Deploy 가이드의 종료 코드 예외를 제거한다

`skills/nhncloud-cli/references/deploy.md`의 “에러 코드” 표와 바로 아래 설명을 실제 공통 정책에 맞춘다.

- 좌표 옵션과 `--binary-group`·`--binary-key`·`--file`·`-o` 누락을 모두 종료 코드 3으로 설명한다.
- 수동 검증과 Commander의 검증 방식 때문에 종료 코드가 3과 1로 갈린다는 기존 문단을 제거한다.
- 오류 문구는 검증 방식에 따라 다를 수 있지만 필수 옵션 누락의 종료 코드는 같다고 짧게 설명한다.
- `README.md`, `skills/nhncloud-cli/references/common.md`, `skills/nhncloud-cli/references/troubleshooting.md`는 이미 필수 인자·옵션 누락을 종료 코드 3으로 설명하므로 내용을 복제하거나 불필요하게 고치지 않고 검증만 한다.

`skills/nhncloud-cli/SKILL.md`의 라우팅은 바뀌지 않으므로 편집하지 않는다.

### 2. 전체 코드·문서·명령 표면을 검증한다

대상 테스트, 타입 검사, 전체 테스트, 빌드를 순서대로 실행한다.
빌드 결과로 phase-01의 실제 프로세스 검증을 다시 실행하고, `commands --json`의 명령 수가 170개인지 확인한다.

기본 출력, `--json`, `--quiet`은 Commander 파서 오류를 stdout 데이터로 바꾸지 않아야 한다.
필수 옵션 누락과 알 수 없는 옵션은 stdout이 비어 있고 stderr에 Commander 오류가 한 번만 있어야 한다.

한국어·가독성 검사와 공개 정보 검사도 통과시킨다.

### 3. 검증 뒤 index.json을 완료 처리한다

모든 검증이 통과한 뒤 `tasks/067-fix-required-option-exit-code/index.json`을 다음 상태로 바꾼다.

- task `status`: `completed`
- `current_phase`: `2`
- phase 1과 phase 2의 `status`: 모두 `completed`
- `updated_at`: 완료 시점의 UTC ISO 8601 값
- `error_message`와 `blocked_reason`: `null` 유지

완료 마킹은 이 phase 산출물과 같은 최종 commit에 포함하도록 team-lead에 보고한다.
executor는 commit, push와 PR 생성을 수행하지 않는다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `skills/nhncloud-cli/references/deploy.md` | 수정: 모든 필수 옵션 누락의 종료 코드를 3으로 통일 |
| `tasks/067-fix-required-option-exit-code/index.json` | 수정: 검증 통과 뒤 task와 phase 완료 마킹 |

## 검증

```bash
# cwd: <레포 루트>
./node_modules/.bin/vitest run src/commands/commander-errors.test.ts
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run
./node_modules/.bin/tsup
node dist/index.js commands --json > /tmp/nhncloud-067-commands.json
node -e 'const fs=require("fs"); const x=JSON.parse(fs.readFileSync("/tmp/nhncloud-067-commands.json","utf8")); if(x.commands.length!==170) process.exit(1)'
git diff --check
```

모든 명령은 종료 코드 0이어야 하고 명령 카탈로그는 170개여야 한다.

```bash
# cwd: <레포 루트>
VERIFY_DIR=$(mktemp -d)

for mode in default json quiet; do
  case "$mode" in
    default) mode_flag=() ;;
    json) mode_flag=(--json) ;;
    quiet) mode_flag=(--quiet) ;;
  esac

  set +e
  node dist/index.js "${mode_flag[@]}" volume create >"$VERIFY_DIR/$mode.out" 2>"$VERIFY_DIR/$mode.err"
  mode_status=$?
  set -e

  test "$mode_status" -eq 3
  test ! -s "$VERIFY_DIR/$mode.out"
  test "$(grep -c "required option" "$VERIFY_DIR/$mode.err")" -eq 1
  ! grep -q '^오류:' "$VERIFY_DIR/$mode.err"
done

set +e
node dist/index.js logncrash search >"$VERIFY_DIR/manual.out" 2>"$VERIFY_DIR/manual.err"
manual_status=$?
node dist/index.js --unknown-option >"$VERIFY_DIR/unknown.out" 2>"$VERIFY_DIR/unknown.err"
unknown_status=$?
node dist/index.js --help >"$VERIFY_DIR/help.out" 2>"$VERIFY_DIR/help.err"
help_status=$?
node dist/index.js --version >"$VERIFY_DIR/version.out" 2>"$VERIFY_DIR/version.err"
version_status=$?
set -e

test "$manual_status" -eq 3
test "$unknown_status" -eq 1
test "$help_status" -eq 0
test "$version_status" -eq 0
test ! -s "$VERIFY_DIR/manual.out"
test ! -s "$VERIFY_DIR/unknown.out"
test "$(grep -c '^오류:' "$VERIFY_DIR/manual.err")" -eq 1
! grep -q '^오류:' "$VERIFY_DIR/unknown.err"
test ! -s "$VERIFY_DIR/help.err"
test ! -s "$VERIFY_DIR/version.err"
```

전체 블록은 종료 코드 0이어야 한다.

```bash
# cwd: <레포 루트>
~/.claude/scripts/korean-style-check.sh skills/nhncloud-cli/references/deploy.md
python3 ~/.claude/scripts/check-readability.py skills/nhncloud-cli/references/deploy.md

grep -n '| 3 | 입력 오류' README.md
grep -n '필수 옵션 누락' skills/nhncloud-cli/references/common.md skills/nhncloud-cli/references/troubleshooting.md skills/nhncloud-cli/references/deploy.md
! grep -n 'Commander.*1\|필수 옵션.*1' skills/nhncloud-cli/references/deploy.md
```

두 문서 검사기는 종료 코드 0이어야 한다.
첫 grep은 README의 입력 오류 종료 코드 3 행을 출력해야 한다.
두 번째 grep은 공통·문제 해결·Deploy 가이드의 필수 옵션 누락 계약을 출력해야 한다.
마지막 grep은 출력이 없어야 한다.

```bash
# cwd: <레포 루트>
# 공개 허용 목록 밖의 도메인은 출력이 없어야 한다.
if grep -rnoE "(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)" README.md skills/ docs/ AGENTS.md CLAUDE.md src/ 2>/dev/null \
  | grep -vE "nhncloud\.com|nhncloudservice\.com|github\.com|npmjs\.com|example\.com|openai\.com|anthropic\.com"; then exit 1; fi

# placeholder가 아닌 긴 비밀 형태는 출력이 없어야 한다.
if grep -rnE "(secret|password|appkey)['\"]?[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9]{16,}" README.md skills/ docs/ AGENTS.md CLAUDE.md src/ 2>/dev/null; then exit 1; fi

# task와 두 phase가 완료 상태여야 한다.
grep -c '"status": "completed"' tasks/067-fix-required-option-exit-code/index.json
grep -c '"current_phase": 2' tasks/067-fix-required-option-exit-code/index.json
```

보안 검사 두 개는 출력 없이 종료 코드 0이어야 한다.
첫 번째 완료 grep은 `3`, 두 번째 grep은 `1`을 출력해야 한다.

## 의도 메모

- 공개 문서의 단일 정책은 “사용자가 필수 입력을 빠뜨리면 종료 코드 3”이다.
  검증 구현 방식은 사용자 자동화가 알아야 할 예외가 아니다.
- README와 공통 reference는 이미 원하는 계약을 소유하므로 실제로 낡은 Deploy 문서만 고친다.
- `--json`과 `--quiet`도 파서 오류를 구조화된 stdout으로 바꾸지 않아 자동화가 stderr와 종료 코드를 일관되게 사용한다.
- 명령과 옵션을 추가하지 않으므로 카탈로그 개수는 바뀌지 않는다.

## Blocked 조건

- phase-01의 대상 테스트나 실제 프로세스 검증이 실패하면 `PHASE_BLOCKED: phase-01 종료 코드 계약 미완료`를 출력하고 종료한다.
- 명령 카탈로그가 170개가 아니면 구현에서 명령 표면이 바뀌었는지 조사하고, 의도하지 않은 변경이면 `PHASE_BLOCKED: 명령 카탈로그 변경`을 출력하고 종료한다.
- 공통 문서가 필수 입력 누락을 종료 코드 3이 아닌 값으로 정의하면 문서 단일 소스를 확인하고 `PHASE_BLOCKED: 공개 종료 코드 정책 불일치`를 출력하고 종료한다.
