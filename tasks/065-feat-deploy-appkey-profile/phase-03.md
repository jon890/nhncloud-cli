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

## 작업 항목 (5)

### 1. `src/config/types.ts` — 스키마에서 target 을 없앤다

- `DeployTarget` 인터페이스를 지운다.
- `Config` 에서 `deploy?: { targets?: … }` 를 지운다.

읽지 않고 경고하려면 남은 값을 검사해야 하므로, `Config` 를 좁히는 대신 **경고 전용 타입**을 둔다.

```ts
/** 폐지된 블록. 읽지 않고 경고만 하려고 형태만 남긴다 ([[adr-033]]). */
interface LegacyDeployConfig { targets?: Record<string, unknown> }
```

이 타입은 export 하지 않는다. 경고를 내는 곳에서만 쓴다.

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

`run` 의 세 좌표가 모두 필수인지 먼저 확인한다.
`grep -n "scenarioIds\|serverGroupId" src/commands/deploy/run.ts` 로 실제 사용을 보고,
기존에 target 없이도 동작하던 조합이 있으면 그 조합을 유지한다.

옵션 설명에서 "target override" 표현을 걷어낸다. 이제 override 가 아니라 정식 입력이다.

### 4. 경고를 호출한다

`warnLegacyDeployTargets` 를 deploy 명령 진입 시 한 번 부른다.
8곳에 흩지 말고 `src/commands/deploy/helpers.ts` 의 client 생성 경로에 둔다 —
그 함수를 모든 deploy 명령이 이미 지나간다.

`grep -n "createDeployClient" src/commands/deploy/` 로 확인한다.

### 5. 옵션 필수 검증은 spinner 시작 전에 한다

좌표 누락은 입력 오류이므로 네트워크 호출과 spinner 전에 거부한다.
이 저장소는 그 순서를 지키고 있다 — 기존 코드의 `── 1. 검증` 주석 블록 위치를 따른다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/config/types.ts` | 수정 — `DeployTarget`·`Config.deploy` 제거 |
| `src/config/credentials.ts` | 수정 — `getDeployTarget` 제거, `warnLegacyDeployTargets` 추가 |
| `src/config/credentials.test.ts` | 수정 — 경고 동작 검증 |
| `src/commands/deploy/helpers.ts` | 수정 — 경고 호출 |
| `src/commands/deploy/*.ts` (8개) | 수정 — 인수 제거, 좌표 해석, 필수 검증 |
| `src/commands/deploy/*.test.ts` | 수정 — target 인수를 쓰는 테스트 정리 |

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

# 경고 함수가 생겼고 한 곳에서 불리는지 — 각각 1 이 나와야 한다
grep -c 'export async function warnLegacyDeployTargets' src/config/credentials.ts || true
grep -rc 'warnLegacyDeployTargets(' src/commands/deploy/helpers.ts || true

# target 인수가 남지 않았는지 — 출력이 없어야 한다
grep -rn '\.argument("\[\?target' src/commands/deploy/ || true
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

테스트는 아래를 덮는다.

- `config.json` 에 `deploy.targets` 가 있으면 경고가 stderr 로 나오고, 명령은 계속 진행한다.
- `deploy.targets` 가 없으면 경고가 나오지 않는다.
- 경고에 target 이름이 담기지 않는다.
- 좌표가 필수인 명령을 좌표 없이 부르면 `EXIT_PARAM_ERROR` 이고, 어느 옵션이 필요한지 문구에 나온다.
- `artifacts` 는 좌표 없이 동작한다.
- 좌표 검증이 spinner 시작과 네트워크 호출보다 앞선다.

## 의도 메모 (왜)

- 경고를 client 생성 경로 한 곳에 두는 이유는 8곳에 흩으면 일부가 빠져도 드러나지 않기 때문이다.
- 자동 마이그레이션을 하지 않는 이유는 appkey 가 자격증명이기 때문이다.
  CLI 가 `0600` 파일을 임의로 고치는 것보다 사용자가 확인하고 옮기는 편이 안전하다.
- target 이름을 경고에 담지 않는 이유는 그것이 사용자 리소스 식별자이고, 로그나 CI 출력에 남을 수 있기 때문이다.
- 좌표를 필수로 거부하는 이유는 조용히 빈 값으로 API 를 부르면 서버 오류로 나타나 원인을 찾기 어렵기 때문이다.

## Blocked 조건

- `src/commands/deploy/helpers.ts` 에 `resolveDeployAppKey` 가 없으면
  `PHASE_BLOCKED: phase-02 산출물 부재` 를 출력하고 종료한다.
