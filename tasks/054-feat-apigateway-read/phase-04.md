# Phase 04 — 통합 검증과 사용자 가이드 docs 갱신

**Execution profile**: fast
**Status**: pending

---

## 목표

앞선 세 phase 의 산출물을 통합 검증하고 사용자 가이드에 `apigateway` 명령군을 반영한다.

**범위 외**: 결정 docs(`docs/adr/`·`docs/code-architecture.md`·`docs/data-schema.md`·`docs/prd.md`)는 planning 단계에서 이미 반영·커밋했다. 이 phase 에서 다시 고치지 않는다.
커밋·push·PR 생성은 team-lead 가 한다.

---

## 실행 전제

```bash
# cwd: <repo root>
# branch: feat/054-apigateway-read
set -e
test -f src/commands/apigateway/deploy.ts
rg -q 'getLatestDeploy' src/services/apigateway/client.ts
```

Phase 1~3 산출물이 없으면 `PHASE_BLOCKED: 선행 phase 미완` 을 보고하고 멈춘다.

---

## 작업 항목 (4)

### 1. `skills/nhncloud-cli/references/apigateway.md` 신규

에이전트가 읽는 단일 소스다. `references/ncs.md` 의 구성을 따른다.

담을 것은 다섯 가지다.

- 명령 10개의 경로·인수·옵션 표
- 인증과 사전 조건 — 공통 UAK 와 `apigateway.appkey`, region kr1·kr2·kr3
- **JSON shape 요약** — 각 명령의 최상위 키. 목록과 단건이 다르다는 점(`apigwServiceList` 대 `apigwService`)을 명시한다
- pagination 이 엔드포인트마다 다르다는 점 — `service list`·`stage list`·`stage deploy list` 만 전수 수집이고 `resource list`·`stage resources` 는 단일 호출이다
- 자동화 시나리오 — `service list --quiet` 로 id 를 얻어 `stage list` 에 넘기고, `stage swagger --output` 으로 스펙을 저장해 저장소 파일과 대조하는 흐름

`resourceUpdatedAt` 이 배포 시점이 아니라 리소스를 스테이지에 가져온 일시라는 점도 적는다. 혼동하기 쉽다.

### 2. `skills/nhncloud-cli/SKILL.md` — 라우터에 행 추가

참조 라우터 표에 `API Gateway 서비스·리소스·스테이지·배포 조회와 Swagger export | apigateway.md` 행을 더한다.

**프론트매터 `description` 도 함께 고친다.** 본문 표만 고치고 프론트매터를 빠뜨리는 사고가 이 저장소에서 두 번 반복됐다(PR #11·#13). description 은 에이전트가 스킬을 고르는 트리거라 누락되면 새 명령이 자연어 매칭에서 빠진다.

### 3. `README.md` — 직접 쓰기 예시에 한 줄 추가

"에이전트 없이 직접 쓰기" 절의 명령 목록에 `nhncloud apigateway service list` 를 더한다.
README 는 라우터형이라 상세는 두지 않는다 — 명령 10개 전체 목록은 `references/apigateway.md` 가 소유한다.

`--help` 안내 문구의 명령 수(현재 149)를 실측값으로 갱신한다.

### 4. `index.json` 완료 마킹

`tasks/054-feat-apigateway-read/index.json` 에서 task `status` 를 `completed`, `current_phase` 를 `4`, 네 phase 의 `status` 를 모두 `completed` 로 바꾼다. `updated_at` 도 실행 시각으로 갱신한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `skills/nhncloud-cli/references/apigateway.md` | 신규 |
| `skills/nhncloud-cli/SKILL.md` | 수정 (라우터 행, 프론트매터 description) |
| `README.md` | 수정 (명령 예시 한 줄, 명령 수) |
| `tasks/054-feat-apigateway-read/index.json` | 수정 (완료 마킹) |

## 검증

```bash
# cwd: <repo root>
# branch: feat/054-apigateway-read
# shell: bash 또는 zsh — POSIX sh 로 실행하지 않는다 (함수 안에서 local 을 쓴다)
set -e

# 1. 통합 빌드 검증
pnpm tsc --noEmit 2>&1 | grep -c '^src/' | grep -qx 0
pnpm test
pnpm run build

# 2. 명령 10개가 카탈로그에 있다
for p in "apigateway service list" "apigateway service get" \
         "apigateway resource list" "apigateway resource parameters" "apigateway resource responses" \
         "apigateway stage list" "apigateway stage swagger" "apigateway stage resources" \
         "apigateway stage deploy list" "apigateway stage deploy latest"; do
  node dist/index.js commands --json \
    | python3 -c "import json,sys;p='$p';ps={c['path'] for c in json.load(sys.stdin)['commands']};sys.exit(0 if p in ps else 1)" \
    || { echo "MISSING COMMAND: $p"; exit 1; }
done

# 3. 카탈로그 수가 실측값과 일치하고 README 도 같은 수를 적는다
COUNT=$(node dist/index.js commands --json | python3 -c 'import json,sys;print(len(json.load(sys.stdin)["commands"]))')
test "$COUNT" = "159"
grep -q "$COUNT" README.md

# 4. 사용자 가이드 세 곳이 갱신됐다
test -f skills/nhncloud-cli/references/apigateway.md
rg -q "apigateway" skills/nhncloud-cli/SKILL.md
rg -q "apigateway" README.md

# 5. SKILL.md 프론트매터 description 에도 반영됐다 (본문만 고치는 사고 방지)
python3 -c "
import sys, pathlib
t = pathlib.Path('skills/nhncloud-cli/SKILL.md').read_text(encoding='utf-8')
fm = t.split('---')[1] if t.startswith('---') else ''
sys.exit(0 if 'API Gateway' in fm or 'apigateway' in fm else 1)
" || { echo "SKILL.md 프론트매터 description 미갱신"; exit 1; }

# 6. references 가 pagination 비대칭을 명시한다
rg -q "paging|전수 수집|단일 호출" skills/nhncloud-cli/references/apigateway.md

# 7. 결정 docs 는 이 phase 에서 바뀌지 않았다
git diff --quiet HEAD -- docs/adr docs/code-architecture.md docs/data-schema.md docs/prd.md

# 8. 완료 마킹
test "$(python3 -c 'import json;d=json.load(open("tasks/054-feat-apigateway-read/index.json"));print(d["status"],d["current_phase"],all(p["status"]=="completed" for p in d["phases"]))')" = "completed 4 True"

# 9. 사내 식별자·자격증명 노출 0건
test -z "$(grep -rnoE '(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)' README.md skills/ docs/ AGENTS.md CLAUDE.md src/ 2>/dev/null | grep -vE 'nhncloud\.com|nhncloudservice\.com|github\.com|npmjs\.com|example\.com|shields\.io|anthropic\.com|claude\.com')"
test -z "$(grep -rnE "(secret|password|appkey)['\"]?[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9]{16,}" README.md skills/ docs/ AGENTS.md src/ 2>/dev/null)"

git diff --check
test "$(git status --porcelain | grep -c '^??')" = "0"
```

## 의도 메모 (왜)

- 검증 2번이 명령 경로 10개를 하나씩 확인하는 이유는 카탈로그 총 수만 세면 어느 명령이 빠졌는지 드러나지 않기 때문이다. 특히 4단 경로(`stage deploy list`)는 등록 계층이 하나 더 깊어 누락되기 쉽다.
- 검증 3번이 README 의 명령 수를 카탈로그 실측과 대조하는 이유는 문서에 적힌 수치가 코드와 어긋나는 것이 이 저장소의 반복 지적 사항이기 때문이다.
- 검증 5번이 프론트매터를 따로 확인하는 이유는 본문 표만 고치고 프론트매터 description 을 빠뜨리는 사고가 PR #11·#13 에서 연속 발생했기 때문이다. 눈에 띄는 본문을 고치면 다 한 것처럼 느껴진다.
- 검증 7번이 결정 docs 무변경을 강제하는 이유는 planning 이 이미 커밋한 내용을 phase 가 덮어쓰면 이중 편집이 되기 때문이다.
- `AGENTS.md` 의 명령 카운트는 이 phase 에서 고치지 않는다. 실측값에 의존하는 결정 docs 라 team-lead 가 코드 커밋 뒤 별도 커밋으로 반영한다.

## Blocked 조건

- Phase 1~3 산출물이 없으면 `PHASE_BLOCKED: 선행 phase 미완` 을 보고하고 멈춘다.
- 카탈로그 수가 159 가 아니면 어느 phase 의 명령이 누락됐는지 확인하고 `PHASE_BLOCKED: 명령 등록 누락` 을 보고한다.
