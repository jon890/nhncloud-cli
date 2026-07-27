# Phase 02 — 조회 명령과 이름·UUID 해석기

**Execution profile**: standard  
**Status**: pending

---

## 목표

Load Balancer와 IP ACL 그룹·대상 조회 명령을 Commander 트리에 등록한다.
사람과 AI 에이전트가 같은 명령을 안정적으로 자동화하도록 이름 또는 UUID 해석, stdout·stderr, JSON·quiet 출력을 명시적으로 고정한다.

**범위 외**: 쓰기 명령, 대화형 질문, target 삭제용 ID 해석은 후속 `041-2-feat-loadbalancer-ipacl-write`의 책임이다.

---

## 선행

- Phase 01의 `src/services/loadbalancer/client.ts`와 `types.ts`가 존재해야 한다.
- `docs/flow.md`의 “Load Balancer IP ACL 흐름”과 `docs/adr/022-loadbalancer-ipacl-safety.md`를 먼저 읽는다.
- 기존 IaaS command의 profile 해석, endpoint 조립, spinner 정리, formatter 패턴을 재사용한다.

---

## 작업 항목 (5)

### 1. `src/commands/loadbalancer/helpers.ts` — client 조립과 해석기

- command options에서 profile을 해석하고 network endpoint와 IaaS 토큰을 준비한 뒤 `LoadBalancerClient`를 생성한다.
- 입력을 trim하고 빈 문자열은 API 호출 전에 `EXIT_PARAM_ERROR`로 거부한다.
- Load Balancer와 IP ACL 그룹은 정확한 UUID가 있으면 우선 반환하고, 아니면 정확한 이름으로 조회한다.
- 이름이 없으면 찾지 못한 오류, 둘 이상이면 후보 UUID를 정렬해 포함한 중복 이름 오류를 반환한다.
- 해석 결과 ID가 빈 문자열이면 API 호출 전에 거부한다.

### 2. Load Balancer 조회 명령

`src/commands/loadbalancer/list.ts`와 `get.ts`를 만들고 아래를 등록한다.

- `loadbalancer list`
- `loadbalancer get <loadbalancer>`

`<loadbalancer>`는 이름 또는 UUID다.
list table 열은 `id`, `name`, `vip_address`, `provisioning_status`, `operating_status`, `ipacl_group_action` 순서로 고정한다.
get table은 field/value 형식을 사용한다.

### 3. IP ACL 그룹 조회 명령

`src/commands/loadbalancer/ipacl.ts`에 아래를 등록한다.

- `loadbalancer ipacl list`
- `loadbalancer ipacl get <group>`

`<group>`은 이름 또는 UUID다.
list table 열은 `id`, `name`, `action`, `ipacl_target_count`, `loadbalancer_count` 순서로 고정한다.
연결 목록 길이에서 `loadbalancer_count`를 계산한다.

### 4. IP ACL 대상 조회 명령

`src/commands/loadbalancer/target.ts`에 아래를 등록한다.

- `loadbalancer ipacl target list <group>`

그룹은 이름 또는 UUID로 해석한다.
table 열은 `id`, `cidr_address`, `description`, `ipacl_group_id` 순서로 고정한다.

### 5. 등록·출력·명령 테스트

`src/index.ts`에 `loadbalancer` 명령군을 등록한다.
각 명령은 입력 검증 후 spinner를 시작하고 `try/catch/finally`로 stderr 상태를 정리한다.

- `--json`: API 의미를 보존한 JSON만 stdout에 출력한다.
- `--quiet`: list는 각 리소스 ID를 한 줄씩, get은 해당 리소스 ID 하나를 stdout에 출력한다.
- table과 JSON도 stdout만 사용하고 spinner·경고·오류는 stderr만 사용한다.
- 정상 결과가 없는 경우에도 진단 문자열을 stdout에 섞지 않는다.

command 테스트는 옵션 파싱, 이름·UUID·중복 이름, 빈 입력 선검증, formatter 호출, stdout·stderr 분리를 고정한다.
phase 완료 시 Phase 2를 `completed`, `current_phase`를 `3`으로 갱신한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/commands/loadbalancer/helpers.ts` | 신규 |
| `src/commands/loadbalancer/list.ts` | 신규 |
| `src/commands/loadbalancer/get.ts` | 신규 |
| `src/commands/loadbalancer/ipacl.ts` | 신규 |
| `src/commands/loadbalancer/target.ts` | 신규 |
| `src/commands/loadbalancer/*.test.ts` | 신규 |
| `src/index.ts` | 명령군 등록 |
| `tasks/041-feat-loadbalancer-ipacl-read/index.json` | 상태 갱신 |

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm test -- src/commands/loadbalancer
pnpm run build
node dist/index.js loadbalancer --help
node dist/index.js loadbalancer ipacl target list --help
```

성공 기준:

- 모든 명령 종료 코드가 0이다.
- help에 `list`, `get`, `ipacl`, `target`, `<group>`, `--json`, `--quiet`가 해당 경로별로 나타난다.
- 현재 133개 catalog 항목에 이 plan의 8개 노드가 더해져 `commands --json` 항목 수가 141이다.

## 의도 메모

- 명령 입력과 출력의 안정성이 AI 에이전트 자동화 계약이므로 대화형 질문을 도입하지 않는다.
- 데이터와 진단을 stream으로 분리하면 agent가 stdout을 바로 파싱하고 stderr를 관찰 정보로 다룰 수 있다.
- 이름 중복을 임의 선택하지 않아 자동화가 다른 리소스를 조작할 위험을 막는다.

## Blocked 조건

- Phase 01 client가 없으면 `PHASE_BLOCKED: Phase 01 LoadBalancerClient 필요`를 보고한다.
- 기존 formatter로 출력 계약을 만들 수 없으면 새 공통 추상화를 추가하지 말고 `PHASE_BLOCKED: formatter 경계 검토 필요`를 보고한다.
