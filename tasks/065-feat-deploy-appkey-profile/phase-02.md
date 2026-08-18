# Phase 02 — deploy 가 profile 에서 appkey 를 읽는다

**Execution profile**: standard

---

## 목표

`deploy` 명령 8개가 appkey 를 profile 에서만 읽게 만들고 `--app-key` 를 없앤다.

지금은 각 명령이 `opts.appKey ?? target.appKey` 로 인라인 해석한다.
appkey 를 지정하는 경로가 둘이면 어느 값이 쓰였는지 명령 이력만 보고 알 수 없고,
profile 을 바꿔도 박혀 있는 값이 그대로 쓰여 자격증명 회전이 조용히 누락된다([[adr-029]]).

**범위 외**: `config.json` 의 `deploy.targets` 폐지와 경고, `target` 인수 제거는 phase-03 이다.
이 phase 는 appkey 해석만 바꾸고 좌표(`artifactId` 등)는 아직 target 에서 읽는다.
공개 문서는 phase-04 가 맡는다.

이 phase 는 phase-01 이 만든 `profiles.<name>.deploy.appkey` 저장 경로를 전제한다.
없으면 base 를 확인하고 멈춘다.

---

## 작업 항목 (3)

### 1. `src/commands/deploy/helpers.ts` — 공용 해석 함수를 만든다

지금 deploy 에는 appkey 해석 함수가 없고 8개 명령이 각자 인라인 처리한다.
`ncr` 의 `resolveAppKey` 와 같은 형태로 하나 만든다.

```ts
export async function resolveDeployAppKey(profileName: string): Promise<string>
```

- profile 의 `deploy` 블록에서 `appkey` 를 읽는다. `getServiceCredential("deploy", profileName)` 을 쓴다.
- 블록이 없거나 `appkey` 가 비면 `EXIT_CONFIG_ERROR` 로 안내한다.

```
Deploy appKey 가 없습니다. nhncloud configure --deploy-appkey <key> 를 실행해 설정하세요.
```

- `ncr/helpers.ts` 의 `resolveAppKey` 가 블록 부재만 친절한 안내로 바꾸고 다른 오류는 원인을 보존해 rethrow 한다.
  같은 처리를 따른다 — profile 자체 부재나 파싱 오류를 설정 안내로 덮으면 원인이 사라진다.

### 2. 명령 8개에서 appkey 해석을 교체한다

대상 파일이다. `grep -n 'opts.appKey' src/commands/deploy/` 로 실제 위치를 확인한 뒤 고친다.

| 파일 | 지금 |
|---|---|
| `artifacts.ts` | `if (opts.appKey) … else if (targetName) …` 3분기 |
| `binaries.ts` | `opts.appKey ?? target.appKey` |
| `binary-groups.ts` | 같음 |
| `download.ts` | 같음 |
| `histories.ts` | 같음 |
| `run.ts` | 같음 |
| `server-groups.ts` | 같음 |
| `upload.ts` | 같음 |

- appkey 는 `await resolveDeployAppKey(profileName)` 로 받는다.
- **좌표는 건드리지 않는다.** `opts.artifactId ?? target.artifactId` 같은 줄은 그대로 둔다.
- `artifacts.ts` 는 appkey 3분기가 사라지면서 `target` 을 쓰지 않게 된다.
  그래도 이 phase 에서는 `[target]` 인수를 **남긴다** — 제거는 phase-03 이 다룬다.
  받은 인수를 쓰지 않으면 lint 나 tsc 가 잡을 수 있으니, 그 경우 `_targetName` 으로 이름만 바꿔 둔다.

호출 순서를 지킨다. 자격증명 해석은 spinner 시작 전이다 — 기존 코드가 이미 그 순서다.

### 3. 옵션 정의와 인터페이스 필드를 지운다

`deploy` 의 `.option("--app-key ...")` 는 8곳이다.
각 명령의 옵션 인터페이스에 있는 `appKey?: string;` 필드도 함께 지운다.

`artifacts.ts` 의 인수 설명에도 `--app-key` 언급이 있다.

```
.argument("[target]", "config.json 에 정의된 deploy target 이름 (--app-key 로 대체 가능)")
```

괄호 안의 문구를 지운다. 없는 옵션을 설명에 남기면 사용자가 그것을 찾는다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/commands/deploy/helpers.ts` | 수정 — `resolveDeployAppKey` 추가 |
| `src/commands/deploy/artifacts.ts` | 수정 — 3분기 제거, 옵션·필드, 인수 설명 |
| `src/commands/deploy/binaries.ts` | 수정 — 해석 교체, 옵션·필드 |
| `src/commands/deploy/binary-groups.ts` | 수정 — 같음 |
| `src/commands/deploy/download.ts` | 수정 — 같음 |
| `src/commands/deploy/histories.ts` | 수정 — 같음 |
| `src/commands/deploy/run.ts` | 수정 — 같음 |
| `src/commands/deploy/server-groups.ts` | 수정 — 같음 |
| `src/commands/deploy/upload.ts` | 수정 — 같음 |
| `src/commands/deploy/*.test.ts` | 수정 — `--app-key` 를 쓰는 테스트 정리 |

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
# 해석 함수가 생겼는지 — 1 이 나와야 한다
grep -c 'export async function resolveDeployAppKey' src/commands/deploy/helpers.ts || true

# deploy 에 --app-key 가 남지 않았는지 — 출력이 없어야 한다 (변경 전 8건 + 인수 설명 1건)
grep -rn '\-\-app-key' src/commands/deploy/ || true

# 죽은 필드가 남지 않았는지 — 출력이 없어야 한다
grep -rn 'appKey?: string' src/commands/deploy/ || true

# 좌표 해석은 그대로인지 — 7 이상이어야 한다 (이 phase 는 좌표를 건드리지 않는다)
grep -rc 'target.artifactId' src/commands/deploy/ | grep -v ':0' | wc -l | tr -d ' '
```

명령 카탈로그는 **170** 이어야 한다.

```bash
# cwd: <repo root>
node dist/index.js commands --json | jq '.commands | length'
```

`deploy run --help` 에 `--app-key` 가 없고 `--artifact-id` 는 남아 있는지 확인한다.

테스트는 아래를 덮는다.

- profile 의 `deploy.appkey` 로 appkey 가 해석된다.
- `deploy` 블록이 없으면 `EXIT_CONFIG_ERROR` 와 `configure --deploy-appkey` 안내가 나온다.
- profile 자체 부재나 파싱 오류는 설정 안내로 덮이지 않고 원인이 보존된다.
- 좌표(`artifactId` 등)는 여전히 target 과 옵션에서 읽는다.

## 의도 메모 (왜)

- 공용 해석 함수를 만드는 이유는 8곳이 같은 처리를 인라인으로 복제하고 있었기 때문이다.
  `ncr`·`ncs` 는 이미 함수로 모아 두었고 deploy 만 흩어져 있었다.
- `artifacts.ts` 의 `[target]` 인수를 이 phase 에서 남기는 이유는 한 phase 가 한 가지만 바꾸게 하려는 것이다.
  appkey 해석과 인수 표면 변경을 함께 하면 어느 쪽이 회귀를 만들었는지 가리기 어렵다.

## Blocked 조건

- `src/commands/configure.ts` 에 `deploy-appkey` 가 없으면
  `PHASE_BLOCKED: phase-01 산출물 부재` 를 출력하고 종료한다.
