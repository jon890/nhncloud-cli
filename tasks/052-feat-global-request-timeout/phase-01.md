# Phase 01 — api/timeout.ts 신설과 service client 상수 이관

**Execution profile**: standard
**Status**: pending

---

## 목표

요청 타임아웃 기본값을 `src/api/timeout.ts` 한 곳으로 모으고, service client 10개가 각자 선언하던 상수를 그 모듈에서 import 하게 바꾼다.
ADR-002 는 timeout 정책을 한 곳에서 통일한다고 정했으나 실제로는 상수가 10곳에 흩어져 있었고, logncrash 만 선언이 빠져 ky 기본값 10초로 동작했다(이슈 #67).

**범위 외**: 전역 옵션 정의와 `preAction` 주입은 Phase 2 다. `README.md` 와 `skills/` 갱신은 Phase 3 이다. ky 요청 옵션이 붙는 74개 호출 지점은 이 phase 에서 고치지 않는다.

---

## 실행 전제

```bash
# cwd: <repo root>
# branch: feat/052-global-request-timeout
set -e
test "$(git branch --show-current)" = "feat/052-global-request-timeout"
test ! -e src/api/timeout.ts
test "$(rg -c '^const (DEFAULT|SYNC)_TIMEOUT_MS' src/services/ | wc -l | tr -d ' ')" = "10"
```

---

## 배경 — 왜 호출 지점을 건드리지 않는가

`timeout: DEFAULT_TIMEOUT_MS` 는 ky 요청 옵션 객체 안에 있어 **요청이 일어나는 시점에 평가**된다.
따라서 식별자를 `export let` 으로 두면 값이 갱신된 뒤의 요청에 새 값이 반영된다.

이 저장소와 같은 조건(tsup · `format: cjs` · `target: node20`)에서 실측해 확인한 동작이다.

```
set 이전  binding=30000
set 이후  binding=90000
```

그래서 이 phase 는 **선언 10줄만 바꾸고 호출 74곳은 그대로 둔다**. 호출부를 함수 호출로 바꾸면 diff 만 커지고 얻는 것이 없다.

---

## 작업 항목 (4)

### 1. `src/api/timeout.ts` 신규 작성

의존이 없는 순수 상태 모듈로 둔다. `src/commands/` 를 import 하지 않는다 — `api/` 가 `commands/` 를 참조하면 레이어 역류이고 `docs/code-architecture.md` 의 "역류 금지" 를 어긴다.

담을 것은 네 가지다.

- `export let DEFAULT_TIMEOUT_MS = 30_000;` — 조회 기본 상한
- `export let SYNC_TIMEOUT_MS = 600_000;` — deploy 장시간 작업 상한
- `export function setRequestTimeoutMs(ms: number): void` — 두 값을 함께 갱신한다. `DEFAULT_TIMEOUT_MS = ms` 로 대체하고, `SYNC_TIMEOUT_MS = Math.max(ms, 600_000)` 로 **커지기만** 하게 한다.
- `export function getRequestTimeoutMs(): number` — 현재 조회 상한을 돌려준다. Phase 2 의 오류 메시지가 쓴다.

`600_000` 은 모듈 로컬 `const SYNC_FLOOR_MS` 로 두고 `SYNC_TIMEOUT_MS` 초기값과 `Math.max` 양쪽에서 참조한다. 같은 숫자를 두 번 적지 않는다.

`setRequestTimeoutMs` 가 `SYNC_TIMEOUT_MS` 를 낮추지 않는 이유를 1줄 주석으로 남긴다 — 낮추면 `--request-timeout 5` 같은 입력이 큰 파일 업로드를 끊는다 (ADR-026).

### 2. service client 10개의 상수 선언을 import 로 교체

각 파일에서 `const DEFAULT_TIMEOUT_MS = 30_000;` 선언과 그 위 JSDoc 주석을 지우고 `src/api/timeout.js` 에서 import 한다.
`timeout: DEFAULT_TIMEOUT_MS` 를 쓰는 **호출 지점은 한 글자도 바꾸지 않는다**.

| 파일 | 현재 선언 줄 |
|---|---|
| `src/services/blockstorage/client.ts` | 7 |
| `src/services/network/client.ts` | 7 |
| `src/services/ncr/harbor-client.ts` | 8 |
| `src/services/ncr/client.ts` | 10 |
| `src/services/logncrash/client.ts` | 16 |
| `src/services/loadbalancer/client.ts` | 21 |
| `src/services/instance/client.ts` | 22 |
| `src/services/nks/client.ts` | 26 |
| `src/services/deploy/client.ts` | 39·42 |
| `src/services/ncs/client.ts` | 43 |

줄 번호는 작성 시점 참고값이다. 편집 전에 `rg -n '^const (DEFAULT|SYNC)_TIMEOUT_MS' src/services/` 로 현재 위치를 다시 확인한다.

`src/services/deploy/client.ts` 만 두 상수를 쓴다 — `SYNC_TIMEOUT_MS` 도 함께 import 하고 자체 선언 두 줄을 모두 지운다.

import 경로는 각 파일 깊이에 맞춘다. `src/services/<svc>/client.ts` 는 `../../api/timeout.js`, `src/services/ncr/harbor-client.ts` 도 같다.

### 3. `src/api/timeout.test.ts` 추가

같은 디렉터리에 테스트를 둔다(`docs/code-architecture.md` 의 "대상 파일 옆 `*.test.ts`" 규칙).

검증할 것은 세 가지다.

- 기본값이 `30_000` 이고 `SYNC_TIMEOUT_MS` 가 `600_000` 이다.
- `setRequestTimeoutMs(120_000)` 후 `DEFAULT_TIMEOUT_MS` 가 `120_000` 이고 `SYNC_TIMEOUT_MS` 는 `600_000` 그대로다 (하한 아래로 안 내려감).
- `setRequestTimeoutMs(900_000)` 후 `SYNC_TIMEOUT_MS` 가 `900_000` 이다 (하한 위로는 따라 커짐).

테스트 사이 상태가 새지 않게 `afterEach` 에서 `setRequestTimeoutMs(30_000)` 로 되돌린다. 모듈 상태는 파일 간 공유되므로 복원하지 않으면 다른 테스트가 영향을 받는다.

### 4. 호출 지점 무변경 확인

`git diff` 에 `timeout:` 을 포함한 줄이 추가·삭제되지 않았는지 확인한다. 아래 검증 절의 명령이 이를 강제한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/api/timeout.ts` | 신규 |
| `src/api/timeout.test.ts` | 신규 |
| `src/services/{blockstorage,network,ncr,logncrash,loadbalancer,instance,nks,deploy,ncs}/client.ts` | 수정 (선언 → import) |
| `src/services/ncr/harbor-client.ts` | 수정 (선언 → import) |

## 검증

```bash
# cwd: <repo root>
# branch: feat/052-global-request-timeout
set -e

# 1. 자체 선언이 남지 않았다
test "$(rg -c '^const (DEFAULT|SYNC)_TIMEOUT_MS' src/services/ 2>/dev/null | wc -l | tr -d ' ')" = "0"

# 2. 10개 client 파일이 모두 timeout 모듈을 import 한다
test "$(rg -l 'from "\.\./\.\./api/timeout\.js"' src/services/ | wc -l | tr -d ' ')" = "10"

# 3. 호출 지점 74개가 그대로다 — timeout: 을 담은 줄의 추가·삭제가 0 이어야 한다
test "$(git diff -U0 -- src/services/ | grep -cE '^[+-][^+-].*timeout:')" = "0"

# 4. deploy 만 SYNC_TIMEOUT_MS 를 import 한다
test "$(rg -l 'SYNC_TIMEOUT_MS' src/services/ | wc -l | tr -d ' ')" = "1"

# 5. api/ 가 commands/ 를 참조하지 않는다 (레이어 역류 금지)
test "$(rg -c 'from "\.\./commands/' src/api/ 2>/dev/null | wc -l | tr -d ' ')" = "0"

# 6. 타입·테스트·빌드
pnpm tsc --noEmit 2>&1 | grep -c '^src/' | grep -qx 0
pnpm test
pnpm run build

# 7. 명령 카탈로그가 149개로 유지된다 (이 phase 는 명령 표면을 바꾸지 않는다)
test "$(node dist/index.js commands --json | python3 -c 'import json,sys;print(len(json.load(sys.stdin)["commands"]))')" = "149"

git diff --check
```

## 의도 메모 (왜)

- 상수를 한 곳에 모으는 것이 이 plan 의 본체다. 흩어져 있으면 이번처럼 한 곳이 빠져도 드러나지 않는다.
- `export let` 과 호출 시점 평가를 택한 이유는 client 생성자 10개와 팩토리 10개를 바꾸지 않고도 값을 흘릴 수 있기 때문이다. 대안(생성자 주입)은 요청 74곳까지 전달 경로가 늘어난다.
- `SYNC_TIMEOUT_MS` 를 `max` 로만 움직이는 이유는 낮추는 방향이 이득 없이 파괴적이기 때문이다 (ADR-026 대안 기각).
- 이 phase 가 Phase 2 의 주입 지점을 하나로 만들어 준다. 여기서 상수가 남으면 Phase 2 의 setter 가 일부 client 에 닿지 않는다.

## Blocked 조건

- `src/api/timeout.ts` 가 이미 존재하면 `PHASE_BLOCKED: 선행 변경 확인 필요` 를 보고하고 멈춘다.
