# Phase 02 — template 조회 완성 (get/versions/version-get)

## 목표

template 조회 명령을 완성한다: `template get`, `template version list`, `template version get`.

- 검증: `pnpm tsc --noEmit`, `pnpm run build`, `pnpm test`.
- help 검증: `node dist/index.js ncs template version --help` stdout 에 `list`, `get` 이 포함된다.
- help 검증: `node dist/index.js ncs template get --help` stdout 에 `get` 이 포함된다.
- 자격증명 가능 시 실측: `node dist/index.js ncs template get <id> --json` 이 200 응답을 반환한다.

## 선행

Phase 1 에서 만든 `src/services/ncs/client.ts`, `src/commands/ncs/helpers.ts`, `src/commands/ncs/template.ts` 를 확장한다.
Phase 1 에서 확정한 봉투 형태(`unwrapHeader`+named 필드 또는 `unwrap`)를 그대로 유지한다 — 여기서 다시 형태를 추측하지 않는다.

## 구현 항목

### 1. NCS service 확장

- `src/services/ncs/types.ts`
  - `NcsTemplateDetail`, `NcsTemplateVersionSummary`, `NcsTemplateVersionDetail` 추가(공식 docs 예제 JSON 기준 필드).
- `src/services/ncs/client.ts`
  - `getTemplate(id)`: `GET /templates/{id}`.
  - `listTemplateVersions(id, query?: { q?; sort?; page?; size? })`: `GET /templates/{id}/versions`.
  - `getTemplateVersion(id, version)`: `GET /templates/{id}/versions/{version}`.
  - 봉투는 Phase 1 확정 형태로 벗긴다. 목록(`listTemplateVersions`)은 Phase 1 pagination 규약(page/size 노출·truncation 없음)을 동일 적용.

### 2. command

- `src/commands/ncs/template.ts`
  - `template get <id>` 추가.
  - `template version list <id>` / `template version get <id> <version>` 추가(`version` subcommand container).

### 3. tests

- `src/services/ncs/client.test.ts` 에 추가:
  - `getTemplate`, `listTemplateVersions`, `getTemplateVersion` 봉투 성공 케이스.

### 4. task 상태

- `tasks/036-feat-ncs-foundation-read/index.json` 에서 Phase 2 `status` 를 `completed` 로, `current_phase` 를 `3` 으로 갱신한다.

## 회피 항목

- `grep -rnE "exitCode\s*===\s*EXIT_PARAM_ERROR" src/commands/ncs src/services/ncs` → 0건.
- `grep -rnE "NhnCloudCliError\([^,]+,\s*[0-9]+" src/services/ncs src/commands/ncs` → 0건.
- `grep -nE "\.get\([^)]+\)!" src/services/ncs src/commands/ncs` → 0건.
- `grep -nE "as unknown as " src/services/ncs src/commands/ncs` → 0건.

## 완료 조건

1. `pnpm tsc --noEmit` 0.
2. `pnpm run build` 정상.
3. `pnpm test` 정상.
4. `node dist/index.js ncs template version --help` stdout 에 `list`, `get` 이 포함된다.
5. index.json 은 Phase 3 대기 상태로 갱신.

## 변경 파일 (정확)

- `src/services/ncs/types.ts`
- `src/services/ncs/client.ts`
- `src/services/ncs/client.test.ts`
- `src/commands/ncs/template.ts`
- `tasks/036-feat-ncs-foundation-read/index.json`

## 커밋

```bash
git commit -m "feat(ncs): add template get and version read commands"
```
