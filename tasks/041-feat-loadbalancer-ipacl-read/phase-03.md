# Phase 03 — 통합 검증과 공개 사용 문서

**Execution profile**: fast
**Status**: completed

---

## 목표

조회 명령의 빌드·테스트·metadata를 검증하고 README와 공개 skill을 실제 명령 표면에 맞춘다.
문서 예시는 사람뿐 아니라 AI 에이전트가 그대로 복사해 사용할 수 있는 비대화형 형식으로 작성한다.

**범위 외**: 쓰기 명령과 안전 경고는 후속 `041-2-feat-loadbalancer-ipacl-write`에서 문서를 확장한다.

---

## 작업 항목 (4)

### 1. 통합 검증

타입 검사, 단위 테스트, bundle build를 순서대로 실행한다.
실패하면 원인을 고치고 같은 검증을 다시 실행한다.

### 2. command catalog 검증

`commands --json`을 파싱해 catalog 항목 수가 141인지 검사한다.
아래 경로가 정확히 한 번씩 존재하는지 검사한다.

- `loadbalancer list`
- `loadbalancer get`
- `loadbalancer ipacl list`
- `loadbalancer ipacl get`
- `loadbalancer ipacl target list`

catalog node 수 기준은 plan 시작 시 측정한 133개와 이 plan의 신규 8개 노드다.

### 3. 사용자 문서

- `README.md`: 지원 명령 수를 141로 갱신하고 Load Balancer/IP ACL 조회 예시를 추가한다.
- `skills/nhncloud-cli/SKILL.md`: frontmatter 설명과 본문 router에 Load Balancer 조회를 추가한다.
- `skills/nhncloud-cli/references/loadbalancer.md`: 명령 표, 이름·UUID 규칙, table·JSON·quiet 출력, stdout·stderr 계약을 기록한다.

placeholder만 사용하고 실제 credential, 사내 도메인, 리소스 UUID를 넣지 않는다.
`AGENTS.md`와 `CLAUDE.md`의 147개는 읽기·쓰기 두 plan의 docs-first 최종 목표이므로 141로 되돌리지 않는다.

### 4. 문서·task 상태 검증

문서의 명령명과 `--help` 출력을 대조한다.
Phase 3을 `completed`, `current_phase`를 `4`로 갱신한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `README.md` | 조회 명령·catalog 수 |
| `skills/nhncloud-cli/SKILL.md` | frontmatter·router |
| `skills/nhncloud-cli/references/loadbalancer.md` | 신규 |
| `tasks/041-feat-loadbalancer-ipacl-read/index.json` | 상태 갱신 |

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm test
pnpm run build
node dist/index.js commands --json | jq -e '.commands | length == 141'
node dist/index.js commands --json | jq -e '
  .commands | map(.path) as $paths
  | ["loadbalancer list", "loadbalancer get", "loadbalancer ipacl list", "loadbalancer ipacl get", "loadbalancer ipacl target list"]
  | all(. as $path | ([ $paths[] | select(. == $path) ] | length) == 1)
'
node dist/index.js loadbalancer --help
node dist/index.js loadbalancer ipacl target list --help
node dist/index.js loadbalancer --help | grep -E "Agent workflow|loadbalancer list --json|loadbalancer ipacl list --json"
node dist/index.js loadbalancer list --help | grep -q -- "--json"
node dist/index.js loadbalancer list --help | grep -q -- "--quiet"
node dist/index.js loadbalancer get --help | grep -q -- "--json"
node dist/index.js loadbalancer get --help | grep -q -- "--quiet"
node dist/index.js loadbalancer ipacl list --help | grep -q -- "--json"
node dist/index.js loadbalancer ipacl list --help | grep -q -- "--quiet"
node dist/index.js loadbalancer ipacl get --help | grep -q -- "--json"
node dist/index.js loadbalancer ipacl get --help | grep -q -- "--quiet"
node dist/index.js loadbalancer ipacl target list --help | grep -q -- "--json"
node dist/index.js loadbalancer ipacl target list --help | grep -q -- "--quiet"
git diff --check
```

```bash
# cwd: <repo root>
if grep -rnoE "(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)" README.md skills/ docs/ AGENTS.md CLAUDE.md src/ 2>/dev/null \
  | grep -vE "nhncloud\.com|nhncloudservice\.com|github\.com|npmjs\.com|example\.com|openai\.com|anthropic\.com"; then
  exit 1
fi
if grep -rnE "(secret|password|appkey)['\"]?[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9]{16,}" README.md skills/ docs/ AGENTS.md CLAUDE.md src/ 2>/dev/null; then
  exit 1
fi
```

성공 기준:

- 타입 검사·테스트·build·`jq -e`·`git diff --check`가 모두 종료 코드 0이다.
- 개인 식별 정보 검사는 출력이 0줄이다.
- executor는 cloud credential을 사용하거나 실제 NHN Cloud API를 호출하지 않는다.

## 의도 메모

- README와 공개 skill은 구현이 확정된 뒤 갱신해 문서가 명령보다 앞서지 않게 한다.
- 실제 조회 smoke는 이 plan의 merge 조건이 아니다. 모든 executor 검증은 offline 또는 모의 응답으로 재현 가능해야 한다.

## Blocked 조건

- catalog 항목 수가 141이 아니면 `PHASE_BLOCKED: command catalog 등록 또는 기준 수 확인 필요`를 보고하고 문서 숫자를 임의로 맞추지 않는다.
