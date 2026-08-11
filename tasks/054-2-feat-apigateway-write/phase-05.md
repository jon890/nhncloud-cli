# Phase 05 — 통합 검증, 사용자 가이드 갱신, 수동 QA 절차

**Execution profile**: standard

---

## 목표

세 명령의 표면을 확정한 뒤 사용자 가이드와 명령 카탈로그 수를 맞추고,
live 쓰기 검증 절차를 사용자가 실행할 수 있는 형태로 남긴다.

**이 phase 도 실제 쓰기 API 를 호출하지 않는다.**
운영 리소스를 바꾸는 호출은 아래 "수동 QA" 절의 절차로 사용자가 직접 수행한다.

**범위 외**: `docs/adr/`·`docs/prd.md`·`docs/flow.md`·`docs/code-architecture.md` 는
planning 이 이미 갱신하고 커밋했다. 이 phase 에서 다시 고치지 않는다.

`AGENTS.md` 도 이 phase 의 대상이 아니다.
명령 카탈로그 수는 구현이 끝난 뒤에만 확정되지만 그 파일은 결정 문서라 소유자가 team-lead 다.
team-lead 가 phase 루프 밖에서 실제 건수를 세어 갱신하고 별도 커밋으로 남긴다.
구현자는 `AGENTS.md` 를 편집하지 않는다.

---

## 작업 항목 (3)

### 1. `skills/nhncloud-cli/references/apigateway.md` — 변경 명령 추가

phase 01 이 `--app-key` 서술을 걷어낸 상태에서 이어 작성한다.

- 빠른 참조 표에 `stage update`·`resource set-path-plugin`·`resource set-method-plugin` 행을 넣는다
- 설정 파일 예시를 담은 절을 만든다. `pathPluginList` 와 `methodPluginList` 각각 하나씩이며,
  `applyChildPath` 와 `delete` 가 항목 필드임을 밝힌다
- 자동화 시나리오에 플러그인 일괄 적용 예시를 넣는다.
  `--dry-run` 으로 범위를 먼저 보고 `--yes` 로 적용하는 두 단계다
- 변경이 스테이지에 반영되려면 별도 반영과 배포가 필요하고 그 명령은 아직 없다는 한 줄을 남긴다
- 이 두 명령만 `--dry-run` 을 제공하는 이유를 한 줄 남긴다.
  다른 위험 명령은 `--yes` 확인만 두는데, 하위 적용 범위를 서버가 판정하고
  CORS 플러그인이 기존 OPTIONS 메서드를 대체하므로 되돌릴 수 없는 범위를
  미리 볼 방법이 필요하기 때문이다.
  근거를 남기지 않으면 다음 쓰기 명령이 무엇을 따라야 할지 알 수 없다
- 실제 appkey·서비스 식별자·사내 도메인을 쓰지 않는다. `<appkey>`·`<service-id>`·
  `https://backend.example.com` 같은 placeholder 만 쓴다

### 2. `README.md` — 사용 예 한 줄 추가

`nhncloud apigateway service list` 예시가 있는 블록에 변경 명령 한 줄을 더한다.
intro 의 "지원 명령" 문구가 조회만 가리키면 변경까지 포함하도록 고친다.

### 3. `skills/nhncloud-cli/SKILL.md` — router 갱신

`apigateway` 항목이 조회 전용으로 서술돼 있으면 변경까지 포함하도록 고친다.
프론트매터 `description` 이 서비스 목록을 담고 있으면 함께 확인한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `skills/nhncloud-cli/references/apigateway.md` | 수정 |
| `README.md` | 수정 |
| `skills/nhncloud-cli/SKILL.md` | 수정 |
| `tasks/054-2-feat-apigateway-write/index.json` | 수정 |

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm test
pnpm run build

# AGENTS.md 는 손대지 않는다 — 카탈로그 수 갱신은 team-lead 소유다
test "$(git diff origin/main --name-only -- AGENTS.md | grep -c .)" = "0"

# 세 명령이 서비스 참조 문서에 등재됐다
for cmd in "stage update" "resource set-path-plugin" "resource set-method-plugin"; do
  grep -q "$cmd" skills/nhncloud-cli/references/apigateway.md || { echo "MISSING in references: $cmd"; exit 1; }
done

# router 와 README 도 변경 명령을 노출한다.
# 신규 고유 토큰으로 검사한다 — 이 토큰은 이 plan 이전에 저장소에 없었다
grep -q "set-path-plugin" skills/nhncloud-cli/SKILL.md
grep -q "apigateway" README.md
test "$(grep -c 'set-path-plugin\|stage update' README.md)" -ge "1"

# --dry-run 을 이 두 명령만 제공하는 근거가 참조 문서에 남았다
grep -q "dry-run" skills/nhncloud-cli/references/apigateway.md

# 공개 저장소 정보 보호 검사 2건이 0 건이다
test "$(grep -rnoE '(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)' README.md skills/ docs/ AGENTS.md CLAUDE.md src/ 2>/dev/null | grep -vE 'nhncloud\.com|nhncloudservice\.com|github\.com|npmjs\.com|example\.com|openai\.com|anthropic\.com' | grep -c .)" = "0"
test "$(grep -rnE "(secret|password|appkey)['\"]?[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9]{16,}" README.md skills/ docs/ AGENTS.md CLAUDE.md src/ 2>/dev/null | grep -c .)" = "0"

git diff --check
```

마지막으로 `tasks/054-2-feat-apigateway-write/index.json` 의 `status` 를 `completed` 로,
`current_phase` 를 `5` 로, 모든 phase 의 `status` 를 `completed` 로 바꾸고 `updated_at` 을 갱신한다.

---

## 수동 QA (사용자 실행 — executor 는 호출하지 않는다)

운영 API Gateway 설정을 바꾸는 호출이라 자동 실행 대상이 아니다.
아래 절차는 사용자가 직접 실행하며, 되돌릴 수 있는 순서로 배치했다.

1. 대상 식별자를 조회로 확보한다

    ```bash
    # cwd: <repo root>
    node dist/index.js apigateway service list --profile <프로파일> --quiet
    node dist/index.js apigateway stage list <service-id> --profile <프로파일> --json
    ```

2. 스테이지 수정을 설명만 바꿔 시험한다. 백엔드 URL 은 건드리지 않는다

    ```bash
    node dist/index.js apigateway stage update <service-id> <stage-id> \
      --description "054-2 확인" --profile <프로파일> --yes
    ```

    확인할 것 — 응답이 성공으로 출력되는지, `backendEndpointUrl` 이 기존 값 그대로인지,
    `stage list` 재조회에서 설명만 바뀌었는지.

3. 설명을 원래 값으로 되돌린다.

4. 플러그인은 `--dry-run` 을 먼저 실행해 범위만 확인한다.
   출력된 건수가 `resource list` 의 하위 경로 수와 맞는지 대조한다.

5. 플러그인 실제 적용은 영향이 가장 작은 단일 메서드 리소스에서 시작한다.
   `applyChildPath` 가 참인 설정은 범위를 확인한 뒤에만 적용한다.

6. 적용 후 `resource list --json` 으로 해당 리소스의 `resourcePluginList` 에
   보낸 타입이 들어갔는지, 기존 `HTTP` 플러그인이 그대로 남았는지 확인한다.

7. 스테이지 수정이 즉시 반영인지 배포가 필요한지 확인한다.
   공식 문서에 서술이 없어 planning 에서 단정하지 않은 항목이다.

### QA 결과가 설계와 어긋날 때

문서 근거로 확정한 동작이 실측과 다르면 계획을 고치지 않고 PR 위에서 정정한다.
`review-fix` 로 명령 표면·경고 문구·카탈로그 수·`docs/adr/028-apigateway-write-api.md` 를
함께 고치고, 어긋난 지점을 ADR 의 맥락 절에 실측 근거로 남긴다.

특히 아래 셋은 문서만으로 확정하지 못해 QA 로 판정한다.

- 스테이지 수정 응답에 `stageCustomUrl` 과 `stageAliasDomainList` 가 실제로 없는지
- `stageDescription` 을 보내지 않으면 기존 설명이 유지되는지 지워지는지
- `--dry-run` 의 접두 비교 범위가 서버의 `applyChildPath` 판정과 일치하는지

## 의도 메모 (왜)

- 사용자 가이드를 마지막 phase 에 두는 이유는 명령 표면이 phase 03·04 에서 확정되기 때문이다.
  먼저 쓰면 옵션 이름이 바뀔 때마다 두 번 고친다.
- `AGENTS.md` 를 이 phase 에서 떼어낸 이유는 그 파일이 결정 문서이기 때문이다.
  값은 구현 뒤에만 확정되지만 소유자는 team-lead 라, 편집 시점과 소유권을 구분한다.
- 신규 고유 토큰으로 문서 갱신을 검사하는 이유는 "조회" 같은 기존 단어로 grep 하면
  손대지 않은 문서도 통과하기 때문이다.
- 수동 QA 를 설명 변경부터 시작하는 이유는 백엔드 URL 변경이 트래픽 경로를 바꾸는 반면
  설명은 되돌리기 쉬워 절차 자체를 안전하게 검증할 수 있기 때문이다.
