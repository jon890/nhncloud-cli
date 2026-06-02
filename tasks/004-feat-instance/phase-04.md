# Phase 4: instance 명령 4종 + entrypoint 등록

## 컨텍스트

`nhncloud instance` 구현 중. Phase 1~3 완료 (iaas 자격증명·configure, keystone token·캐시, InstanceClient).
이 phase 는 사용자 진입점 — Commander 명령 4개 + index.ts 등록. 이 phase 후 `node dist/index.js instance --help` 가 동작한다.

먼저 아래 문서를 읽어라:

- `docs/flow.md` — instance 명령 시그니처·옵션 표·delete 안전 정책·에러 경로
- `docs/code-architecture.md` — commands/instance/ 구조

기존 코드 참조:

- `src/index.ts` — Commander 등록 + 전역 옵션
- `src/commands/deploy/run.ts` — 토큰 획득 + spinner + try/catch 패턴
- `src/commands/configure.ts` — confirm prompt 패턴 (delete 의 y/N 에 동일하게 `@inquirer/prompts` confirm 재사용)
- `src/services/instance/client.ts`, `src/api/keystone.ts`, `src/config/credentials.ts` (`getIaasCredential`/`resolveProfileName`)
- `src/formatters/table.ts`, `src/utils/spinner.ts`
- `.claude/skills/_shared/code-review-pitfalls.md` 섹션 1 (spinner 순서/leak)

## 목표

instance 명령 4종 작성 + index.ts 에 instance 그룹 등록.

## 작업 목록

> **작업 항목 6개 (helper + 4 명령 + index.ts) 는 의도적 유지.** 4 명령은 하나의 `instance` 진입점 그룹이고 helper·index.ts 는 그 그룹의 배선이라 응집성이 높다. 인위적으로 분할하면 한 진입점이 두 phase 로 쪼개져 오히려 검증·commit 단위가 흐트러진다 (5개 규칙의 예외 — 본문 명시로 갈음).

- [ ] 공통 헬퍼 (commands/instance/helpers.ts) — `resolveInstanceClient(opts): Promise<InstanceClient>`
  - `resolveProfileName` → `getIaasCredential` → `--region` flag override → `getIaasToken` → `InstanceClient(tokenId, computeEndpoint)`
- [ ] `src/commands/instance/list.ts` — `instance list`. 옵션 `--region` `--profile`. 출력: 고정 컬럼 id/name/status/IPs/flavor. --json: raw 배열. --quiet: id 만 줄 단위
- [ ] `src/commands/instance/get.ts` — `instance get <id>`. table: 주요 필드, --json: raw, --quiet: status 만
- [ ] `src/commands/instance/create.ts` — 옵션 `--name`(필수) `--flavor`(필수) `--image`(필수) `--network`(필수, 반복) `--key-name` `--security-group`(반복) `--ephemeral-disk-size` `--protect` `--wait` `--timeout`(기본 300) `--region` `--profile`
  - `--wait` 시 `waitForActive(timeoutMs=timeout*1000)` 호출, spinner 갱신, 도달 시 IP 표시
  - `--quiet --wait` 조합: 첫 IP 한 줄만 stdout (CI 파이프용)
- [ ] `src/commands/instance/delete.ts` — `instance delete <id>` 옵션 `--yes` `--region` `--profile`
  - 대화형 TTY + `--yes` 미지정 시 `@inquirer/prompts.confirm` (기본 No). non-TTY 는 `--yes` 강제 (없으면 `EXIT_PARAM_ERROR`)
  - 삭제 후 stderr 에 success, stdout 은 비움 (--quiet 도 비움, 부수효과 명령)
- [ ] `src/index.ts` — `instance` 커맨드 그룹 + 4 명령 등록

## 성공 기준

```bash
# cwd: <레포 루트>
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l   # 기대: 0
pnpm run build
node dist/index.js instance --help 2>&1 | grep -cE "list|get|create|delete"   # 기대: >=4
node dist/index.js instance create --help 2>&1 | grep -cE "\-\-wait|\-\-timeout|\-\-flavor"   # 기대: >=3
node dist/index.js instance delete --help 2>&1 | grep -c "\-\-yes"   # 기대: >=1
node dist/index.js --help 2>&1 | grep -c "instance"   # 기대: >=1
# spinner leak 점검 — startSpinner 뒤 try/catch
grep -A 15 "startSpinner" src/commands/instance/create.ts | grep -cE "try\s*\{"   # 기대: >=1
# 이중 단언 / Map.get()! 금지
grep -nE "\.get\([^)]+\)!|as unknown as " src/commands/instance/   # 기대: 0건
# delete 의 confirm — TTY 분기 명시
grep -cE "isTTY|process\.stdin\.isTTY" src/commands/instance/delete.ts   # 기대: >=1
```

## 주의사항

- spinner 시작은 자격증명·token 획득 *뒤* (param 검증 단계 leak 회피, code-review-pitfalls 1-1·1-2).
- create 의 `--quiet --wait` 출력은 IP 1줄만 — 자동화 step 이 바로 SSH/runner 등록할 수 있도록.
- delete 의 confirm 은 non-TTY 환경(CI) 에서 자동으로 `--yes` 강제 — 단, `--yes` 미지정이면 `EXIT_PARAM_ERROR` 로 거부(사고 방지). TTY 일 때만 prompt.
- `--region` 값 검증은 phase 2 의 `instanceHost` 에 위임 (모르는 region 은 거기서 거름).
- 빈 결과(0건)는 stdout (CLI8).

## Blocked 조건

- Phase 1~3 산출물 부재 시: `PHASE_BLOCKED: 이전 phase 미완`
