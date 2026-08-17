# Phase 02 — 명령 3개: import-resources, deploy create, deploy rollback

**Execution profile**: standard

---

## 목표

phase 01 이 만든 client 메서드를 명령으로 노출한다.

```
nhncloud apigateway stage import-resources <service-id> <stage-id> --yes
nhncloud apigateway stage deploy create <service-id> <stage-id> [--description <text>] [--no-wait] [--timeout <sec>] --yes
nhncloud apigateway stage deploy rollback <service-id> <stage-id> <deploy-id> --yes
```

이 phase 는 phase 01 이 만드는 `importStageResources`·`createDeploy`·`rollbackDeploy`·`waitForDeploy` 를 전제한다.
없으면 base 를 확인하고 멈춘다.

**범위 외**: 사용자 가이드(`README.md`, `skills/`) 갱신은 phase 03 이다.

---

## 공통 규칙 (세 명령 모두)

- 인수는 `parseRequiredArgument` 로 검증한다. 기존 `stage update`(`src/commands/apigateway/stage.ts:182`)가 선례다.
- **API 호출 전에** `requireYes(opts.yes, "<작업 이름>")` 를 검증한다. 세 명령 모두 `--yes` 를 요구한다.
- 클라이언트는 `resolveApiGatewayClient(opts)` 로 얻는다.
- spinner 는 `startSpinner` 로 열고 `try`/`catch` 로 감싸 실패 시 `stopSpinner(false)` 후 다시 던진다.
  **spinner 구간 안에서 `process.stderr.write` 를 호출하지 않는다** — ora 출력과 줄이 뒤섞인다.
  안내는 `stopSpinner` 뒤에 낸다.
- 출력은 `output(opts, {...})` 를 쓴다. 사용자에게 보이는 문자열은 `sanitizeForTerminal` 로 감싼다.
- 데이터는 stdout, 안내·경고는 stderr 로 나간다.

---

## 작업 항목 (3)

### 1. `src/commands/apigateway/stage.ts` — `import-resources`

```ts
new Command("import-resources")
  .description("API Gateway service 의 리소스를 stage 로 가져온다")
  .argument("<service-id>", "API Gateway service ID")
  .argument("<stage-id>", "API Gateway stage ID")
  .option("--yes", "스테이지 반영을 확인한다")
```

`stageCommand` 에 `.addCommand()` 로 등록한다.

- `requireYes(opts.yes, "스테이지 반영")`
- `client.importStageResources(serviceId, stageId)` 호출
- 출력 — 헤더 `["stageResourceId", "path", "methodType", "methodName", "plugins"]`.
  `methodType`·`methodName` 이 `null` 이면 `"-"`, `plugins` 는 `stageResourcePluginList.length` 를 문자열로 낸다.
  `raw` 는 반환 배열, `ids` 는 `stageResourceId` 목록이다.
- `stopSpinner(true)` 뒤 stderr 안내:
  `안내: 반영은 스테이지 설정만 바꿉니다. 서비스에 적용하려면 apigateway stage deploy create 를 실행하세요.`
- 리소스에 변경이 없으면 서버가 아무 일도 하지 않는다.
  그때 응답이 어떻게 오는지는 문서에 없다. **응답 형태로 "변경 없음" 을 추정해 별도 메시지를 내지 않는다.**
  받은 목록을 그대로 출력한다.

### 2. `src/commands/apigateway/deploy.ts` — `create`

```ts
new Command("create")
  .description("stage 설정을 API Gateway service 에 배포한다")
  .argument("<service-id>", "API Gateway service ID")
  .argument("<stage-id>", "API Gateway stage ID")
  .option("--description <text>", "배포 설명 (최대 200자)")
  .option("--no-wait", "배포 결과를 기다리지 않고 요청만 한다")
  .option("--timeout <sec>", "배포 대기 상한 (초, 기본 300)", "300")
  .option("--yes", "배포를 확인한다")
```

`--no-wait` 를 쓰면 Commander 가 `opts.wait` 를 기본 `true` 로 만들고 플래그가 있을 때 `false` 로 준다.
`--no-color` 가 이 저장소의 선례다. `--wait` 옵션을 따로 정의하지 않는다.

흐름은 다음 순서를 지킨다.

**옵션 파싱은 전부 맨 앞에서 끝낸다.** 잘못된 `--timeout` 이 배포가 나간 뒤에 드러나면
이미 트래픽이 바뀐 상태에서 명령이 실패한다. 되돌릴 수 없는 호출 앞에 검증을 모은다.

1. 인수 검증
2. `--description` 길이 검증. 200자를 넘으면 `EXIT_PARAM_ERROR` 로 끝낸다.
   길이는 `[...text].length` 로 센다 — 서버 상한이 문자 수 기준이다.
3. `const timeoutMs = parsePositiveIntegerOption(opts.timeout ?? "300", "--timeout") * 1000;`
   `--no-wait` 여도 파싱한다. 값이 틀렸는데 조용히 무시되면 다음 호출에서 놀란다.
4. `requireYes(opts.yes, "스테이지 배포")`
5. `opts.wait` 이면 배포 전에 `client.getLatestDeploy(...)` 로 기준 `deployId` 를 읽는다.
   이 조회가 실패하면 **배포를 막지 않는다.** 배포 이력이 없는 스테이지일 수 있다.
   실패를 삼키고 `baselineDeployId = null` 로 진행한다.
6. `client.createDeploy(serviceId, stageId, { deployDescription: opts.description })`
7. `opts.wait` 이면 `client.waitForDeploy(...)` 에 위에서 만든 `timeoutMs` 를 넘긴다.
8. 결과 판정 — `deployStatus` 가 `DEPLOY_STATUS_COMPLETE` 가 아니면 실패다.
   `FAILURE` 든 문서에 없는 값이든 성공으로 보지 않는다.
   실패 시 `deployId`·`deployStatus` 를 담아 `EXIT_API_ERROR` 로 끝낸다.

1~4 는 어떤 API 도 호출하지 않는다. `resolveApiGatewayClient` 는 자격증명을 읽으므로 5 앞에 둔다.

출력.

- `--no-wait`: 서버가 배포 ID 를 주지 않으므로 보여줄 데이터가 없다.
  stdout 에 표를 내지 않고 stderr 안내만 낸다 —
  `안내: 배포를 요청했습니다. 결과는 apigateway stage deploy latest 로 확인하세요.`
  `--json` 이면 `{ "requested": true }` 를 stdout 에 낸다. 종료 코드는 0 이다.
- 대기했으면 헤더 `["deployId", "deployStatus", "deployedAt", "deployDescription"]` 한 행을 낸다.
  `raw` 는 `waitForDeploy` 가 돌려준 객체다.

### 3. `src/commands/apigateway/deploy.ts` — `rollback`

```ts
new Command("rollback")
  .description("배포 이력으로 stage 설정을 되돌린다")
  .argument("<service-id>", "API Gateway service ID")
  .argument("<stage-id>", "API Gateway stage ID")
  .argument("<deploy-id>", "되돌릴 배포 ID")
  .option("--yes", "되돌리기를 확인한다")
```

- `requireYes(opts.yes, "스테이지 되돌리기")`
- `client.rollbackDeploy(serviceId, stageId, deployId)` 호출
- 출력은 `import-resources` 와 같은 헤더 구성을 쓴다.
- `stopSpinner(true)` 뒤 stderr 안내 두 줄:
  - `안내: 되돌리기는 스테이지 설정만 바꿉니다. 서비스에 적용하려면 apigateway stage deploy create 를 실행하세요.`
  - `주의: 되돌리기는 현재 스테이지 설정을 모두 지웁니다.`
- 배포 실패 상태의 이력으로는 되돌릴 수 없다. **CLI 가 미리 조회해 막지 않는다.**
  `deploy list` 는 성공 이력만 주므로 사전 검증이 또 한 번의 호출을 늘리기만 하고,
  그 사이에 상태가 바뀌면 검증이 무의미해진다. 서버 오류를 그대로 전달한다.

두 명령을 `deployCommand` 에 `.addCommand()` 로 등록한다.

---

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm test
pnpm run build
git diff --check
```

정적 확인.

```bash
# cwd: <repo root>
# 명령 3개가 늘었다
node dist/index.js commands --json | python3 -c "import json,sys; print(len(json.load(sys.stdin)['commands']))"   # 170

# 세 명령이 카탈로그에 있다
node dist/index.js commands --json | grep -c "stage import-resources\|stage deploy create\|stage deploy rollback"   # 3

# spinner 구간 안에서 stderr 로 쓰지 않는다 (세 명령 모두 0)
awk '/startSpinner/,/stopSpinner/' src/commands/apigateway/deploy.ts | grep -c 'process.stderr.write'   # 0
awk '/startSpinner/,/stopSpinner/' src/commands/apigateway/stage.ts | grep -c 'process.stderr.write'    # 0

# 옵션 파싱과 --yes 검증이 API 호출보다 앞선다
# parsePositiveIntegerOption 과 requireYes 의 줄 번호가 resolveApiGatewayClient 보다 작아야 한다
grep -n "parsePositiveIntegerOption\|requireYes\|resolveApiGatewayClient" src/commands/apigateway/deploy.ts
```

명령별 테스트를 추가한다. 최소 다음을 덮는다.

- `--yes` 없이 호출하면 API 를 호출하지 않고 실패한다 (세 명령 모두)
- `--description` 이 200자를 넘으면 API 를 호출하지 않고 `EXIT_PARAM_ERROR` 로 끝낸다
- 배포가 `COMPLETE` 면 0 으로 끝난다
- 배포가 `FAILURE` 면 `EXIT_API_ERROR` 로 끝난다
- `--no-wait` 이면 `waitForDeploy` 를 호출하지 않는다
- 대기 경로에서 `getLatestDeploy` 가 던져도 배포가 진행된다 (`baselineDeployId = null`)
- `--timeout 0` 이나 `--timeout abc` 는 `createDeploy` 를 호출하지 않고 `EXIT_PARAM_ERROR` 로 끝낸다
  (`--no-wait` 와 함께 줘도 같다)

---

## 특이사항 보고

phase 종료 시 pre-existing 문제, 신규 deprecation, 추측한 지점, 범위 외 발견을 team-lead 에 보고한다.
