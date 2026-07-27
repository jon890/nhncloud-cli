# Phase 03 — 대상 변경과 자동 재바인딩 복구 계약

**Execution profile**: deep
**Status**: pending

---

## 목표

IP ACL 대상 추가·삭제 후 연결된 모든 Load Balancer를 기본으로 재바인딩한다.
일부 재바인딩이 실패해도 나머지를 계속 시도하고, AI 에이전트가 재시도할 수 있는 구조화 결과와 비정상 종료 코드를 함께 제공한다.

**범위 외**: 실패한 target 변경의 자동 rollback과 실제 cloud 쓰기 smoke는 수행하지 않는다.

---

## 확정 알고리즘

1. `--yes`와 target 입력을 credential 접근 전에 검증한다.
2. add는 그룹을 이름 또는 UUID로 해석하고, remove는 target ID로 단건 조회해 소속 그룹을 확인한다.
3. 그룹에 연결된 Load Balancer를 찾고 각 Load Balancer의 그룹 ID 목록을 변경 전에 snapshot한다.
4. snapshot 하나라도 실패하면 target을 변경하지 않고 종료한다.
5. target을 한 번 추가 또는 삭제한다.
6. `--no-rebind`가 아니면 snapshot의 각 Load Balancer에 같은 그룹 ID 목록을 순차 재전송한다.
7. 한 재바인딩이 실패해도 나머지를 계속 시도한다.
8. target 변경을 rollback하지 않고 성공·실패·복구 명령을 결과로 반환한다.

---

## 작업 항목 (5)

### 1. target 명령

`src/commands/loadbalancer/target.ts`에 아래를 추가한다.

- `loadbalancer ipacl target add <group> --cidr <ip-or-cidr> [--description <text>] [--no-rebind] --yes`
- `loadbalancer ipacl target remove <target-id> [--no-rebind] --yes`

remove는 이름 해석을 하지 않고 target ID만 받는다.
두 명령 모두 prompt를 열지 않으며 `--yes` 누락은 인증 전에 실패한다.
`opts` 추출 직후 add는 `confirmedYes`, `parsedGroup`, `parsedCidr`, `parsedDescription`을,
remove는 `confirmedYes`, `parsedTargetId`를 먼저 만들고 검증된 변수만 resolver·spinner·client에 전달한다.

### 2. `src/commands/loadbalancer/rebind.ts` — snapshot과 재바인딩

재바인딩 orchestration을 command client 조립과 분리해 모의 client로 단위 테스트할 수 있게 한다.

- target 변경 전에 관련 Load Balancer의 `{ loadbalancer_id, ipacl_group_ids }`를 모두 수집한다.
- snapshot 순서를 Load Balancer ID 기준으로 정렬해 결과를 결정적으로 만든다.
- 재바인딩은 순차 실행하며 각 오류를 해당 Load Balancer 결과에 보존한다.
- 실패 후 다음 Load Balancer 호출이 계속되는지 테스트할 수 있는 반환형을 사용한다.
- 자동 rollback은 구현하지 않는다.

### 3. 구조화 결과와 종료 코드

`--json` 결과는 최소 아래 계약을 지킨다.

```json
{
  "operation": "ipacl-target-add",
  "status": "partial",
  "target": {
    "id": "<target-id>",
    "ipacl_group_id": "<group-id>"
  },
  "rebind": {
    "skipped": false,
    "succeeded": [
      {
        "loadbalancer_id": "<loadbalancer-id>",
        "ipacl_group_ids": ["<group-id>"]
      }
    ],
    "failed": [
      {
        "loadbalancer_id": "<loadbalancer-id>",
        "ipacl_group_ids": ["<group-id>"],
        "error": "<message>",
        "retry_argv": [
          "nhncloud",
          "loadbalancer",
          "set-ipacl",
          "<loadbalancer-id>",
          "--group",
          "<group-id>",
          "--yes",
          "--json"
        ],
        "retry_command": "nhncloud loadbalancer set-ipacl '<loadbalancer-id>' --group '<group-id>' --yes --json"
      }
    ]
  }
}
```

- `operation`: add는 `ipacl-target-add`, remove는 `ipacl-target-remove`.
- `status`: 재바인딩 실패가 없으면 `succeeded`, 하나라도 있으면 `partial`.
- `retry_argv`: snapshot의 그룹 ID를 모두 반복 `--group`으로 넣은 비대화형 argv 배열이며 AI 에이전트용 canonical 복구 계약이다.
- `retry_command`: 같은 argv를 POSIX 단일 인용 helper로 안전하게 표시한 사람이 복사 가능한 명령이다.
  외부 문자열을 이어 붙이지 않고 작은따옴표는 `'"'"'` 형태로 이스케이프한다.
- partial에서도 JSON을 stdout에 먼저 출력하고 `process.exitCode = EXIT_API_ERROR`로 설정한다.
- stderr에는 부분 실패 요약과 복구 필요성을 출력한다.
- `--quiet`은 target ID를 stdout에 출력하며 partial이면 같은 비정상 종료 코드와 stderr 복구 정보를 유지한다.

### 4. 생략·전파 경고

- `--no-rebind`면 `rebind.skipped: true`로 반환하고 데이터 영역에 규칙이 즉시 반영되지 않을 수 있음을 stderr에 경고한다.
- 대상 변경 후에는 실측된 반영 지연 10–20초를 stderr에 안내한다.
- `ALLOW` 그룹 대상에는 Load Balancer가 속한 VPC의 private CIDR을 사용해야 한다는 운영 조건을 stderr에 안내한다.
- 경고를 stdout 데이터에 섞지 않는다.

### 5. 단위·명령 테스트

모의 client로 아래를 고정한다.

- add/remove의 `--yes` 선검증과 target ID 전용 remove.
- invalid CIDR·빈 group/target ID·`--yes` 누락에서 client resolver, 리소스 resolver, client method, spinner 호출 0회.
- snapshot 실패 시 target 변경 호출 0회.
- snapshot 완료 후 target 변경 1회.
- 중간 재바인딩 실패 뒤 후속 Load Balancer 호출 계속.
- partial JSON schema, `retry_argv`, shell-safe `retry_command`, stdout 출력 후 `EXIT_API_ERROR`.
- `--no-rebind`, quiet, 경고 stream.
- 자동 rollback 호출 부재.
- 공백·작은따옴표가 포함된 모의 ID와 control char가 포함된 오류 메시지로 argv 보존, command 인용, stderr terminal sanitize를 검증한다.
- 기존 leaf help 회귀 테스트에 `ipacl target add/remove`를 추가하고 전역 `--json`·`--quiet`, 지역 `--region`·`--profile`, `--yes`·`--no-rebind` 노출을 검증한다.

executor는 실제 NHN Cloud 쓰기 API를 호출하거나 credential을 사용하지 않는다.
phase 완료 시 Phase 3을 `completed`, `current_phase`를 `4`로 갱신한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/commands/loadbalancer/target.ts` | add·remove 확장 |
| `src/commands/loadbalancer/rebind.ts` | 신규 |
| `src/commands/loadbalancer/target.test.ts` | 대상 명령 테스트 |
| `src/commands/loadbalancer/rebind.test.ts` | 부분 실패 알고리즘 테스트 |
| `tasks/041-2-feat-loadbalancer-ipacl-write/index.json` | 상태 갱신 |

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm test -- src/commands/loadbalancer/target.test.ts src/commands/loadbalancer/rebind.test.ts
pnpm run build
node dist/index.js loadbalancer ipacl target add --help
node dist/index.js loadbalancer ipacl target remove --help
```

성공 기준:

- 타입 검사·테스트·build가 종료 코드 0이다.
- 테스트가 partial 결과와 후속 재바인딩 지속을 검증한다.
- 테스트가 target 변경 전에 snapshot을 끝냈음을 호출 순서로 검증한다.
- 테스트가 잘못된 입력에서 credential·resolver·spinner·API 접근이 0회임을 검증한다.
- 두 신규 leaf help가 전역·지역·쓰기 안전 옵션을 노출한다.

## 의도 메모

- 재바인딩은 target 변경의 데이터 영역 반영을 촉발하는 보정 동작이다.
- 이미 target 변경이 성공한 뒤에는 자동 rollback이 더 큰 상태 불일치를 만들 수 있어 복구 정보를 반환한다.
- 결과와 종료 코드를 함께 제공해 agent가 partial을 성공으로 오인하지 않고 즉시 후속 조치를 만들 수 있다.

## Blocked 조건

- 조회 응답에서 Load Balancer의 현재 그룹 ID 목록을 확정할 수 없으면 `PHASE_BLOCKED: 재바인딩 snapshot 필드 재확인 필요`를 보고한다.
