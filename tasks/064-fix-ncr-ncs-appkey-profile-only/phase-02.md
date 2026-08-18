# Phase 02 — ncs 의 --app-key 제거

**Execution profile**: standard

---

## 목표

`ncs` 명령에서 `--app-key` 오버라이딩을 없애고 appkey 를 profile 로만 해석한다.
phase-01 이 `ncr` 에서 한 것과 같은 변경이며, 옵션 정의가 25곳으로 더 많다.

**범위 외**: `ncr` 은 phase-01 이 이미 처리했다. 공개 문서는 phase-03 이 맡는다.
`deploy` 는 이 plan 에서 다루지 않는다 — 별도 plan(065)이 처리한다.

이 phase 는 phase-01 이 정한 형태를 따른다. 해석 함수 이름만 다르다.

---

## 작업 항목 (4)

### 1. `src/commands/ncs/helpers.ts` — 해석 함수에서 override 인자를 없앤다

```ts
export async function resolveNcsAppKey(profileName: string): Promise<string>
```

네 지점을 함께 고친다. 실측한 행 번호다.

- **시그니처** — 두 번째 매개변수 `appKeyOpt?: string` 과 `if (appKeyOpt) return appKeyOpt;` 를 지운다.
- **JSDoc 167행** — `우선순위: --app-key 옵션 > profile 의 ncs.appkey.` 줄을 지운다.
- **JSDoc 172행** — `(또는 `--ncs-appkey`) 실행 또는 --app-key 직접 지정을 안내한다.` 에서 `--app-key` 부분을 걷어낸다.
  선례인 `src/commands/apigateway/helpers.ts:115` 처럼 한 줄로 줄이는 편이 낫다.
- **오류 메시지 194-195행** — 두 줄이 한 문장이라 함께 다시 쓴다. 현재 문구가 이렇다.

```
NCS appKey 가 없습니다. nhncloud configure (또는 --ncs-appkey) 로 설정하거나
--app-key 로 직접 넘기세요.
```

apigateway 선례(`API Gateway appKey가 없습니다. nhncloud configure --apigateway-appkey <key>로 설정하세요.`)에 맞춰 이 형태로 바꾼다.

```
NCS appKey 가 없습니다. nhncloud configure --ncs-appkey <key> 를 실행해 설정하세요.
```

### 2. 호출부에서 인자를 뺀다

`ncs` 는 호출부가 `src/commands/ncs/helpers.ts:215` (`resolveNcsClient` 안) 한 곳뿐이다.
같은 함수의 opts 타입에 있는 `appKey?: string` 도 함께 지운다.

착수 전에 확인한다.

```bash
# cwd: <worktree root>
grep -rn "resolveNcsAppKey(" src/
```

`helpers.ts` 밖에서 부르는 곳이 나오면 함께 고친다.

### 3. 옵션 정의와 인터페이스 필드를 지운다

**공용 옵션 추가 함수는 없다.** 25곳 모두 개별 `.option(...)` 정의다.
`grep -rn 'function add\|Options(cmd\|applyCommon' src/commands/ncs/` 가 0건이다.
한 곳을 고쳐 여러 명령을 정리하는 경로는 존재하지 않으니 개별 편집으로 간다.

실측한 분포다.

| 파일 | 옵션 정의 | `appKey?: string` 필드 |
|---|---|---|
| `src/commands/ncs/workload.ts` | 14 | 9 |
| `src/commands/ncs/template.ts` | 8 | 7 |
| `src/commands/ncs/malware.ts` | 3 | 3 |
| `src/commands/ncs/helpers.ts` | 0 | 1 (항목 2 의 `resolveNcsClient`) |

**옵션 수와 필드 수가 다르다.** 인터페이스 하나를 여러 명령이 공유하기 때문이다.
옵션 25 에 필드 25 를 기대하고 대조하면 빠뜨린 것으로 오판한다.

착수 전에 각 파일의 수를 확인한다.

```bash
# cwd: <worktree root>
grep -rc '\.option("--app-key' src/commands/ncs/*.ts | grep -v ':0'
grep -rc 'appKey?: string' src/commands/ncs/*.ts | grep -v ':0'
```

수가 위 표와 다르면 멈추고 보고한다 — 그사이 다른 변경이 들어온 것이다.

### 4. 옵션 재발을 막는 회귀 테스트를 추가한다

새 파일 `src/commands/ncs/commands.test.ts` 를 만든다.
형태와 근거는 phase-01 항목 4 와 같다. 선례는 `src/commands/apigateway/commands.test.ts:64,104` 다.

대상 트리는 `src/index.ts:52-54` 등록 기준의 부모 명령 3개다.

- `templateCommand` (`./template.js`)
- `workloadCommand` (`./workload.js`)
- `malwareCommand` (`./malware.js`)

헬퍼 `collectAppKeyOptionPaths` 는 phase-01 과 마찬가지로 복제하고, 같은 주석을 남긴다.

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/commands/ncs/helpers.ts` | 수정 — 시그니처, JSDoc 167·172행, 오류 메시지 194-195행, 호출부 215행, `resolveNcsClient` opts 필드 |
| `src/commands/ncs/workload.ts` | 수정 — 옵션 14·필드 9 |
| `src/commands/ncs/template.ts` | 수정 — 옵션 8·필드 7 |
| `src/commands/ncs/malware.ts` | 수정 — 옵션 3·필드 3 |
| `src/commands/ncs/commands.test.ts` | **신규** — `--app-key` 미노출 회귀 테스트 |

`src/commands/ncs/{helpers,malware,workload}.test.ts` 는 손대지 않는다.
`resolveNcsAppKey`·`appKey` 참조가 0건이다.

## 검증

```bash
# cwd: <worktree root>
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run
./node_modules/.bin/tsup
```

추가 기준이다.

```bash
# cwd: <worktree root>
# ncs 에 --app-key 가 남지 않았는지 — 출력이 없어야 한다
# 변경 전 28건 (옵션 25 + JSDoc 2 + 오류 메시지 1)
grep -rn '\-\-app-key' src/commands/ncs/*.ts | grep -v 'commands.test.ts' || true

# 해석 함수가 인자 하나만 받는지 — 1 이 나와야 한다
grep -c 'resolveNcsAppKey(profileName: string): Promise<string>' src/commands/ncs/helpers.ts || true

# 죽은 필드가 남지 않았는지 — 출력이 없어야 한다 (변경 전 20건)
grep -rn 'appKey?: string' src/commands/ncs/ || true

# 저장소 전체 — 아래 목록만 남아야 한다
grep -rl '\-\-app-key' src/ || true
```

마지막 검사에서 남아야 하는 것은 셋뿐이다.

- `src/commands/deploy/` 8개 파일 — 이 plan 의 범위 밖이고 옵션이 아직 살아 있다.
- `src/commands/commands.test.ts` — 카탈로그 수집기 테스트가 자체로 만든 가짜 Command 픽스처다.
  20-23행이 `new Command("images").option("--app-key <key>", "NCR appKey")` 로 트리를 직접 조립하고
  58행이 그 수집 결과를 단언한다. `src/commands/ncr/images.ts` 를 import 하지 않아 실제 명령과 결합이 없다.
  이름이 `ncr` 라 헷갈릴 뿐 이번 변경과 무관하니 **손대지 않는다.**
- `src/commands/apigateway/commands.test.ts` 와 이번에 만든 `ncr`·`ncs` 의 `commands.test.ts` —
  옵션 부재를 단언하는 회귀 테스트라 문자열이 남는 것이 정상이다.

`ncr`·`ncs` 의 명령 구현 파일이 나오면 빠뜨린 것이다.

신규 회귀 테스트 2개를 넣었으므로 완료 시점 테스트 수는 47 파일 583건 이상이어야 한다.
기준은 45 파일 581건이다.

명령 카탈로그는 **170** 이어야 한다. 빌드가 선행돼야 한다.

```bash
# cwd: <worktree root>
./node_modules/.bin/tsup && node dist/index.js commands --json | jq '.commands | length'
```

`node dist/index.js ncs workload list --help` 에 `--app-key` 가 없고 `--profile` 은 남아 있는지 확인한다.

## 의도 메모 (왜)

- 파일별 개수를 계획에 적고 다르면 멈추라고 한 이유는 그 차이가 다른 변경이 들어왔다는 신호이기 때문이다.
  조용히 진행하면 남의 변경을 지운다.
- 옵션 수와 필드 수를 따로 적은 이유는 둘이 1:1 이 아니기 때문이다.
  인터페이스를 여러 명령이 공유해 필드가 더 적다.

## Blocked 조건

- `src/commands/ncr/helpers.ts` 의 `resolveAppKey` 가 아직 두 인자를 받으면
  `PHASE_BLOCKED: phase-01 미완료` 를 출력하고 종료한다.
