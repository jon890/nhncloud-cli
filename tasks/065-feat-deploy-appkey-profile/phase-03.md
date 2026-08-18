# Phase 03 — deploy.targets 를 폐지하고 좌표를 옵션으로만 받는다

**Execution profile**: deep

---

## 목표

`config.json` 의 `deploy.targets` 를 읽지 않고, 배포 좌표를 명령 옵션으로만 받는다.

배포 좌표는 프로젝트 정보다. 사용자 홈의 전역 파일에 있으면 저장소를 옮기거나 CI 에서 돌릴 때 따라가지 못한다 —
CI 환경에는 `~/.nhncloud/config.json` 이 없다.
그래서 `--artifact-id` 같은 override 옵션이 이미 만들어져 쓰이고 있었다. 그것을 정식 입력으로 승격한다.
근거는 `docs/adr/033-deploy-appkey-and-coordinates.md` 다.

**범위 외**: appkey 해석은 phase-01·02 가 이미 profile 로 옮겼다.
공개 문서는 phase-04 가 맡는다.
`defaultProfile` 은 CLI 동작 설정이라 `config.json` 에 그대로 남긴다.

이 phase 는 phase-02 가 만든 `resolveDeployAppKey` 를 전제한다.

---

## 작업 항목 (6)

### 1. `src/config/types.ts` — 스키마에서 target 을 없앤다

- `DeployTarget` 인터페이스를 지운다.
- `Config` 에서 `deploy?: { targets?: … }` 를 지운다.

읽지 않고 경고하려면 남은 값을 검사해야 하므로, `Config` 를 좁히는 대신 **경고 전용 타입**을 둔다.

```ts
/** 폐지된 블록. 읽지 않고 경고만 하려고 형태만 남긴다 ([[adr-033]]). */
interface LegacyDeployConfig { targets?: Record<string, unknown> }
```

이 타입은 export 하지 않는다. 경고를 내는 곳에서만 쓴다.

**`as` 단정으로 좁히지 않는다.** 파싱 결과는 `unknown` 가드로 검사한다.
`Object.keys` 를 부르기 전에 객체 여부를 확인한다.
근거는 `docs/pitfalls/code-review/json-parse-as-cast.md` 와 `unknown-array-object-entries-no-guard.md` 다.

### 2. `src/config/credentials.ts` — `getDeployTarget` 을 없애고 경고 함수를 만든다

- `getDeployTarget` 을 지운다. 호출부는 phase-02 이후 좌표 해석에만 남아 있다.
- 대신 폐지 경고 함수를 만든다.

```ts
export async function warnLegacyDeployTargets(): Promise<void>
```

- `config.json` 을 읽어 `deploy.targets` 에 항목이 하나라도 있으면 stderr 로 한 줄 경고한다.
- 없거나 파일이 없으면 아무것도 하지 않는다. 조용히 지나간다.
- 경고 문구다. target 이름을 나열하지 않는다 — 사용자 리소스 식별자다.

```
경고: config.json 의 deploy.targets 는 더 이상 사용되지 않습니다. appkey 는 nhncloud configure --deploy-appkey 로 옮기고, 나머지 좌표는 --artifact-id 등 옵션으로 넘기세요.
```

- 자동으로 옮기거나 파일을 고치지 않는다. 자격증명 파일을 CLI 가 임의로 쓰는 것보다 사용자가 확인하고 옮기는 편이 안전하다.
- **`--quiet` 에서도 경고를 낸다.** stderr 이므로 `--json` stdout 계약은 안전하다.
  마이그레이션 안내를 CI 에서 삼키면 경고의 의미가 없다.

### 3. deploy 명령 8개에서 target 인수와 좌표 해석을 바꾼다

각 명령에서 이렇게 바꾼다.

- `.argument("<target>", …)` 와 `.argument("[target]", …)` 를 지운다.
- action 콜백의 첫 매개변수(`targetName`)를 지운다. Commander 는 인수가 없으면 옵션 객체를 먼저 넘긴다 — 시그니처를 함께 맞춘다.
- `opts.artifactId ?? target.artifactId` 를 `opts.artifactId` 로 바꾼다.
- 좌표가 필수인 명령은 **없으면 입력 오류로 거부**한다. 어느 옵션이 필요한지 문구에 담는다.

| 명령 | 필수 좌표 |
|---|---|
| `artifacts` | 없음 |
| `binaries`·`binary-groups`·`download`·`histories`·`server-groups`·`upload` | `--artifact-id` |
| `run` | `--artifact-id`, `--server-group-id`, `--scenario-ids` |

`run` 의 세 좌표는 모두 필수다. 실측으로 확정했다 —
`src/services/deploy/types.ts` 의 `DeployRunParams` 가 `appKey`·`artifactId`·`serverGroupId`·`scenarioIds` 를 모두 `string`(optional 아님)으로 받고,
`client.run` 이 `artifactId`·`serverGroupId` 를 URL 경로에, `scenarioIds` 를 payload 에 그대로 넣는다.
target 없이 동작하던 조합은 없다.

옵션 설명에서 "target override" 표현을 걷어낸다. 이제 override 가 아니라 정식 입력이다.

### 4. 경고를 호출한다 — `deploy` 그룹의 `preSubcommand` hook

`warnLegacyDeployTargets` 를 `src/index.ts` 의 `deployCommand` 에 `preSubcommand` hook 으로 단다.

```ts
deployCommand.hook("preSubcommand", async () => {
  await warnLegacyDeployTargets();
});
```

**`createDeployClient` 에 두면 안 된다.** 마이그레이션이 필요한 사용자에게 경고가 절대 닿지 않는다.

그 사용자의 다음 호출은 `nhncloud deploy run <이름>` 이다.
이 phase 가 인수를 없애므로 Commander 는 그 호출을 잉여 인수로 보고 action 콜백 진입 전에 거부한다.
실측이다.

```
error: too many arguments for 'run'. Expected 0 arguments but got 1.
```

`preSubcommand` hook 은 그 거부보다 **먼저** 발동한다. 같은 실측으로 확인했다.
그래서 hook 에 두면 구형 호출자도 옮기는 방법을 본다.

8곳에 흩지 않는다는 원래 취지는 그대로다 — hook 도 한 곳이다.

### 5. `src/index.ts` 의 `deployAgentWorkflow` 예시를 고친다

`src/index.ts` 의 `deployAgentWorkflow` 문자열이 `deploy --help` 에 출력되는 사용자 안내다.
지금 세 줄 모두 없어질 인수를 쓴다.

```
  1. nhncloud deploy artifacts <target> --json
  2. nhncloud deploy server-groups <target> --json
  3. nhncloud deploy run <target>
```

좌표 옵션 형태로 바꾼다. 없는 인수를 도움말에 남기면 사용자가 그것을 따라 쓰다 실패한다.
`artifacts` 는 좌표가 필요 없고, 나머지는 필요한 옵션을 예시에 담는다.

### 6. 옵션 필수 검증은 spinner 시작 전에 한다

좌표 누락은 입력 오류이므로 네트워크 호출과 spinner 전에 거부한다.
이 저장소는 그 순서를 지키고 있다 — 기존 코드의 `── 1. 검증` 주석 블록 위치를 따른다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/config/types.ts` | 수정 — `DeployTarget`·`Config.deploy` 제거 |
| `src/config/credentials.ts` | 수정 — `getDeployTarget` 제거, `warnLegacyDeployTargets` 추가 |
| `src/config/credentials.test.ts` | **신규** — `src/config/` 에는 `credentials.ts`·`types.ts` 둘뿐이다 |
| `src/index.ts` | 수정 — `preSubcommand` hook 으로 경고 호출, `deployAgentWorkflow` 예시 문구 |
| `src/commands/deploy/*.ts` (8개) | 수정 — 인수 제거, 좌표 해석, 필수 검증 |
| `src/commands/deploy/commands.test.ts` | 수정 — phase-02 가 만든 파일에 인수 부재 단언 추가 |

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm test
pnpm run build
```

pnpm 이 `ERR_PNPM_IGNORED_BUILDS` 로 실패하면 `./node_modules/.bin/tsc`,
`./node_modules/.bin/vitest run`, `./node_modules/.bin/tsup` 을 직접 실행한다.

추가 기준이다.

```bash
# cwd: <repo root>
# 폐지된 심볼이 남지 않았는지 — 출력이 없어야 한다
grep -rn 'getDeployTarget\|DeployTarget' src/ || true

# 경고 함수가 생겼는지 — 1 이 나와야 한다
grep -c 'export async function warnLegacyDeployTargets' src/config/credentials.ts || true

# 호출이 hook 한 곳에만 있는지 — index.ts 에서 1, deploy 명령 디렉터리에서는 출력이 없어야 한다
grep -c 'warnLegacyDeployTargets' src/index.ts || true
grep -rn 'warnLegacyDeployTargets' src/commands/deploy/ || true

# target 인수가 남지 않았는지 — 출력이 없어야 한다
# 앞선 형태(`\.argument("\[\?target`)는 artifacts.ts 의 `[target]` 1건만 잡고 `<target>` 7건을 놓쳤다.
# deploy 명령에는 위치 인수가 하나도 없어야 하므로 `.argument(` 자체를 본다 (변경 전 8건).
grep -rn '\.argument(' src/commands/deploy/ || true

# 구형 호출 안내가 코드에 남지 않았는지 — 출력이 없어야 한다
grep -n 'deploy artifacts <target>\|deploy server-groups <target>\|deploy run <target>' src/index.ts || true
```

명령 카탈로그는 **170** 이어야 한다. 인수 제거는 명령 수를 바꾸지 않는다.

```bash
# cwd: <repo root>
node dist/index.js commands --json | jq '.commands | length'
```

실동작으로 확인한다. 좌표 없이 부르면 입력 오류(종료 코드 3)여야 한다.

```bash
# cwd: <repo root>
node dist/index.js deploy run ; echo "exit=$?"
node dist/index.js deploy histories ; echo "exit=$?"
```

구형 호출도 확인한다. `config.json` 에 `deploy.targets` 를 둔 상태에서 부르면
폐지 경고가 stderr 에 나오고, 그다음 잉여 인수 오류로 끝나야 한다.

```bash
# cwd: <repo root>
node dist/index.js deploy run someTarget ; echo "exit=$?"
```

도움말에 없는 인수가 남지 않았는지 확인한다.

```bash
# cwd: <repo root>
node dist/index.js deploy --help
```

테스트는 아래를 덮는다.

- `config.json` 에 `deploy.targets` 가 있으면 경고가 stderr 로 나오고, 명령은 계속 진행한다.
- `deploy.targets` 가 없으면 경고가 나오지 않는다.
- 경고에 target 이름이 담기지 않는다.
- 좌표가 필수인 명령을 좌표 없이 부르면 `EXIT_PARAM_ERROR` 이고, 어느 옵션이 필요한지 문구에 나온다.
- `artifacts` 는 좌표 없이 동작한다.
- 좌표 검증이 spinner 시작과 네트워크 호출보다 앞선다.
- `--quiet` 에서도 경고가 stderr 로 나온다.
- deploy 명령 8개에 위치 인수가 하나도 없다 (`commands.test.ts` 에서 Commander 트리로 단언).

## 의도 메모 (왜)

- 경고를 `deploy` 그룹의 `preSubcommand` hook 한 곳에 두는 이유는 둘이다.
  8곳에 흩으면 일부가 빠져도 드러나지 않고, hook 이 인수 거부보다 먼저 발동해 구형 호출자에게도 닿는다.
- 자동 마이그레이션을 하지 않는 이유는 appkey 가 자격증명이기 때문이다.
  CLI 가 `0600` 파일을 임의로 고치는 것보다 사용자가 확인하고 옮기는 편이 안전하다.
- target 이름을 경고에 담지 않는 이유는 그것이 사용자 리소스 식별자이고, 로그나 CI 출력에 남을 수 있기 때문이다.
- 좌표를 필수로 거부하는 이유는 조용히 빈 값으로 API 를 부르면 서버 오류로 나타나 원인을 찾기 어렵기 때문이다.

## 승인된 범위 외 추가 (이 phase 커밋과 분리한다)

계획에 없던 항목이지만 사용자와 코디네이터 승인을 받았다. **phase-03 커밋 이후 별도 커밋으로** 처리한다.

`--app-key` 미노출을 단언하는 `collectAppKeyOptionPaths` 헬퍼가 `apigateway`·`ncr`·`ncs` 세 test 파일에 복제돼 있다.
`ncr`·`ncs` 상단에 "3곳째 복제다. 4곳째에는 공용 테스트 유틸로 추출한다" 주석이 있고 `deploy` 가 4곳째다.
그 조건이 충족됐으므로 추출한다.

- 위치는 `src/commands/appkey-option.test-helper.ts` 다. 네 사용처가 모두 `src/commands/` 아래이고, 상위로 올리면 실제 의존 범위보다 넓게 보인다.
- 파일 이름에 `test` 를 넣어 프로덕션에서 import 하면 안 되는 것임을 이름으로 드러낸다.
  `*.test.ts` 패턴에 걸리지 않으므로 vitest 가 이 파일을 테스트로 수집하지 않는다.
- 헬퍼에 무엇을 검증하는 것인지 한 줄 주석을 남긴다. `ncr`·`ncs` 의 "4곳째에는 추출한다" 주석은 목적을 다했으니 지운다.
- 프로덕션 코드가 이 헬퍼를 import 하지 않는지 `grep` 으로 확인하고 결과를 phase 보고에 적는다.
- 헬퍼를 고의로 망가뜨렸을 때 네 파일의 테스트가 모두 실패하는지 한 번 확인한 뒤 원복한다. 통과하면 단언이 헛돈다는 뜻이다.
- 커밋 메시지에 "plan 064 가 남긴 조건이 충족돼 추출한다" 는 맥락을 적는다.

순서 제약이 있다. deploy 회귀 테스트는 phase-02 가 `--app-key` 를 지운 뒤에만 통과하고,
인수 부재 단언은 이 phase 가 인수를 지운 뒤에만 통과한다. 그래서 이 시점에 한다.

## Blocked 조건

- `src/commands/deploy/helpers.ts` 에 `resolveDeployAppKey` 가 없으면
  `PHASE_BLOCKED: phase-02 산출물 부재` 를 출력하고 종료한다.
