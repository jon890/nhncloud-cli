# Phase 01 — profile 에 deploy appkey 를 저장한다

**Execution profile**: standard

---

## 목표

`deploy` 의 appkey 를 profile 자격증명으로 받을 수 있게 만든다.

지금 appkey 는 `config.json` 의 배포 좌표 안에 있고 그 파일은 `0644` 다.
다른 네 서비스의 appkey 는 모두 `credentials.json`(`0600`)에 있고 `deploy` 만 예외다.
appkey 는 유출되면 교체해야 하는 값이라 그 위치가 실제 위험과 맞지 않는다.
근거는 `docs/adr/033-deploy-appkey-and-coordinates.md` 다. 착수 전에 읽는다.

이 phase 는 **저장과 설정 경로만** 만든다. 읽는 쪽은 phase-02 가 바꾼다.
그래서 이 phase 만 적용해도 기존 동작이 깨지지 않는다.

**범위 외**: `deploy` 명령의 appkey 해석 변경과 `--app-key` 제거는 phase-02 다.
`config.json` 의 `deploy.targets` 폐지와 경고는 phase-03 이다.
공개 문서는 phase-04 가 맡는다.
`ncr`·`ncs` 는 이 plan 이 다루지 않는다 — plan 064 가 처리한다.

---

## 작업 항목 (2)

### 1. `src/commands/configure.ts` — `--deploy-appkey` 를 추가한다

`apigateway` 를 그대로 따른다. 그 서비스가 같은 형태(appkey 만, secret 없음)라 참조로 삼기에 정확하다.
`grep -n "apigateway" src/commands/configure.ts` 로 손댈 지점을 모두 찾은 뒤 대응하는 `deploy` 코드를 넣는다.

빠뜨리기 쉬운 다섯 곳이다.

- 옵션 인터페이스의 `apigatewayAppkey?: string;` 옆에 `deployAppkey?: string;`
- 함수 매개변수 목록의 `apigateway: ServiceCredential | undefined` 옆에 `deploy`
- 저장 분기 `if (apigateway) { await setServiceCredential(profileName, "apigateway", apigateway); }` 와 같은 형태
- 빈값 검증 — `--deploy-appkey 값은 비어 있을 수 없습니다.`
- `ServiceCredential` 조립 — `opts.deployAppkey?.trim() ? { appkey: ... } : undefined`

옵션 정의는 다른 appkey 옵션과 같은 자리에 둔다.

```
--deploy-appkey <key>   deploy appkey (비대화형)
```

### 2. 대화형 흐름에 deploy 를 넣는다

대화형은 서비스별 자격증명을 순서대로 묻는다.
`deploy` 를 그 목록에 넣고 건너뛸 수 있게 한다. 다른 서비스와 같은 방식이다.

연결 테스트는 넣지 않는다.
`apigateway` 가 "저장만 수행하고 연결은 조회 명령에서 검증" 하는 것과 같게 둔다.
deploy 조회는 배포 좌표가 있어야 호출할 수 있어 `configure` 시점에 검증할 수 없다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/commands/configure.ts` | 수정 — 옵션, 검증, 저장, 대화형 |
| `src/commands/configure.test.ts` | 수정 — 저장과 빈값 검증 |

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
# 옵션이 생겼는지 — 1 이 나와야 한다 (변경 전 0)
grep -c 'deploy-appkey' src/commands/configure.ts || true

# 저장 경로가 생겼는지 — 1 이상이어야 한다
grep -c 'setServiceCredential(profileName, "deploy"' src/commands/configure.ts || true
```

도움말에 옵션이 노출되는지 확인한다.

```bash
# cwd: <repo root>
node dist/index.js configure --help | grep deploy-appkey
```

빈값을 거부하는지 확인한다. 종료 코드 3 이어야 한다.

```bash
# cwd: <repo root>
node dist/index.js configure --profile <없는이름> --deploy-appkey "" ; echo "exit=$?"
```

테스트는 아래를 덮는다.

- `--deploy-appkey <key>` 가 profile 의 `deploy.appkey` 로 저장된다.
- 빈 문자열은 `EXIT_PARAM_ERROR` 로 거부된다.
- 다른 서비스 자격증명을 함께 준 경우 서로 덮어쓰지 않는다.

명령 카탈로그는 **170** 이어야 한다. 옵션 추가이지 명령 추가가 아니다.

## 의도 메모 (왜)

- 저장 경로를 먼저 만드는 이유는 이 phase 만 적용해도 기존 동작이 깨지지 않게 하려는 것이다.
  읽는 쪽을 먼저 바꾸면 사용자가 appkey 를 설정할 방법이 없는 상태가 생긴다.
- `apigateway` 를 참조로 지정한 이유는 그 서비스가 appkey 만 쓰고 secret 이 없어 형태가 같기 때문이다.
- 연결 테스트를 넣지 않는 이유는 deploy 조회에 배포 좌표가 필요해 `configure` 시점에 확인할 수 없기 때문이다.
