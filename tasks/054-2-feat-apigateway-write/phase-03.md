# Phase 03 — `apigateway stage update` 명령

**Execution profile**: standard

---

## 목표

스테이지의 백엔드 엔드포인트 URL 과 설명을 바꾸는 명령을 추가한다.
스테이지 이름은 API 가 변경을 지원하지 않는다.

phase 02 가 만든 `ApiGatewayClient.updateStage` 와 `requireYes` 를 쓴다.
그 두 심볼이 없으면 phase 02 가 미완이므로 `PHASE_BLOCKED` 를 출력하고 멈춘다.

**이 phase 는 실제 쓰기 API 를 호출하지 않는다.** 테스트는 client 를 mock 한다.

**범위 외**: 리소스 플러그인 명령은 phase 04 다.

---

## 작업 항목 (3)

### 1. `src/commands/apigateway/stage.ts` — `update` 서브커맨드

```
nhncloud apigateway stage update <service-id> <stage-id>
  [--backend-endpoint-url <url>] [--description <text>] --yes
```

`addApiGatewayOptions` 로 `--region`·`--profile` 을 붙인다.
`--app-key` 는 phase 01 에서 제거했으므로 추가하지 않는다.

동작 순서를 그대로 지킨다. 순서가 어긋나면 인자 오류인데도 자격증명을 먼저 읽거나
spinner 가 검증보다 먼저 떠서 오류 출력이 spinner 에 섞인다.

1. `parseRequiredArgument` 로 `service-id`·`stage-id` 를 검증한다
2. `requireYes(opts.yes, "스테이지 수정")` 을 호출한다
3. `--backend-endpoint-url` 과 `--description` 이 모두 없으면
   바꿀 것이 없으므로 `EXIT_PARAM_ERROR` 로 거부한다
4. `resolveApiGatewayClient(opts)` 로 client 를 얻는다
5. `startSpinner` 후 `client.listStages(serviceId)` 로 대상 스테이지를 찾는다
6. `client.updateStage` 를 호출한다
7. `stopSpinner` 후 결과를 출력한다

`backendEndpointUrl` 은 API 에서 필수라, 미지정이면 5번에서 찾은 기존 값을 그대로 싣는다.
`stageDescription` 도 미지정이면 기존 값을 싣는다 — 보내지 않을 때 값이 유지되는지 문서에
근거가 없어, 유지를 의도한 호출이 설명을 지우는 것을 막는다.
`--description ""` 는 설명을 비우는 의도로 받아들여 빈 문자열을 그대로 보낸다.

5번에서 `stage-id` 에 해당하는 스테이지가 목록에 없으면
`EXIT_PARAM_ERROR` 로 거부한다. 스테이지 단건 조회 경로가 없어([[adr-027]]) 목록으로 찾는다.

출력은 기존 조회 명령과 같은 `output(opts, {...})` 형식이다.
헤더는 `stageId`·`stageName`·`stageUrl`·`backendEndpointUrl`·`updatedAt` 로 두고,
`raw` 에 응답 객체를, `ids` 에 `stageId` 를 넣어 `--quiet` 가 식별자를 낸다.
외부 문자열은 기존 명령처럼 `sanitizeForTerminal` 을 거친다.

변경이 실제 트래픽에 즉시 반영되는지 배포가 필요한지는 공식 문서에 서술이 없다.
성공 뒤 stderr 에 반영 확인을 안내하는 한 줄을 남기고, 즉시 반영이라고 단정하지 않는다.

### 2. `src/commands/apigateway/stage.ts` — 옵션 인터페이스 확장

`StageOptions` 에 `backendEndpointUrl?: string`·`description?: string`·`yes?: boolean` 을 더한다.
`update` 를 `stageCommand.addCommand(...)` 로 등록한다.
`stage` 그룹의 `description` 이 "조회 명령" 이므로 조회와 변경을 함께 담도록 고친다.

### 3. `src/commands/apigateway/stage.test.ts` — 계약 테스트

기존 파일의 방식을 따라 아래를 넣는다.

- `--yes` 없이 호출하면 client 생성 전에 `--yes` 를 요구하며 던진다
- 두 옵션 모두 없으면 `EXIT_PARAM_ERROR` 로 던진다
- `--description` 만 준 호출이 기존 `backendEndpointUrl` 을 그대로 실어 보낸다
- `--backend-endpoint-url` 만 준 호출이 기존 `stageDescription` 을 그대로 실어 보낸다
- `--description ""` 가 빈 문자열로 전달된다
- 목록에 없는 `stage-id` 는 `EXIT_PARAM_ERROR` 로 던진다

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/commands/apigateway/stage.ts` | 수정 |
| `src/commands/apigateway/stage.test.ts` | 수정 |

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm test
pnpm run build

# 명령이 카탈로그에 등록됐다
node dist/index.js commands --json \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s).commands.map(c=>c.path);if(!p.includes("apigateway stage update")){console.error("missing");process.exit(1)}})'

# --yes 없이 호출하면 실패하고 종료 코드가 2 다
node dist/index.js apigateway stage update svc stg --description x --profile no-such-profile-054-2; test "$?" != "0"

# 도움말에 세 옵션이 노출된다
node dist/index.js apigateway stage update --help | grep -q -- "--backend-endpoint-url"
node dist/index.js apigateway stage update --help | grep -q -- "--description"
node dist/index.js apigateway stage update --help | grep -q -- "--yes"

# --app-key 는 노출되지 않는다
test "$(node dist/index.js apigateway stage update --help | grep -c -- '--app-key')" = "0"

git diff --check
```

## 의도 메모 (왜)

- 미지정 필드를 기존 값으로 채우는 이유는 `backendEndpointUrl` 이 API 필수라서다.
  설명만 바꾸려는 호출이 URL 을 빠뜨리면 요청 자체가 거부된다.
- 목록 조회로 기존 값을 얻는 이유는 스테이지 단건 조회 경로가 없기 때문이다(ADR-027 실측).
- 즉시 반영을 단정하지 않는 이유는 공식 문서에 서술이 없기 때문이다.
  단정한 안내를 넣으면 사용자가 배포를 건너뛰고 반영됐다고 오판할 수 있다.
  실제 동작은 phase 05 의 수동 QA 에서 확인해 문서에 반영한다.

## Blocked 조건

- `src/services/apigateway/client.ts` 에 `updateStage` 가 없거나
  `src/commands/apigateway/helpers.ts` 에 `requireYes` 가 없으면
  `PHASE_BLOCKED: phase 02 산출물 부재` 를 출력하고 종료한다.
