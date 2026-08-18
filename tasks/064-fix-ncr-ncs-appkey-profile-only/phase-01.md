# Phase 01 — ncr 의 --app-key 제거

**Execution profile**: standard

---

## 목표

`ncr` 명령에서 `--app-key` 오버라이딩을 없애고 appkey 를 profile 로만 해석한다.

appkey 를 지정하는 경로가 둘이면 어느 값이 쓰였는지 명령 이력만 보고 알 수 없다.
profile 을 바꿔도 `--app-key` 가 박힌 스크립트는 옛 appkey 를 계속 써서 자격증명 회전이 조용히 누락된다.
근거는 [[adr-029]] 다.

**범위 외**: `ncs` 는 phase-02 가, 공개 문서는 phase-03 이 맡는다.
`deploy` 는 이 plan 에서 다루지 않는다 — appkey 가 profile 이 아니라 `config.json` 좌표에 있어 구조가 다르고, 별도 plan(065)이 [[adr-033]] 으로 처리한다.
`--region`·`--profile` 같은 다른 옵션의 우선순위는 바꾸지 않는다.

---

## 작업 항목 (3)

### 1. `src/commands/ncr/helpers.ts` — 해석 함수에서 override 인자를 없앤다

```ts
export async function resolveAppKey(profileName: string): Promise<string>
```

- 두 번째 매개변수 `appKeyOpt?: string` 과 첫 줄의 `if (appKeyOpt) return appKeyOpt;` 를 지운다.
- 함수 본문의 profile 조회 경로는 그대로 둔다.
- 오류 메시지에서 `--app-key` 안내를 없앤다. 현재 문구가 이렇다.

```
NCR appKey 가 없습니다. --app-key 옵션으로 지정하거나
nhncloud configure --ncr-appkey <key> 를 실행해 설정하세요.
```

`configure` 안내만 남긴다. 없는 옵션을 권하면 사용자가 `unknown option` 을 만난다.

### 2. 호출부 3곳에서 인자를 뺀다

`grep -rn "resolveAppKey(" src/commands/ncr/` 로 확인한 위치다.

- `src/commands/ncr/helpers.ts`
- `src/commands/ncr/get.ts`
- `src/commands/ncr/list.ts`

`resolveAppKey(profileName, opts.appKey)` 를 `resolveAppKey(profileName)` 로 바꾼다.

### 3. 옵션 정의와 인터페이스 필드를 지운다

`ncr` 의 `.option("--app-key ...")` 는 4곳이다.
`grep -rn '\.option("--app-key' src/commands/ncr/` 로 실제 위치를 확인한 뒤 지운다.

각 명령의 옵션 인터페이스에 있는 `appKey?: string;` 필드도 함께 지운다.
필드만 남기면 `tsc` 는 통과하지만 죽은 코드가 된다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/commands/ncr/helpers.ts` | 수정 — 해석 함수 시그니처, 오류 메시지 |
| `src/commands/ncr/get.ts` | 수정 — 옵션·필드·호출부 |
| `src/commands/ncr/list.ts` | 수정 — 옵션·필드·호출부 |
| `src/commands/ncr/images.ts` | 수정 — 옵션·필드 |
| `src/commands/ncr/tags.ts` | 수정 — 옵션·필드 |
| `src/commands/ncr/*.test.ts` | 수정 — `--app-key` 를 쓰는 테스트가 있으면 정리 |

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
# ncr 에 --app-key 가 남지 않았는지 — 출력이 없어야 한다 (변경 전 4건)
grep -rn '\-\-app-key' src/commands/ncr/ || true

# 해석 함수가 인자 하나만 받는지 — 1 이 나와야 한다
grep -c 'resolveAppKey(profileName: string): Promise<string>' src/commands/ncr/helpers.ts || true

# 죽은 필드가 남지 않았는지 — 출력이 없어야 한다
grep -rn 'appKey?: string' src/commands/ncr/ || true
```

명령 카탈로그 수가 바뀌지 않아야 한다. 옵션 제거이지 명령 제거가 아니다.

```bash
# cwd: <repo root>
node dist/index.js commands --json | jq '.commands | length'
```

**170** 이어야 한다.

`ncr list --help` 에 `--app-key` 가 없고 `--profile` 은 남아 있는지 확인한다.

## 의도 메모 (왜)

- 해석 함수의 인자를 먼저 없애는 이유는 그것이 유일한 사용처이기 때문이다.
  옵션만 지우고 인자를 남기면 `undefined` 가 전달되어 동작은 같지만 의도가 코드에 남지 않는다.
- 오류 메시지를 함께 고치는 이유는 없는 옵션을 권하는 안내가 사용자를 `unknown option` 으로 보내기 때문이다.
