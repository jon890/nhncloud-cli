# Phase 02 — 워크로드 실행제어 (pause/resume/restart/delete)

## 목표

`nhncloud ncs workload pause/resume/restart/delete` 를 구현한다.

- 검증: `pnpm tsc --noEmit`, `pnpm run build`, `pnpm test`.
- help 검증: `node dist/index.js ncs workload restart --help` stdout 에 `--task` 가 포함된다.
- help 검증: `node dist/index.js ncs workload delete --help` stdout 에 `--yes` 가 포함된다.

## 선행

선행 task `tasks/036-feat-ncs-foundation-read/` 의 `src/commands/ncs/workload.ts` 가 먼저 병합돼 있어야 한다.

## 구현 항목

### 1. NCS service 확장

- `src/services/ncs/client.ts`
  - `pauseWorkload(id)`: `POST /workloads/{id}/pause`.
  - `resumeWorkload(id)`: `POST /workloads/{id}/resume`.
  - `restartWorkloadTask(id, taskId)`: `POST /workloads/{id}/tasks/{taskId}/restart`.
  - `deleteWorkload(id)`: `DELETE /workloads/{id}`.

### 2. command

- `src/commands/ncs/workload.ts`
  - `pause <id>` 추가.
  - `resume <id>` 추가.
  - `restart <id> --task <taskId>` 추가. `--task` 누락 시 `EXIT_PARAM_ERROR`.
  - `delete <id> [--yes]` 추가. 기본 confirm(TTY 는 `@inquirer/prompts` `confirm`, 비대화형은 `--yes` 필수 — floatingip delete 패턴 참고, confirm 로직은 순수 판단 함수와 분리).

### 3. tests

- `src/services/ncs/client.test.ts` 에 `pauseWorkload`, `resumeWorkload`, `restartWorkloadTask`, `deleteWorkload` 봉투 성공 케이스 추가.
- `restartWorkloadTask` 에서 `taskId` 누락 시 커맨드 레벨 `EXIT_PARAM_ERROR` 테스트.

### 4. task 상태

- `tasks/036-2-feat-ncs-write-control/index.json` 에서 Phase 2 `status` 를 `completed` 로, `current_phase` 를 `3` 으로 갱신한다.

## 회피 항목

- `grep -rnE "exitCode\s*===\s*EXIT_PARAM_ERROR" src/commands/ncs src/services/ncs` → 0건.
- `grep -rnE "NhnCloudCliError\([^,]+,\s*[0-9]+" src/services/ncs src/commands/ncs` → 0건.
- `grep -nE "startSpinner" src/commands/ncs/workload.ts` → spinner 는 confirm·param 검증 뒤에 위치.

## 완료 조건

1. `pnpm tsc --noEmit` 0.
2. `pnpm run build` 정상.
3. `pnpm test` 정상.
4. `node dist/index.js ncs workload restart --help` stdout 에 `--task` 가 포함된다.
5. `node dist/index.js ncs workload delete --help` stdout 에 `--yes` 가 포함된다.
6. index.json 은 Phase 3 대기 상태로 갱신.

## 변경 파일 (정확)

- `src/services/ncs/client.ts`
- `src/services/ncs/client.test.ts`
- `src/commands/ncs/workload.ts`
- `tasks/036-2-feat-ncs-write-control/index.json`

## 커밋

```bash
git commit -m "feat(ncs): add workload pause/resume/restart/delete commands"
```
