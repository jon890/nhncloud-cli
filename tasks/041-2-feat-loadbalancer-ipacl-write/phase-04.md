# Phase 04 — 통합 검증과 공개 사용·안전 문서

**Execution profile**: fast
**Status**: completed

---

## 목표

쓰기 명령의 type·test·build·metadata 계약을 검증한다.
README와 공개 skill에 비대화형 안전 옵션, 재바인딩, 부분 실패 복구 방법을 실제 명령 표면과 일치하게 기록한다.

**범위 외**: 실제 cloud 쓰기 호출과 사람 승인형 대화 입력은 검증에 포함하지 않는다.

---

## 작업 항목 (4)

### 1. 통합 검증

타입 검사, 단위 테스트, bundle build를 순서대로 실행한다.
실패하면 원인을 고치고 같은 검증을 다시 실행한다.
`src/commands/loadbalancer/commands.test.ts`의 leaf help 회귀 테스트가 신규 6개 쓰기 경로까지 포함하는지 확인한다.

### 2. command catalog 검증

`commands --json`의 `.commands` 배열 항목 수가 147인지 검사한다.
읽기 plan의 141개에 이 plan의 신규 6개 노드가 추가되는 기준이다.

아래 경로가 정확히 한 번씩 존재하는지 검사한다.

- `loadbalancer ipacl create`
- `loadbalancer ipacl delete`
- `loadbalancer ipacl target add`
- `loadbalancer ipacl target remove`
- `loadbalancer set-ipacl`
- `loadbalancer clear-ipacl`

### 3. 사용자·agent 문서

- `README.md`: 지원 명령 수를 147로 갱신하고 쓰기 예시, `--yes`, `--no-rebind`, partial 복구를 추가한다.
- `skills/nhncloud-cli/SKILL.md`: frontmatter 설명과 router에 Load Balancer IP ACL 쓰기·안전 규칙을 반영한다.
- `skills/nhncloud-cli/references/loadbalancer.md`: 그룹·대상·연결 명령, stdout·stderr·exit code, JSON 예제, retry 명령, 전파 지연과 VPC CIDR 조건을 추가한다.

실제 credential, 사내 도메인, 사용자 리소스 ID 대신 placeholder를 쓴다.

### 4. 상태 갱신

문서의 명령명·옵션과 `--help`를 대조한다.
Phase 4를 `completed`, `current_phase`를 `5`로 갱신한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `README.md` | 쓰기 예시·catalog 수 |
| `skills/nhncloud-cli/SKILL.md` | frontmatter·router |
| `skills/nhncloud-cli/references/loadbalancer.md` | 안전·복구 계약 확장 |
| `tasks/041-2-feat-loadbalancer-ipacl-write/index.json` | 상태 갱신 |

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm test
pnpm run build
node dist/index.js commands --json | jq -e '.commands | length == 147'
node dist/index.js commands --json | jq -e '
  .commands | map(.path) as $paths
  | ["loadbalancer ipacl create", "loadbalancer ipacl delete", "loadbalancer ipacl target add", "loadbalancer ipacl target remove", "loadbalancer set-ipacl", "loadbalancer clear-ipacl"]
  | all(. as $path | ([ $paths[] | select(. == $path) ] | length) == 1)
'
assert_help_flags() {
  help_output="$(node dist/index.js "$@" --help)"
  for flag in --json --quiet --region --profile; do
    printf '%s\n' "$help_output" | grep -q -- "$flag"
  done
}
assert_help_flags loadbalancer ipacl create
assert_help_flags loadbalancer ipacl delete
assert_help_flags loadbalancer ipacl target add
assert_help_flags loadbalancer ipacl target remove
assert_help_flags loadbalancer set-ipacl
assert_help_flags loadbalancer clear-ipacl
for command_path in \
  "loadbalancer ipacl delete" \
  "loadbalancer ipacl target add" \
  "loadbalancer ipacl target remove" \
  "loadbalancer set-ipacl" \
  "loadbalancer clear-ipacl"; do
  node dist/index.js $command_path --help | grep -q -- "--yes"
done
node dist/index.js loadbalancer ipacl target add --help | grep -q -- "--no-rebind"
node dist/index.js loadbalancer ipacl target remove --help | grep -q -- "--no-rebind"
node dist/index.js loadbalancer set-ipacl --help | grep -q -- "--group"
git diff --check
```

```bash
# cwd: <repo root>
grep -rnoE "(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)" README.md skills/ docs/ AGENTS.md CLAUDE.md src/ 2>/dev/null \
  | grep -vE "nhncloud\.com|nhncloudservice\.com|github\.com|npmjs\.com|example\.com|openai\.com|anthropic\.com"
grep -rnE "(secret|password|appkey)['\"]?[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9]{16,}" README.md skills/ docs/ AGENTS.md CLAUDE.md src/ 2>/dev/null
```

성공 기준:

- 타입 검사·테스트·build·catalog·`git diff --check`가 통과한다.
- 신규 6개 leaf help가 전역·지역·쓰기 안전 옵션을 실제 계약대로 노출한다.
- 개인 식별 정보 검사는 출력이 0줄이다.
- 실제 NHN Cloud 쓰기 요청은 0회다.

## 의도 메모

- 공개 문서는 구현 결과와 같은 phase에서 검증해 옵션과 출력 drift를 막는다.
- agent는 JSON과 종료 코드로 partial을 판정하고 stderr에서 운영 경고를 수집할 수 있다.

## Blocked 조건

- catalog 항목 수가 147이 아니면 `PHASE_BLOCKED: command catalog 등록 또는 기준 수 확인 필요`를 보고하고 문서 숫자를 임의로 맞추지 않는다.
