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

## 작업 항목 (3)

### 1. `src/commands/ncs/helpers.ts` — 해석 함수에서 override 인자를 없앤다

```ts
export async function resolveNcsAppKey(profileName: string): Promise<string>
```

- 두 번째 매개변수와 `if (appKeyOpt) return appKeyOpt;` 를 지운다.
- 오류 메시지에서 `--app-key` 안내를 없앤다. 현재 문구가 이렇다.

```
NCS appKey 가 없습니다. nhncloud configure (또는 --ncs-appkey) 로 설정하거나
--app-key 로 직접 넘기세요.
```

`configure` 안내만 남긴다.

### 2. 호출부에서 인자를 뺀다

`ncs` 는 호출부가 `src/commands/ncs/helpers.ts` 한 곳에 모여 있다.
`grep -rn "resolveNcsAppKey(" src/` 로 확인한 뒤 인자를 뺀다.
다른 파일에서 부르는 곳이 나오면 함께 고친다.

### 3. 옵션 정의와 인터페이스 필드를 지운다

`ncs` 의 `.option("--app-key ...")` 는 25곳이고 파일별로 이렇게 나뉜다.

| 파일 | 옵션 정의 |
|---|---|
| `src/commands/ncs/workload.ts` | 14 |
| `src/commands/ncs/template.ts` | 8 |
| `src/commands/ncs/malware.ts` | 3 |

`grep -c '\.option("--app-key' src/commands/ncs/<파일>` 로 각 파일의 수를 먼저 확인한다.
수가 위 표와 다르면 멈추고 보고한다 — 그 사이 다른 변경이 들어온 것이다.

각 명령의 옵션 인터페이스에 있는 `appKey?: string;` 필드도 함께 지운다.

**공용 옵션 추가 함수가 있으면 그쪽을 먼저 고친다.**
`grep -rn "addNcsOptions\|function add.*Options" src/commands/ncs/` 로 확인한다.
있으면 한 곳 수정으로 여러 명령이 정리되므로 개별 파일을 손대기 전에 본다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/commands/ncs/helpers.ts` | 수정 — 해석 함수 시그니처, 오류 메시지, 호출부 |
| `src/commands/ncs/workload.ts` | 수정 — 옵션·필드 |
| `src/commands/ncs/template.ts` | 수정 — 옵션·필드 |
| `src/commands/ncs/malware.ts` | 수정 — 옵션·필드 |
| `src/commands/ncs/*.test.ts` | 수정 — `--app-key` 를 쓰는 테스트가 있으면 정리 |

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
# ncs 에 --app-key 가 남지 않았는지 — 출력이 없어야 한다 (변경 전 26건, 옵션 25 + 메시지 1)
grep -rn '\-\-app-key' src/commands/ncs/ || true

# 해석 함수가 인자 하나만 받는지 — 1 이 나와야 한다
grep -c 'resolveNcsAppKey(profileName: string): Promise<string>' src/commands/ncs/helpers.ts || true

# 죽은 필드가 남지 않았는지 — 출력이 없어야 한다
grep -rn 'appKey?: string' src/commands/ncs/ || true

# 저장소 전체에서 deploy 만 남아야 한다 — deploy 경로만 나와야 한다
grep -rln '\-\-app-key' src/ || true
```

마지막 검사에서 `src/commands/deploy/` 와 테스트 파일만 나와야 한다.
`ncr`·`ncs` 경로가 나오면 빠뜨린 것이다.

명령 카탈로그는 **170** 이어야 한다.

```bash
# cwd: <repo root>
node dist/index.js commands --json | jq '.commands | length'
```

`ncs workload list --help` 에 `--app-key` 가 없고 `--profile` 은 남아 있는지 확인한다.

## 의도 메모 (왜)

- 공용 옵션 함수를 먼저 확인하는 이유는 25곳을 개별로 고치다 일부를 빠뜨리는 것보다 한 곳을 고치는 편이 안전하기 때문이다.
- 파일별 개수를 계획에 적고 다르면 멈추라고 한 이유는 그 차이가 다른 변경이 들어왔다는 신호이기 때문이다. 조용히 진행하면 남의 변경을 지운다.

## Blocked 조건

- `src/commands/ncr/helpers.ts` 의 `resolveAppKey` 가 아직 두 인자를 받으면
  `PHASE_BLOCKED: phase-01 미완료` 를 출력하고 종료한다.
