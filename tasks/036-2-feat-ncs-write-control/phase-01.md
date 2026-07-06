# Phase 01 — 템플릿 쓰기 (create/delete + version create/delete)

## 목표

`nhncloud ncs template create/delete`, `nhncloud ncs template version create/delete` 를 구현한다.

- 검증: `pnpm tsc --noEmit`, `pnpm run build`, `pnpm test`.
- help 검증: `node dist/index.js ncs template create --help` stdout 에 `--file` 이 포함된다.
- help 검증: `node dist/index.js ncs template delete --help` stdout 에 `--yes` 가 포함된다.

## 선행

선행 task `tasks/036-feat-ncs-foundation-read/` 의 `src/services/ncs/client.ts`, `src/commands/ncs/helpers.ts`, `src/commands/ncs/template.ts` 가 먼저 병합돼 있어야 한다.
`docs/adr/020-ncs-container-service-api.md` 를 다시 확인한다 — 복잡한 생성 입력은 `--file <json>` 을 기본으로 삼는다(ADR-019 NKS 선례와 동일 원칙).

## 구현 항목

### 1. `--file` JSON 파싱 helper

- `src/commands/ncs/helpers.ts` 에 `readJsonPayload(filePath: string): unknown` 추가.
  - 파일 읽기 실패(존재하지 않음 등) 또는 `JSON.parse` 실패 시 `NhnCloudCliError(message, EXIT_PARAM_ERROR)`.
  - 순수 함수로 작성 — stdout/stderr 출력이나 confirm 로직을 섞지 않는다(io-throw-bundled-untestable 회피 — 단위테스트 가능하게).

### 2. NCS service 확장

- `src/services/ncs/client.ts`
  - `createTemplate(body: unknown)`: `POST /templates`, 응답은 생성된 template 전체(봉투 unwrap).
  - `deleteTemplate(id)`: `DELETE /templates/{id}`.
  - `createTemplateVersion(id, body: unknown)`: `POST /templates/{id}/versions` (body 에 `sourceVersion` 필수 — 클라이언트는 그대로 전달, 필수값 검증은 API 응답 오류에 위임).
  - `deleteTemplateVersion(id, version)`: `DELETE /templates/{id}/versions/{version}`.

### 3. command

- `src/commands/ncs/template.ts`
  - `template create --file <path>` 추가. `readJsonPayload` 로 파싱 후 `createTemplate` 호출. 결과를 stdout 에 출력.
  - `template delete <id> [--yes]` 추가. 기본 confirm(TTY 는 `@inquirer/prompts` `confirm`, 비대화형은 `--yes` 필수 — floatingip delete 패턴 참고).
  - `template version create <id> --file <path>` 추가.
  - `template version delete <id> <version> [--yes]` 추가(동일 confirm 정책).

### 4. tests

- `src/services/ncs/client.test.ts` 에 `createTemplate`, `deleteTemplate`, `createTemplateVersion`, `deleteTemplateVersion` 봉투 성공 케이스 추가.
- `src/commands/ncs/helpers.test.ts` (신규 또는 기존 파일에 추가): `readJsonPayload` 정상 파싱 / 파일 없음 / JSON 파싱 실패 3케이스.

### 5. task 상태

- `tasks/036-2-feat-ncs-write-control/index.json` 에서 Phase 1 `status` 를 `completed` 로, `current_phase` 를 `2` 로 갱신한다.

## 회피 항목

- `grep -rnE "exitCode\s*===\s*EXIT_PARAM_ERROR" src/commands/ncs src/services/ncs` → 0건.
- `grep -rnE "NhnCloudCliError\([^,]+,\s*[0-9]+" src/services/ncs src/commands/ncs` → 0건.
- `grep -B 5 "readFile\|JSON.parse" src/commands/ncs/*.ts` → confirm/삭제 로직과 분리된 순수 함수인지 확인.
- `grep -nE "startSpinner" src/commands/ncs/*.ts` → spinner 는 confirm·파일 파싱 뒤에 위치.

## 완료 조건

1. `pnpm tsc --noEmit` 0.
2. `pnpm run build` 정상.
3. `pnpm test` 정상.
4. `node dist/index.js ncs template create --help` stdout 에 `--file` 이 포함된다.
5. `node dist/index.js ncs template delete --help` stdout 에 `--yes` 가 포함된다.
6. index.json 은 Phase 2 대기 상태로 갱신.

## 변경 파일 (정확)

- `src/services/ncs/client.ts`
- `src/services/ncs/client.test.ts`
- `src/commands/ncs/helpers.ts`
- `src/commands/ncs/helpers.test.ts`
- `src/commands/ncs/template.ts`
- `tasks/036-2-feat-ncs-write-control/index.json`

## 커밋

```bash
git commit -m "feat(ncs): add template create/delete and version write commands"
```
