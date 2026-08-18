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

## 작업 항목 (4)

### 1. `src/commands/ncr/helpers.ts` — 해석 함수에서 override 인자를 없앤다

```ts
export async function resolveAppKey(profileName: string): Promise<string>
```

세 지점을 함께 고친다. 실측한 행 번호다.

- **시그니처** — 두 번째 매개변수 `appKeyOpt?: string` 과 첫 줄의 `if (appKeyOpt) return appKeyOpt;` 를 지운다.
  함수 본문의 profile 조회 경로는 그대로 둔다.
- **JSDoc 23행** — `우선순위: --app-key 옵션 > profile 의 ncr.appkey.` 줄을 지운다.
  선례인 `src/commands/apigateway/helpers.ts:115` 는 `profile 의 apigateway.appkey에서 appKey를 해석한다.` 한 줄만 둔다. 그 형태에 맞춘다.
- **오류 메시지 46행** — `--app-key` 안내를 없앤다. 현재 문구가 이렇다.

```
NCR appKey 가 없습니다. --app-key 옵션으로 지정하거나
nhncloud configure --ncr-appkey <key> 를 실행해 설정하세요.
```

`configure` 안내만 남긴다. 없는 옵션을 권하면 사용자가 `unknown option` 을 만난다.

### 2. 호출부 3곳에서 인자를 뺀다

`grep -rn "resolveAppKey(" src/commands/ncr/` 로 확인한 위치다.

| 파일 | 행 | 함께 고칠 것 |
|---|---|---|
| `src/commands/ncr/get.ts` | 34 | — |
| `src/commands/ncr/list.ts` | 23 | — |
| `src/commands/ncr/helpers.ts` | 66 | 바로 위 63행 `createHarborClient` 의 `opts: { profile?: string; region?: string; appKey?: string }` 에서 `appKey?: string` 을 함께 지운다 |

`resolveAppKey(profileName, opts.appKey)` 를 `resolveAppKey(profileName)` 로 바꾼다.

`createHarborClient` 의 opts 타입은 인터페이스 선언이 아니라 인라인 타입이라 항목 3 의 grep 에는 안 잡힌다.
여기서 함께 지우지 않으면 죽은 필드가 남는다.

### 3. 옵션 정의와 인터페이스 필드를 지운다

`ncr` 의 `.option("--app-key ...")` 는 4곳이다. 파일당 1개다.

| 파일 | 옵션 | `appKey?: string` 필드 |
|---|---|---|
| `src/commands/ncr/get.ts` | 1 | 1 |
| `src/commands/ncr/list.ts` | 1 | 1 |
| `src/commands/ncr/images.ts` | 1 | 1 |
| `src/commands/ncr/tags.ts` | 1 | 1 |
| `src/commands/ncr/helpers.ts` | 0 | 1 (항목 2 의 `createHarborClient`) |

착수 전에 실제 수를 확인한다.

```bash
# cwd: <worktree root>
grep -rc '\.option("--app-key' src/commands/ncr/*.ts | grep -v ':0'
grep -rc 'appKey?: string' src/commands/ncr/*.ts | grep -v ':0'
```

수가 위 표와 다르면 멈추고 보고한다 — 그사이 다른 변경이 들어온 것이다.

필드만 남기면 `tsc` 는 통과하지만 죽은 코드가 된다.

### 4. 옵션 재발을 막는 회귀 테스트를 추가한다

새 파일 `src/commands/ncr/commands.test.ts` 를 만든다.

선례가 `src/commands/apigateway/commands.test.ts:104` 다.
같은 파일 64행의 지역 함수 `collectAppKeyOptionPaths(command, parentPath)` 가 Commander 트리를 재귀 순회해
`option.long === "--app-key"` 인 경로를 모으고, 테스트가 `[]` 를 단언한다.

grep 검증은 phase 실행 시점에만 돌아 CI 에서 재발을 막지 못한다.
`appkey 는 profile 로만` 이 이번 변경의 핵심 계약이라 코드로 고정한다.

대상 트리는 `src/index.ts:43-46` 등록 기준의 최상위 명령 4개다.

- `listCommand` (`./list.js`)
- `getCommand` (`./get.js`)
- `imagesCommand` (`./images.js`)
- `tagsCommand` (`./tags.js`)

**헬퍼는 복제한다.** `collectAppKeyOptionPaths` 는 apigateway 테스트의 export 되지 않은 지역 함수이고,
저장소에 공용 테스트 유틸 디렉터리가 없다. 지금 추출하면 apigateway 테스트까지 편집 범위가 번진다.
복제한 헬퍼 위에 주석 한 줄을 남긴다.

```ts
// 3곳째 복제다. 4곳째에는 공용 테스트 유틸로 추출한다.
```

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/commands/ncr/helpers.ts` | 수정 — 시그니처, JSDoc 23행, 오류 메시지 46행, 호출부 66행, `createHarborClient` opts 필드 |
| `src/commands/ncr/get.ts` | 수정 — 옵션·필드·호출부 |
| `src/commands/ncr/list.ts` | 수정 — 옵션·필드·호출부 |
| `src/commands/ncr/images.ts` | 수정 — 옵션·필드 |
| `src/commands/ncr/tags.ts` | 수정 — 옵션·필드 |
| `src/commands/ncr/commands.test.ts` | **신규** — `--app-key` 미노출 회귀 테스트 |

`src/commands/ncr/helpers.test.ts` 는 손대지 않는다.
`resolveAppKey`·`appKey` 참조가 0건이라 이번 변경의 영향을 받지 않는다.

## 검증

```bash
# cwd: <worktree root>
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run
./node_modules/.bin/tsup
```

worktree 에서 `pnpm` 은 `ERR_PNPM_IGNORED_BUILDS`(esbuild)로 막히므로 바이너리를 직접 실행한다.

추가 기준이다.

```bash
# cwd: <worktree root>
# ncr 에 --app-key 가 남지 않았는지 — 출력이 없어야 한다
# 변경 전 6건 (옵션 4 + JSDoc 1 + 오류 메시지 1)
grep -rn '\-\-app-key' src/commands/ncr/*.ts | grep -v 'commands.test.ts' || true

# 해석 함수가 인자 하나만 받는지 — 1 이 나와야 한다
grep -c 'resolveAppKey(profileName: string): Promise<string>' src/commands/ncr/helpers.ts || true

# 죽은 필드가 남지 않았는지 — 출력이 없어야 한다 (변경 전 5건)
grep -rn 'appKey?: string' src/commands/ncr/ || true
```

서명 grep 이 0 이면 포매터가 줄을 나눈 것일 수 있다. 그때는 실제 서명 형태를 눈으로 확인하고 넘어간다.

신규 회귀 테스트를 넣었으므로 테스트 수가 기준값보다 늘어난다.
기준은 45 파일 581건이고, 완료 시점은 46 파일 582건 이상이어야 한다.

명령 카탈로그 수가 바뀌지 않아야 한다. 옵션 제거이지 명령 제거가 아니다.
빌드가 선행돼야 `dist/index.js` 가 갱신된 트리를 반영한다.

```bash
# cwd: <worktree root>
./node_modules/.bin/tsup && node dist/index.js commands --json | jq '.commands | length'
```

**170** 이어야 한다.

`node dist/index.js ncr list --help` 에 `--app-key` 가 없고 `--profile` 은 남아 있는지 확인한다.

## 의도 메모 (왜)

- 해석 함수의 인자를 먼저 없애는 이유는 그것이 유일한 사용처이기 때문이다.
  옵션만 지우고 인자를 남기면 `undefined` 가 전달되어 동작은 같지만 의도가 코드에 남지 않는다.
- 오류 메시지를 함께 고치는 이유는 없는 옵션을 권하는 안내가 사용자를 `unknown option` 으로 보내기 때문이다.
- 회귀 테스트를 넣는 이유는 grep 이 실행 시점에만 돌기 때문이다.
  옵션이 나중에 되살아나도 CI 가 잡지 못하면 이 변경의 계약이 조용히 깨진다.
