# Phase 02 — 통합 검증과 AI 에이전트 사용 문서

**Execution profile**: fast
**Status**: completed

---

## 목표

시간 정규화가 기존 NCS 동작을 깨뜨리지 않는지 검사한다.
AI 에이전트가 허용 입력, stdout·stderr, 종료 코드를 명령 도움말과 공개 문서만으로 판정할 수 있게 한다.

**범위 외**: 실제 NHN Cloud 자격증명을 사용한 live 호출은 하지 않는다.

---

## 작업 항목 (4)

### 1. 타입·테스트·bundle 검증

타입 검사, 단위 테스트, bundle build를 순서대로 실행한다.
실패하면 원인을 고치고 같은 검증을 다시 실행한다.

### 2. 도움말과 command catalog 계약

- Phase 1에서 갱신한 logs와 events의 `--from`·`--to` 도움말이 시간대 포함 RFC3339, 상대시간, UTC 정규화를 표시하는지 검증한다.
- 두 옵션을 생략하면 API 기본 범위를 유지한다는 설명이 실제 도움말에 있는지 검증한다.
- `commands --json`에서 `ncs workload` 아래 기존 15개 path가 유지되고 새 path가 생기지 않았는지 검사한다.
- 출력 데이터는 stdout, 진행·오류는 stderr라는 기존 계약을 유지한다.

### 3. 사용자·AI 에이전트 문서

- `README.md`: logs와 events에 `--from 1h --to now` 예시와 허용 입력·오류 종료를 추가한다.
- `skills/nhncloud-cli/SKILL.md`: frontmatter 설명과 NCS router에 UTC 시간 필터 계약을 반영한다.
- `skills/nhncloud-cli/references/ncs.md`: 상대시간과 시간대 포함 절대시간 예시, 생략·한쪽 입력, `EXIT_PARAM_ERROR`, stdout·stderr 계약을 추가한다.
- 실제 credential, 사내 도메인, 사용자 리소스 ID 대신 placeholder를 쓴다.

### 4. 상태 갱신

문서의 명령명·옵션을 실제 `--help`와 대조한다.
Phase 2를 `completed`, `current_phase`를 `3`으로 갱신한다.
검증 후 team-lead는 README와 공개 skill 문서만 별도 커밋한다.
task 상태 파일은 Phase 3의 실행 기록 커밋까지 작업 트리에 유지한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `README.md` | NCS 시간 필터 예시 |
| `skills/nhncloud-cli/SKILL.md` | frontmatter·router |
| `skills/nhncloud-cli/references/ncs.md` | AI 에이전트 입력·출력 계약 |
| `tasks/042-fix-ncs-events-time-filter/index.json` | 상태 갱신 |

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm test
pnpm run build
node dist/index.js ncs workload logs --help
node dist/index.js ncs workload events --help
node dist/index.js commands --json | jq -e '.commands | length == 147'
node dist/index.js commands --json | jq -e '
  [
    "ncs workload",
    "ncs workload create",
    "ncs workload delete",
    "ncs workload events",
    "ncs workload get",
    "ncs workload history",
    "ncs workload history get",
    "ncs workload list",
    "ncs workload logs",
    "ncs workload patch",
    "ncs workload pause",
    "ncs workload restart",
    "ncs workload resume",
    "ncs workload schedule-history",
    "ncs workload update"
  ] as $expected
  | ([.commands[].path | select(startswith("ncs workload"))] | sort) == ($expected | sort)
'
git diff --check
```

```bash
# cwd: <repo root>
domain_findings="$(
  grep -rnoE "(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)" README.md skills/ docs/ AGENTS.md CLAUDE.md src/ 2>/dev/null \
    | grep -vE "nhncloud\.com|nhncloudservice\.com|github\.com|npmjs\.com|example\.com|openai\.com|anthropic\.com" \
    || true
)"
secret_findings="$(
  grep -rnE "(secret|password|appkey)['\"]?[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9]{16,}" README.md skills/ docs/ AGENTS.md CLAUDE.md src/ 2>/dev/null \
    || true
)"
test -z "$domain_findings"
test -z "$secret_findings"
```

성공 기준:

- 타입 검사, 테스트, build, 도움말, command catalog, `git diff --check`가 통과한다.
- #58 구현이 병합된 기준으로 command catalog 항목 수는 147이다.
- `ncs workload`의 기존 15개 command path는 늘거나 줄지 않는다.
- 개인 식별 정보 검사는 출력이 0줄이다.
- 실제 NHN Cloud 호출은 0회다.

## Blocked 조건

- 구현이 새 command path를 만들거나 기존 path를 제거하면 `PHASE_BLOCKED: command catalog 회귀 조사 필요`를 보고한다.
- command catalog가 147개가 아니면 `PHASE_BLOCKED: #58 선행 병합 또는 catalog 기준 확인 필요`를 보고한다.
- 도움말과 공개 skill이 실제 허용 형식을 다르게 설명하면 `PHASE_BLOCKED: 시간 입력 계약 문서 정합성 수정 필요`를 보고한다.
