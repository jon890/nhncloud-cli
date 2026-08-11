# Phase 01 — apigateway 조회 명령의 `--app-key` 오버라이딩 제거

**Execution profile**: standard

---

## 목표

`apigateway` 명령군에서 `--app-key` 옵션을 없애고 appKey 를 profile 하나로만 해석한다.
appkey 지정 경로가 두 개면 명령 이력만 보고 어느 값이 쓰였는지 알 수 없고,
profile 을 바꿔도 `--app-key` 가 박힌 스크립트는 옛 appkey 를 계속 쓴다.

`apigateway` 조회 명령은 v0.13.0 이 npm 에 게시되기 전이라 사용자 영향 없이 되돌릴 수 있다.
`deploy`·`ncr`·`ncs` 의 같은 옵션 44곳은 이미 게시되어 쓰이므로 이 phase 의 대상이 아니다
(이슈 #85 에서 major 버전에 처리한다).

**범위 외**: 쓰기 명령 추가는 phase 02 이후다. `deploy`·`ncr`·`ncs` 는 손대지 않는다.

---

## 작업 항목 (4)

### 1. `src/commands/apigateway/helpers.ts` — appKey 해석에서 옵션 인자 제거

`resolveApiGatewayAppKey(profileName: string, appKeyOption?: string)` 의 두 번째 인자를 없애
`resolveApiGatewayAppKey(profileName: string): Promise<string>` 로 바꾼다.
함수 첫 줄의 `if (appKeyOption?.trim()) return appKeyOption.trim();` 분기를 삭제한다.

`resolveApiGatewayClient` 의 인자 타입에서 `appKey?: string` 를 제거하고
호출부 `resolveApiGatewayAppKey(profileName, opts.appKey)` 를 `resolveApiGatewayAppKey(profileName)` 로 바꾼다.

appKey 부재 오류 메시지에서 `--app-key로 직접 넘기세요.` 문장을 빼고
`nhncloud configure --apigateway-appkey <key>` 안내만 남긴다.
JSDoc `/** --app-key 옵션 > profile 의 apigateway.appkey 순서로 appKey를 해석한다. */` 도
profile 단일 경로를 서술하도록 고친다.

### 2. 명령 파일 4개 — 옵션 정의와 인터페이스 필드 제거

아래 각 파일에서 `.option("--app-key <key>", ...)` 줄과
옵션 인터페이스의 `appKey?: string;` 필드를 지운다.

- `src/commands/apigateway/service.ts` — 옵션 2곳(`list`·`get`)과 필드 1곳
- `src/commands/apigateway/stage.ts` — `addApiGatewayOptions` 안 1곳과 필드 1곳
- `src/commands/apigateway/resource.ts` — `addApiGatewayOptions` 안 1곳과 필드 1곳
- `src/commands/apigateway/deploy.ts` — `addApiGatewayOptions` 안 1곳과 필드 1곳

### 3. `src/commands/apigateway/commands.test.ts` — 옵션 계약 테스트 갱신

`appKey: "app-key"` 를 쓰는 케이스가 있으면 profile 경로만 쓰도록 고친다.
`--app-key` 가 커맨드 트리에 존재하지 않음을 확인하는 케이스를 추가한다.
`apigateway` 하위 명령을 순회해 옵션 이름에 `--app-key` 가 0건임을 단정한다.

### 4. `skills/nhncloud-cli/references/apigateway.md` — 사용자 가이드 정정

`--app-key` 를 언급하는 4곳을 고친다.

- appkey 설정 문단에서 "명령마다 `--app-key <appkey>`를 넘긴다" 와
  "`--app-key`가 `profile` 설정보다 우선한다" 를 삭제하고 profile 설정만 남긴다
- 사용 예의 `--app-key <appkey>` 인자를 지운다
- 공통 옵션 서술을 `--region <region>`, `--profile <name>` 으로 줄인다

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/commands/apigateway/helpers.ts` | 수정 |
| `src/commands/apigateway/service.ts` | 수정 |
| `src/commands/apigateway/stage.ts` | 수정 |
| `src/commands/apigateway/resource.ts` | 수정 |
| `src/commands/apigateway/deploy.ts` | 수정 |
| `src/commands/apigateway/commands.test.ts` | 수정 |
| `skills/nhncloud-cli/references/apigateway.md` | 수정 |

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm test
pnpm run build

# apigateway 소스와 공개 가이드에 --app-key 잔존 0건
test "$(grep -rn -- '--app-key' src/commands/apigateway/ skills/nhncloud-cli/references/apigateway.md | grep -c .)" = "0"

# deploy·ncr·ncs 의 --app-key 는 그대로 유지 (이 phase 대상 아님)
# 38 = deploy 8 + ncr 4 + ncs 26. 옵션 정의만 세므로 두 서비스 helpers 의 오류 메시지·JSDoc 은 포함되지 않는다.
# 이슈 #85(세 서비스에서 --app-key 제거)가 먼저 머지되면 이 값과 검사 자체가 무의미해지니 그때 함께 지운다
test "$(grep -rn -- '"--app-key' src/commands/deploy/ src/commands/ncr/ src/commands/ncs/ | grep -c .)" = "38"

# 커맨드 트리에 apigateway --app-key 옵션 0건
node dist/index.js commands --json \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s).commands.filter(c=>c.path.startsWith("apigateway"));const bad=a.filter(c=>(c.options||[]).some(o=>/--app-key/.test(o.flags||o.name||JSON.stringify(o))));if(bad.length){console.error(bad.map(c=>c.path).join(","));process.exit(1)}})'

git diff --check
```

## 의도 메모 (왜)

- profile 단일 경로로 좁히면 appkey 가 자격증명 파일 한 곳에만 있어 회전과 감사가 단순해진다.
- 이미 게시된 세 서비스를 함께 건드리지 않는 이유는 `unknown option` 으로 기존 스크립트를 깨기 때문이다.
  깨는 변경은 major 버전에서 이슈 #85 로 처리한다.
- 이 phase 를 먼저 두는 이유는 phase 02 이후가 같은 `helpers.ts` 를 확장하기 때문이다.
  옵션을 남긴 채 쓰기 명령을 붙이면 새 명령에도 오버라이딩 표면이 따라 들어간다.
