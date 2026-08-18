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

비대화형 경로는 `apigateway` 를 그대로 따른다. 그 서비스가 같은 형태(appkey 만, secret 없음)라 참조로 삼기에 정확하다.

**손댈 지점은 열거를 믿지 말고 grep 으로 전부 찾는다.** 아래 두 명령의 출력이 실제 대응 지점 전체다.

```bash
# cwd: <repo root>
grep -n "apigatewayAppkey" src/commands/configure.ts
grep -n "apigateway" src/commands/configure.ts
```

아래가 빠뜨리기 쉬운 일곱 종류다. **숫자를 믿지 말고 위 grep 출력 전체를 대응시킨다** —
옵션 정의와 `runNonInteractive` 의 `saveAndVerify` 호출 인수까지 세면 실제 지점은 아홉이다.
뒤의 둘을 빠뜨리면 tsc 는 통과하지만 조용히 오동작한다.

- 옵션 인터페이스의 `apigatewayAppkey?: string;` 옆에 `deployAppkey?: string;`
- `saveAndVerify` 매개변수 목록의 `apigateway: ServiceCredential | undefined` 옆에 `deploy`
- 저장 분기 `if (apigateway) { await setServiceCredential(profileName, "apigateway", apigateway); }` 와 같은 형태
- 빈값 검증 — `--deploy-appkey 값은 비어 있을 수 없습니다.`
- `ServiceCredential` 조립 — `opts.deployAppkey?.trim() ? { appkey: ... } : undefined`
- **`hasFlag` 판정** — `opts.deployAppkey !== undefined` 를 넣지 않으면 `configure --deploy-appkey <key>` 가 비대화형이 아니라 대화형으로 빠진다.
- **"중 하나가 필요합니다" 가드** — `if (!uak && !logncrash && !iaas && !ncr && !ncs && !apigateway)` 조건과 그 안내 문구에 `deploy` 를 넣지 않으면 `--deploy-appkey` 단독 호출이 거부된다.

옵션 정의는 다른 appkey 옵션과 같은 자리에 둔다.

`saveAndVerify` 는 위치 인수가 아홉 개다. 열 번째를 `apigateway` 옆에 넣으면 둘 다 `ServiceCredential | undefined` 라 자리를 바꿔 넣어도 tsc 가 통과한다.
그래서 아래 테스트가 **저장 키 이름까지** 단언해야 이 밀림을 잡는다.

```
--deploy-appkey <key>   deploy appkey (비대화형)
```

### 2. 대화형 흐름에 deploy 를 넣는다

대화형은 서비스별 자격증명을 순서대로 묻는다.
`deploy` 를 그 목록에 넣고 건너뛸 수 있게 한다.

**대화형 참조는 `apigateway` 가 아니라 `ncr`·`ncs` 다.**
`runInteractive` 는 `saveAndVerify` 의 apigateway 자리에 `undefined` 를 넘긴다 — apigateway 는 비대화형 전용이라 따라 쓸 대화형 코드가 없다.
`configure.ts` 의 "5. ncr 설정 여부" 와 "6. ncs 설정 여부" 블록을 그대로 따른다.
`runInteractive` 안의 `saveAndVerify` 호출은 세 곳이다. 세 곳 모두 인수를 맞춘다.

`deploy` 는 대화형에 넣고 `apigateway` 는 그대로 두는 비대칭은 의도다.
이 plan 의 범위가 `deploy` 라서 그렇고, `apigateway` 를 대화형에 넣는 것은 별도 후속이다.

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
# 옵션·오류 문구·안내 문구가 생겼는지 — 3 이상이어야 한다 (변경 전 0)
# 참조인 apigateway-appkey 가 3 이므로 같은 수를 기대한다
grep -c 'deploy-appkey' src/commands/configure.ts || true

# 저장 경로가 생겼는지 — 1 이상이어야 한다
grep -c 'setServiceCredential(profileName, "deploy"' src/commands/configure.ts || true

# hasFlag 판정에 들어갔는지 — 출력이 있어야 한다
grep -n 'opts.deployAppkey !== undefined' src/commands/configure.ts || true

# 최소 하나 가드에 들어갔는지 — 출력이 있어야 한다
# 어순은 자유다. 이 grep 이 비면 gate 문구를 믿지 말고 `configure.ts` 의 실제 조건줄을 눈으로 확인한다
grep -n '!deploy' src/commands/configure.ts || true
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

- `--deploy-appkey <key>` 가 profile 의 `deploy.appkey` 로 저장된다. **저장 키 이름(`"deploy"`)까지 단언한다** — `saveAndVerify` 위치 인수가 밀리면 이 단언만 그것을 잡는다.
- 빈 문자열은 `EXIT_PARAM_ERROR` 로 거부된다.
- `--deploy-appkey` 를 단독으로 주면 대화형으로 빠지지 않고 저장까지 간다.
- 다른 서비스 자격증명을 함께 준 경우 서로 덮어쓰지 않는다. 특히 `--apigateway-appkey` 와 함께 주면 각각 제 블록에 저장된다.

명령 카탈로그는 **170** 이어야 한다. 옵션 추가이지 명령 추가가 아니다.

## 의도 메모 (왜)

- 저장 경로를 먼저 만드는 이유는 이 phase 만 적용해도 기존 동작이 깨지지 않게 하려는 것이다.
  읽는 쪽을 먼저 바꾸면 사용자가 appkey 를 설정할 방법이 없는 상태가 생긴다.
- `apigateway` 를 참조로 지정한 이유는 그 서비스가 appkey 만 쓰고 secret 이 없어 형태가 같기 때문이다.
- 연결 테스트를 넣지 않는 이유는 deploy 조회에 배포 좌표가 필요해 `configure` 시점에 확인할 수 없기 때문이다.
