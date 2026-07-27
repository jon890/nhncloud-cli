# Phase 02 — 그룹 생성·삭제와 연결 명령

**Execution profile**: standard
**Status**: pending

---

## 목표

IP ACL 그룹 생성·삭제와 Load Balancer 연결·해제 명령을 비대화형으로 구현한다.
위험한 변경은 `--yes`가 없으면 credential·token·API 접근 전에 실패하도록 고정한다.

**범위 외**: IP ACL 대상 변경과 자동 재바인딩은 Phase 03의 책임이다.

---

## 선행

- Phase 01의 쓰기 client가 존재해야 한다.
- `docs/flow.md`와 `docs/adr/022-loadbalancer-ipacl-safety.md`의 명령·안전 계약을 따른다.
- Phase 01에서 확정한 공식 payload 이름을 그대로 사용한다.

---

## 작업 항목 (5)

### 1. 순수 입력 검증 helper

`src/commands/loadbalancer/helpers.ts`에 API 접근 없이 테스트할 수 있는 검증 함수를 추가한다.

- `action`은 대소문자를 임의 보정하지 않고 `ALLOW` 또는 `DENY`만 허용한다.
- 이름·설명은 기존 CLI 정책에 맞게 trim하고 필수 이름의 빈 문자열을 거부한다.
- `requireYes`는 `--yes`가 없으면 `EXIT_PARAM_ERROR`를 내고 다른 side effect를 시작하지 않는다.
- 반복 `--group`을 배열로 수집하고 한 개 이상인지 검사한다.

### 2. 그룹 생성·삭제

`src/commands/loadbalancer/ipacl.ts`에 아래를 추가한다.

- `loadbalancer ipacl create --name <name> --action <ALLOW|DENY> [--description <text>]`
- `loadbalancer ipacl delete <group> --yes`

delete는 이름 또는 UUID를 해석한다.
연결 대상과 규칙의 연쇄 삭제 가능성을 stderr에 경고하되 prompt를 열지 않는다.
`--yes` 누락은 group 해석과 인증 전에 실패한다.

### 3. `set-ipacl`

`src/commands/loadbalancer/binding.ts`에 아래를 추가한다.

- `loadbalancer set-ipacl <loadbalancer> --group <group> [--group <group>...] --yes`

Load Balancer와 그룹을 이름 또는 UUID로 해석한다.
해석된 그룹 ID 중복을 API 호출 전에 거부한다.
모든 그룹의 `action`이 같은지 확인한 뒤 현재 연결을 입력 목록으로 완전 대체한다.
그룹을 한 개 이상 요구하므로 빈 배열을 전송할 수 없다.

### 4. `clear-ipacl`

같은 파일에 아래를 추가한다.

- `loadbalancer clear-ipacl <loadbalancer> --yes`

이 명령만 빈 그룹 배열을 보내 연결을 해제한다.
`--yes` 누락은 Load Balancer 해석과 인증 전에 실패한다.

### 5. 등록·결과·테스트

성공 결과는 stdout에 구조화하고 spinner·경고·오류는 stderr에만 쓴다.

- `--json`: `operation`, `status`, 주 리소스 ID, 적용된 `ipacl_group_ids`를 포함한 객체.
- `--quiet`: create/delete는 그룹 ID, set/clear는 Load Balancer ID 한 줄.
- 기본 table: 같은 의미 필드를 사람이 읽을 수 있게 표시.

command 테스트는 `--yes` 선검증, action·빈 입력·중복 ID·action 불일치, set과 clear payload 차이, 이름 중복 후보, stdout·stderr 분리를 검증한다.
phase 완료 시 Phase 2를 `completed`, `current_phase`를 `3`으로 갱신한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/commands/loadbalancer/helpers.ts` | 쓰기 입력 검증 확장 |
| `src/commands/loadbalancer/ipacl.ts` | create·delete 추가 |
| `src/commands/loadbalancer/binding.ts` | 신규 |
| `src/commands/loadbalancer/*.test.ts` | 쓰기 명령 테스트 |
| `src/index.ts` | 쓰기 명령 등록 |
| `tasks/041-2-feat-loadbalancer-ipacl-write/index.json` | 상태 갱신 |

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm test -- src/commands/loadbalancer
pnpm run build
node dist/index.js loadbalancer ipacl create --help
node dist/index.js loadbalancer set-ipacl --help
node dist/index.js loadbalancer clear-ipacl --help
```

성공 기준:

- 모든 명령 종료 코드가 0이다.
- help에 확정 옵션과 위치 인자가 나타난다.
- `--yes` 누락 테스트에서 token resolver와 client가 호출되지 않는다.

## 의도 메모

- `set-ipacl`과 `clear-ipacl`을 분리해 빈 목록의 의미를 agent가 추론하지 않게 한다.
- 확인 prompt를 사용하지 않아 headless agent도 입력 대기 없이 성공 또는 명확한 오류로 종료한다.
- 이름 중복과 action 불일치는 임의 선택이나 server 오류에 맡기지 않는다.

## Blocked 조건

- Phase 01 쓰기 메서드가 없으면 `PHASE_BLOCKED: Phase 01 쓰기 client 필요`를 보고한다.
