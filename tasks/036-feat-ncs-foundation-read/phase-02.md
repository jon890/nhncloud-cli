# Phase 02 — NCS 조회 명령 전체

## 목표

NCS 의 나머지 조회 명령 전체를 구현한다: template get/versions/version-get, workload list/get/logs/events/history/history-get/schedule-history.

- 검증: `pnpm tsc --noEmit`, `pnpm run build`, `pnpm test`.
- help 검증: `node dist/index.js ncs workload --help` stdout 에 `list`, `get`, `logs`, `events`, `history` 가 포함된다.
- help 검증: `node dist/index.js ncs template version --help` stdout 에 `list`, `get` 이 포함된다.
- 자격증명 가능 시 실측: `node dist/index.js ncs workload list --json` 이 200 응답을 반환한다.

## 선행

Phase 1 에서 만든 `src/services/ncs/client.ts`, `src/commands/ncs/helpers.ts` 를 확장한다.
`docs/adr/020-ncs-container-service-api.md` 를 다시 확인해 봉투·인증 규칙을 유지한다.
workload 응답의 `tasks[]` 런타임 상태 필드는 공식 docs 예제 JSON 으로 실측 확정한다(추측 금지).

## 구현 항목

### 1. NCS service 확장

- `src/services/ncs/types.ts`
  - `NcsTemplateDetail`, `NcsTemplateVersionSummary`, `NcsTemplateVersionDetail` 추가.
  - `NcsWorkloadSummary`, `NcsWorkloadDetail`(tasks[] 포함), `NcsWorkloadLog`, `NcsWorkloadEvent`, `NcsWorkloadHistorySummary`, `NcsWorkloadHistoryDetail`, `NcsWorkloadScheduleHistory` 추가.
- `src/services/ncs/client.ts`
  - `getTemplate(id)`: `GET /templates/{id}`.
  - `listTemplateVersions(id, query?: { q?, sort?, page?, size? })`: `GET /templates/{id}/versions`.
  - `getTemplateVersion(id, version)`: `GET /templates/{id}/versions/{version}`.
  - `listWorkloads(query?: { q?, page?, size? })`: `GET /workloads`.
  - `getWorkload(id)`: `GET /workloads/{id}`.
  - `getWorkloadLogs(id, taskId, query: { container: string; from?; to?; page?; size? })`: `GET /workloads/{id}/tasks/{taskId}/logs` (`container` 쿼리 필수 — 누락 시 `EXIT_PARAM_ERROR`).
  - `getWorkloadEvents(id, taskId, query?: { type?, q?, from?, to?, page?, size? })`: `GET /workloads/{id}/tasks/{taskId}/events`.
  - `listWorkloadHistory(id)`: `GET /workloads/{id}/history`.
  - `getWorkloadHistory(id, historyId)`: `GET /workloads/{id}/history/{historyId}`.
  - `getWorkloadScheduleHistory(id)`: `GET /workloads/{id}/schedulehistory`.
  - 모든 메서드는 `unwrap` 으로 봉투를 벗기고, HTTP 에러는 `toNhnCloudCliError`.

### 2. command

- `src/commands/ncs/template.ts`
  - `template get <id>` 추가.
  - `template version list <id>` / `template version get <id> <version>` 추가(`version` subcommand container).
- `src/commands/ncs/workload.ts` (신규)
  - `workload` subcommand container 생성.
  - `list`, `get <id>`, `logs <id> --task <taskId> --container <name>`, `events <id> --task <taskId>`, `history <id>`, `history get <id> <historyId>`(또는 `history-get`), `schedule-history <id>` 구현.
  - `--task` 옵션이 없으면 `EXIT_PARAM_ERROR`.
- `src/index.ts`
  - `ncs workload` subcommand 등록.

### 3. tests

- `src/services/ncs/client.test.ts` 에 추가:
  - `getTemplate`, `listTemplateVersions`, `getTemplateVersion` 봉투 성공 케이스.
  - `listWorkloads`, `getWorkload`, `getWorkloadLogs`, `getWorkloadEvents`, `listWorkloadHistory`, `getWorkloadHistory`, `getWorkloadScheduleHistory` 봉투 성공 케이스.
  - `getWorkloadLogs` 에서 `container` 쿼리 누락 시 `EXIT_PARAM_ERROR` 던지는 테스트.

### 4. task 상태

- `tasks/036-feat-ncs-foundation-read/index.json` 에서 Phase 2 `status` 를 `completed` 로, `current_phase` 를 `3` 으로 갱신한다.

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
5. `node dist/index.js ncs template version --help` stdout 에 `list`, `get` 이 포함된다.
6. index.json 은 Phase 3 대기 상태로 갱신.

## 변경 파일 (정확)

- `src/services/ncs/types.ts`
- `src/services/ncs/client.ts`
- `src/services/ncs/client.test.ts`
- `src/commands/ncs/template.ts`
- `src/commands/ncs/workload.ts`
- `src/index.ts`
- `tasks/036-feat-ncs-foundation-read/index.json`

## 커밋

```bash
git commit -m "feat(ncs): add remaining template and workload read commands"
```
