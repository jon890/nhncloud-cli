# Phase 4: deploy 명령 4종 + entrypoint 등록

## 컨텍스트

`nhncloud deploy` 명령군 추가 중. Phase 1~3 완료 (oauth/캐시, config target, DeployClient).
이 phase 는 사용자 진입점 — Commander 명령 4개 + index.ts 등록. 이 phase 후 `node dist/index.js deploy run --help` 등이 동작.

먼저 아래 문서를 읽어라:

- `docs/flow.md` — deploy 명령 시그니처, 옵션 표, 동기/비동기
- `docs/code-architecture.md` — commands/deploy/ 구조, 커맨드 실행 흐름

기존 코드 참조:

- `src/index.ts` (Commander 등록 + 전역 옵션 — task 001), `src/commands/logncrash/search.ts` (명령 패턴)
- `src/services/deploy/client.ts`, `src/api/oauth.ts`, `src/config/credentials.ts` (`getDeployTarget`/`getServiceCredential`/`resolveProfileName`)
- `src/formatters/table.ts` (`output`), `src/utils/spinner.ts`
- `.claude/skills/_shared/code-review-pitfalls.md` 섹션 1 (spinner 순서/leak)

## 목표

deploy 명령 4종 작성 + index.ts 에 deploy 그룹 등록.

## 작업 목록

- [ ] 공통 헬퍼 (commands/deploy/ 내부) — target 좌표 로드 + flag override + access_token 획득
  - `resolveProfileName` → `getDeployTarget(name)` + flag override → `getServiceCredential("deploy")` → `getAccessToken` → `DeployClient`
- [ ] `src/commands/deploy/run.ts`
  - `deploy run <target>` + 옵션 `--app-key`/`--artifact-id`/`--server-group-id`/`--scenario-ids`/`--target-hosts`/`--concurrent`/`--next-when-fail`/`--note`/`--async`/`--profile`
  - spinner 는 좌표·토큰 획득 후, client.run 은 try/catch + `stopSpinner(false)`
- [ ] `src/commands/deploy/artifacts.ts` — `deploy artifacts` (appKey: target 또는 `--app-key`)
- [ ] `src/commands/deploy/server-groups.ts` — `deploy server-groups <target>`
- [ ] `src/commands/deploy/histories.ts` — `deploy histories <target>`
- [ ] `src/index.ts` — `deploy` 커맨드 그룹 생성 + 4 명령 등록

## 성공 기준

```bash
# cwd: /Users/nhn/personal/nhncloud-cli
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l   # 기대: 0
pnpm run build
node dist/index.js deploy run --help 2>&1 | grep -c "\-\-async"        # 기대: >=1
node dist/index.js --help 2>&1 | grep -c "deploy"                       # 기대: >=1
node dist/index.js deploy --help 2>&1 | grep -cE "run|artifacts|server-groups|histories"  # 기대: >=4
# spinner leak 점검
grep -A 15 "startSpinner" src/commands/deploy/run.ts | grep -cE "try\s*\{"  # 기대: >=1
grep -nE "\.get\([^)]+\)!|as unknown as " src/commands/deploy/   # 기대: 0건
```

## 주의사항

- spinner 는 좌표/토큰 획득 *뒤*, client 호출은 try/catch 안 (code-review-pitfalls 1-1/1-2).
- flag override: 명시된 flag 만 target 값 덮어쓰기 (미지정 flag 가 target 값 지우지 않게).
- 출력은 `output()` 재사용 — 테이블/json/quiet 일관 (빈 결과 stdout, CLI8).

## Blocked 조건

- 이전 phase 산출물 부재 시: `PHASE_BLOCKED: 이전 phase 미완`
