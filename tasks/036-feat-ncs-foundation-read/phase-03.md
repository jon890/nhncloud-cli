# Phase 03 — workload 조회 전체

## 목표

workload 조회 명령 전체를 구현한다: `workload list/get/logs/events/history/history-get/schedule-history`.

- 검증: `pnpm tsc --noEmit`, `pnpm run build`, `pnpm test`.
- help 검증: `node dist/index.js ncs workload --help` stdout 에 `list`, `get`, `logs`, `events`, `history` 가 포함된다.
- 자격증명 가능 시 실측: `node dist/index.js ncs workload list --json` 이 200 응답을 반환한다.

## 선행

Phase 1~2 에서 만든 `src/services/ncs/client.ts`, `src/commands/ncs/helpers.ts` 를 확장한다.
Phase 1 에서 확정한 봉투 형태·pagination 규약을 그대로 유지한다.
workload 응답의 `tasks[]` 런타임 상태 필드는 공식 docs 예제 JSON 으로 실측 확정한다(추측 금지).

## 구현 항목

### 1. NCS service 확장

- `src/services/ncs/types.ts`
  - `NcsWorkloadSummary`, `NcsWorkloadDetail`(tasks[] 포함), `NcsWorkloadLog`, `NcsWorkloadEvent`, `NcsWorkloadHistorySummary`, `NcsWorkloadHistoryDetail`, `NcsWorkloadScheduleHistory` 추가.
- `src/services/ncs/client.ts`
  - `listWorkloads(query?: { q?; page?; size? })`: `GET /workloads`.
  - `getWorkload(id)`: `GET /workloads/{id}`.
  - `getWorkloadLogs(id, taskId, query: { container: string; from?; to?; page?; size? })`: `GET /workloads/{id}/tasks/{taskId}/logs` (`container` 쿼리 필수 — 누락 시 `EXIT_PARAM_ERROR`).
  - `getWorkloadEvents(id, taskId, query?: { type?; q?; from?; to?; page?; size? })`: `GET /workloads/{id}/tasks/{taskId}/events`.
  - `listWorkloadHistory(id)`: `GET /workloads/{id}/history`.
  - `getWorkloadHistory(id, historyId)`: `GET /workloads/{id}/history/{historyId}`.
  - `getWorkloadScheduleHistory(id)`: `GET /workloads/{id}/schedulehistory`.
  - 봉투는 Phase 1 확정 형태로 벗긴다. 목록 메서드(`listWorkloads`/`getWorkloadEvents`/`listWorkloadHistory`)는 Phase 1 pagination 규약을 동일 적용.

### 2. command

- `src/commands/ncs/workload.ts` (신규)
  - `workload` subcommand container 생성.
  - `list`, `get <id>`, `logs <id> --task <taskId> --container <name>`, `events <id> --task <taskId>`, `history <id>`, `history get <id> <historyId>`, `schedule-history <id>` 구현.
  - `--task` 옵션이 없으면 `EXIT_PARAM_ERROR`.
- `src/index.ts`
  - `ncs workload` subcommand 등록.

### 3. tests

- `src/services/ncs/client.test.ts` 에 추가:
  - `listWorkloads`, `getWorkload`, `getWorkloadLogs`, `getWorkloadEvents`, `listWorkloadHistory`, `getWorkloadHistory`, `getWorkloadScheduleHistory` 봉투 성공 케이스.
  - `getWorkloadLogs` 에서 `container` 쿼리 누락 시 `EXIT_PARAM_ERROR` 던지는 테스트.

### 4. task 상태

- `tasks/036-feat-ncs-foundation-read/index.json` 에서 Phase 3 `status` 를 `completed` 로, `current_phase` 를 `4` 로 갱신한다.

## 회피 항목

- `grep -rnE "exitCode\s*===\s*EXIT_PARAM_ERROR" src/commands/ncs src/services/ncs` → 0건.
- `grep -rnE "NhnCloudCliError\([^,]+,\s*[0-9]+" src/services/ncs src/commands/ncs` → 0건.
- `grep -nE "\.get\([^)]+\)!" src/services/ncs src/commands/ncs` → 0건.
- `grep -nE "as unknown as " src/services/ncs src/commands/ncs` → 0건.
- `grep -rnE "stderr\.write.*없음|stderr\.write.*empty" src/commands/ncs` → 0건(빈 목록은 stdout).

## 완료 조건

1. `pnpm tsc --noEmit` 0.
2. `pnpm run build` 정상.
3. `pnpm test` 정상.
4. `node dist/index.js ncs workload --help` stdout 에 `list`, `get`, `logs`, `events`, `history` 가 포함된다.
5. index.json 은 Phase 4 대기 상태로 갱신.

## 변경 파일 (정확)

- `src/services/ncs/types.ts`
- `src/services/ncs/client.ts`
- `src/services/ncs/client.test.ts`
- `src/commands/ncs/workload.ts`
- `src/index.ts`
- `tasks/036-feat-ncs-foundation-read/index.json`

## 커밋

```bash
git commit -m "feat(ncs): add workload read commands"
```
