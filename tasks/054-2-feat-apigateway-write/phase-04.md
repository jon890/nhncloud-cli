# Phase 04 — `apigateway resource set-path-plugin` 과 `set-method-plugin` 명령

**Execution profile**: standard

---

## 목표

리소스 경로와 메서드에 플러그인을 설정하는 두 명령을 추가한다.
콘솔 수작업이 비현실적인 규모에 플러그인을 한 번에 적용하는 것이 목적이다.

경로와 메서드를 나누는 이유는 설정 가능한 플러그인 타입이 다르고
(경로 4종, 메서드 5종), 하위 일괄 적용이 경로에만 있기 때문이다.

phase 02 가 만든 `setPathPlugins`·`setMethodPlugins`·`requireYes`·
`readPluginConfigFile`·`collectAffectedPaths` 를 쓴다.

**이 phase 는 실제 쓰기 API 를 호출하지 않는다.** 테스트는 client 를 mock 한다.

**범위 외**: 스테이지 반영과 배포·롤백은 후속 plan 이다.

---

## 작업 항목 (4)

### 1. `src/commands/apigateway/resource.ts` — `set-path-plugin` 서브커맨드

```
nhncloud apigateway resource set-path-plugin <service-id> <resource-id>
  --config-file <path> [--dry-run] --yes
```

설정 파일은 API 요청 본문 그대로 받는다. 공식 문서의 요청 예시를 그대로 옮겨 쓸 수 있게 하려는 것이다.

```json
{ "pathPluginList": [ { "pluginType": "ADD_REQUEST_QUERY_PARAMETER", "pluginConfigJson": { }, "applyChildPath": true } ] }
```

`applyChildPath` 와 `delete` 는 항목마다 다를 수 있어 파일 안 필드로만 받는다.
같은 뜻의 명령 옵션을 따로 두지 않는다 — 두 곳에서 오면 어느 쪽이 이겼는지 알 수 없다.

동작 순서를 지킨다.

1. `parseRequiredArgument` 로 `service-id`·`resource-id` 를 검증한다
2. `--config-file` 을 `readPluginConfigFile` 로 읽고 구조를 좁힌다
   - `pathPluginList` 가 비어 있지 않은 배열인지 확인한다
   - 각 항목의 `pluginType` 이 `PATH_PLUGIN_TYPES` 에 있는지 확인한다.
     메서드 전용 타입(`HTTP`·`MOCK`)을 경로에 주면 서버가 거부하므로 미리 막는다
   - `delete` 가 참이 아닌 항목에 `pluginConfigJson` 이 없으면 거부한다
   - 위반은 모두 `EXIT_PARAM_ERROR` 다
3. `--dry-run` 이 아니면 `requireYes(opts.yes, "리소스 경로 플러그인 설정")` 을 호출한다
4. `resolveApiGatewayClient(opts)` 로 client 를 얻는다
5. `client.listResources(serviceId)` 로 목록을 받아 대상 `resource-id` 를 찾는다.
   목록에 없으면 `EXIT_PARAM_ERROR` 로 거부한다.
   그 항목의 `path` 가 기준 경로다.
   항목 중 하나라도 `applyChildPath` 가 참이면 `collectAffectedPaths` 로 하위까지 모으고,
   아니면 영향 범위는 대상 리소스 하나다.
   `applyChildPath` 유무와 무관하게 이 조회를 수행한다 — 기준 경로를 모르면 `--dry-run` 이
   무엇을 보여줄지 정할 수 없고, 없는 `resource-id` 를 서버까지 보내게 된다
6. `--dry-run` 이면 영향 범위를 출력하고 쓰기 호출 없이 종료한다
7. `--dry-run` 이 아니면 `client.setPathPlugins` 를 호출하고 결과를 출력한다.
   출력은 응답의 `resourceList` 를 표로 낸다 —
   헤더는 `resourceId`·`path`·`methodType`, `raw` 는 응답 배열, `ids` 는 `resourceId` 목록이다.
   `path` 와 `methodType` 은 외부 문자열이므로 `sanitizeForTerminal` 을 거치고,
   값이 없으면 대체 문자 `-` 를 넣는다.
   `UpdatedResource` 는 두 필드만 필수라 나머지는 없을 수 있다

`--dry-run` 의 조기 반환도 세 출력 모드를 모두 지킨다.
이 저장소에 `--dry-run` 선례가 없으므로 계약을 여기서 정한다.
조기 반환 경로가 `output()` 을 타지 않으면 `--json` 이 사람용 표를 내거나
`--quiet` 이 아무것도 내지 않아, 자동화가 범위를 확인할 수 없다.

```ts
output(opts, {
  headers: ["resourceId", "path", "methodType", "appliedPluginTypes"],
  rows: affected.map(...),   // methodType 이 null 이면 "-"
  raw: { targetPath, applyChildPath, plugins, affected },
  ids: affected.map((r) => r.resourceId),
});
```

- 기본(표) — 영향받는 리소스별 한 행. 적용될 플러그인 타입을 마지막 열에 넣는다
- `--json` — `raw` 객체 그대로. 기준 경로·하위 적용 여부·플러그인 목록·영향 리소스를 담는다
- `--quiet` — 영향 리소스 ID 목록만 한 줄에 하나씩. 다음 명령에 파이프할 수 있어야 한다

`--dry-run` 은 범위가 추정임을 stderr 로 함께 알린다.
`path` 접두 비교로 구한 값이라 서버 판정과 완전히 같다고 보장할 수 없다.
이 경고는 stderr 이므로 `--json` 출력을 오염시키지 않는다.

`CORS` 타입이 포함되면 하위에 OPTIONS 메서드가 자동 생성되고 기존 OPTIONS 가
삭제·대체된다는 경고를 호출 전 stderr 로 낸다.
`applyChildPath` 와 `delete` 가 함께 참인 항목이 있으면 하위 전체에서 그 플러그인이
사라진다는 경고도 낸다.

### 2. `src/commands/apigateway/resource.ts` — `set-method-plugin` 서브커맨드

```
nhncloud apigateway resource set-method-plugin <service-id> <resource-id>
  --config-file <path> [--dry-run] --yes
```

설정 파일은 `methodPluginList` 를 담는다. `methodName` 과 `methodDescription` 은 선택이다.

`methodName` 은 API 필수인데 플러그인만 바꾸려는 호출이 알 필요가 없다.
파일에 없으면 `client.listResources` 로 대상 `resource-id` 를 찾아
기존 `methodName` 과 `methodDescription` 을 그대로 싣는다.
파일에 있으면 그 값을 쓴다 — 이름까지 바꾸려는 호출을 막지 않는다.

대상 리소스의 `methodType` 이 `null` 이면 메서드가 아닌 경로이므로
`set-path-plugin` 을 쓰라는 안내와 함께 `EXIT_PARAM_ERROR` 로 거부한다.
기존 `methodName` 이 `null` 이고 파일에도 없으면 필수 값을 만들 수 없으므로
`methodName` 을 파일에 넣으라는 안내와 함께 거부한다.

`pluginType` 은 `METHOD_PLUGIN_TYPES` 로 검증한다. `applyChildPath` 는 메서드에 없으므로
파일에 그 필드가 있으면 무시하지 않고 `EXIT_PARAM_ERROR` 로 거부한다 —
조용히 무시하면 사용자가 하위에 적용됐다고 오해한다.

`--dry-run` 은 경로 명령과 같은 출력 계약을 쓰되 영향 범위가 항상 자기 자신 하나다.
하위 적용이 없어 접두 비교를 하지 않으므로 추정 경고도 내지 않는다.
대신 실제로 실릴 `methodName` 과 `methodDescription` 을 함께 보여 준다 —
파일에 이름을 넣지 않은 호출이 무엇을 그대로 유지하게 되는지 미리 확인할 수 있다.

```ts
output(opts, {
  headers: ["resourceId", "path", "methodType", "methodName", "appliedPluginTypes"],
  rows: [...],
  raw: { target, methodName, methodDescription, plugins },
  ids: [target.resourceId],
});
```

### 3. `src/commands/apigateway/resource.ts` — 옵션 인터페이스와 그룹 등록

`ResourceOptions` 에 `configFile?: string`·`dryRun?: boolean`·`yes?: boolean` 을 더한다.
두 명령을 `resourceCommand.addCommand(...)` 로 등록하고
`resource` 그룹의 `description` 이 조회와 변경을 함께 담도록 고친다.

실제 쓰기 출력도 경로 명령과 같은 형태다 — 응답 `resourceList` 를 같은 헤더로 내고
`sanitizeForTerminal` 과 대체 문자를 같게 적용한다.

### 4. `src/commands/apigateway/resource.test.ts` — 계약 테스트

action 레벨 하네스는 `src/commands/apigateway/commands.test.ts:13-44` 를 원천으로 삼는다.
아래를 그대로 옮겨 온다.

- `vi.mock` 세 개 — `./helpers.js`, `../../formatters/table.js`, `../../utils/spinner.js`
- 가짜 client 객체
- `programWith()` 로 만든 부모 `Command` 와 `exitOverride()`
가짜 client 에는 `listResources`·`setPathPlugins`·`setMethodPlugins` 를 넣는다.
테스트를 위해 명령 내부 함수를 새로 export 하지 않는다.

- `--yes` 없이 호출하면 client 생성 전에 던진다
- `--dry-run` 은 `--yes` 없이 통과하고 쓰기 메서드를 호출하지 않는다
- 경로 명령에 `HTTP` 타입을 주면 `EXIT_PARAM_ERROR` 로 던진다
- 메서드 명령에 `applyChildPath` 가 있으면 `EXIT_PARAM_ERROR` 로 던진다
- `delete` 없이 `pluginConfigJson` 이 빠진 항목은 던진다
- `methodType` 이 `null` 인 리소스에 메서드 명령을 쓰면 던진다
- 파일에 `methodName` 이 없으면 기존 값을 실어 보낸다
- 없는 `--config-file` 경로는 `EXIT_PARAM_ERROR` 로 던진다
- `applyChildPath` 가 참인 `--dry-run` 이 하위 경로 건수를 출력한다
- `--dry-run --json` 이 `targetPath`·`applyChildPath`·`plugins`·`affected` 를 담은 객체를 stdout 에 낸다
- `--dry-run --quiet` 이 영향 리소스 ID 만 한 줄에 하나씩 낸다 (표 머리글·경고가 stdout 에 섞이지 않는다)
- `--dry-run` 의 추정 경고가 stdout 이 아니라 stderr 로 나간다
- 메서드 명령의 `--dry-run` 은 영향 리소스가 1건이고 추정 경고를 내지 않는다

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/commands/apigateway/resource.ts` | 수정 |
| `src/commands/apigateway/resource.test.ts` | 신규 |

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm test
pnpm run build

# 두 명령이 카탈로그에 등록됐다
node dist/index.js commands --json \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s).commands.map(c=>c.path);const need=["apigateway resource set-path-plugin","apigateway resource set-method-plugin"];const miss=need.filter(n=>!p.includes(n));if(miss.length){console.error(miss.join(","));process.exit(1)}})'

# 도움말 옵션 표면
node dist/index.js apigateway resource set-path-plugin --help | grep -q -- "--config-file"
node dist/index.js apigateway resource set-path-plugin --help | grep -q -- "--dry-run"
node dist/index.js apigateway resource set-method-plugin --help | grep -q -- "--config-file"

# 파일 안 필드와 겹치는 옵션을 만들지 않았다
test "$(node dist/index.js apigateway resource set-path-plugin --help | grep -c -- '--apply-child-path')" = "0"

# 플러그인 타입 상수를 명령이 실제로 참조한다
test "$(grep -c 'PATH_PLUGIN_TYPES\|METHOD_PLUGIN_TYPES' src/commands/apigateway/resource.ts)" -ge "2"

# --dry-run 조기 반환도 output() 을 타서 세 출력 모드를 지킨다.
# 변경 전 resource.ts 의 output(opts 호출은 3회(조회 3개)다. 두 명령이 최소 2회를 더한다
test "$(grep -c 'output(opts' src/commands/apigateway/resource.ts)" -ge "5"

# 출력 모드를 우회하는 직접 쓰기가 없다 (변경 전에도 0회다)
test "$(grep -c 'process.stdout.write' src/commands/apigateway/resource.ts)" = "0"

# 위 grep 은 하한만 본다. dry-run 의 세 출력 모드 계약은 테스트가 실제로 강제한다
test "$(grep -c 'dry-run' src/commands/apigateway/resource.test.ts)" -ge "4"

git diff --check
```

## 의도 메모 (왜)

- `applyChildPath` 를 서버에 맡기는 이유는 CLI 순회가 호출을 리소스 수만큼 늘리고
  중간 실패 시 절반만 적용된 상태를 남기기 때문이다.
- 플러그인 타입을 명령에서 미리 검증하는 이유는 경로와 메서드의 허용 집합이 다르고,
  서버 거부 메시지만으로는 어느 쪽에 속한 타입인지 알기 어렵기 때문이다.
- 메서드 명령에서 `applyChildPath` 를 무시하지 않고 거부하는 이유는
  무시가 곧 "하위에 적용됐다" 는 오해로 이어지기 때문이다.
- `--dry-run` 이 추정임을 밝히는 이유는 서버의 하위 판정 규칙이 문서에 없어
  접두 비교와 어긋날 여지가 남기 때문이다.

## Blocked 조건

- `src/services/apigateway/client.ts` 에 `setPathPlugins` 또는 `setMethodPlugins` 가 없으면
  `PHASE_BLOCKED: phase 02 산출물 부재` 를 출력하고 종료한다.
