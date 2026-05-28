# Phase 4: configure 명령 (대화형 + flag)

## 컨텍스트

`nhncloud configure` 마법사 추가 중. Phase 1~3 완료 (UAK 모델, 쓰기 helper, 연결 테스트).
이 phase 는 명령 자체 — 대화형 마법사 + 비대화형 flag. 이 phase 후 `nhncloud configure` 가 동작한다.

먼저 아래 문서를 읽어라:

- `docs/flow.md` — configure 대화형 흐름 + flag 표 + 연결 테스트
- `docs/adr.md` — ADR-009

기존 코드 참조 (대화형 마법사 패턴 — dooray, 읽기만):

- `/Users/nhn/personal/dooray-cli/src/commands/setup.ts` (@inquirer/prompts input/password/confirm, retry loop, ExitPromptError 취소 처리, all-or-nothing 저장)

기존 코드 참조 (이 repo):

- `src/index.ts` (명령 등록), `src/config/credentials.ts` (`setUserAccessKey`/`setServiceCredential`/`resolveProfileName`)
- Phase 3 의 `verifyUserAccessKey`/`verifyLogncrash`, `src/utils/errors.ts`

## 목표

대화형 + 비대화형 configure 명령 + entrypoint 등록.

## 작업 목록

- [ ] `@inquirer/prompts` 의존성 추가 (`pnpm add @inquirer/prompts`)
- [ ] `src/commands/configure.ts`
  - 옵션 `--profile <name>` `--uak-id` `--uak-secret` `--logncrash-appkey` `--logncrash-secret` `--no-verify`
  - **모드 분기**: 위 자격증명 flag 가 하나라도 있으면 비대화형, 없으면 대화형
  - 대화형: `input`(profile) → `password`(uak id/secret) → logncrash 설정 여부 `confirm` → `password`(appkey/secret)
  - 비대화형: flag 값만 사용, 누락 항목은 건너뜀
  - `--no-verify` 아니면 연결 테스트 (verifyUserAccessKey / verifyLogncrash). 대화형 실패 시 재입력 또는 저장 confirm, 비대화형 실패 시 `EXIT_AUTH_ERROR`
  - 머지 저장 (`setUserAccessKey` / `setServiceCredential`)
  - `ExitPromptError` (Ctrl-C) 는 "취소되었습니다" 후 정상 종료
- [ ] `src/index.ts` — `configure` 명령 등록

## 성공 기준

```bash
# cwd: <레포 루트>
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l   # 기대: 0
pnpm run build
node dist/index.js configure --help 2>&1 | grep -cE "\-\-uak-id|\-\-no-verify"   # 기대: >=1
node dist/index.js --help 2>&1 | grep -c "configure"   # 기대: >=1
grep -c "@inquirer/prompts" package.json   # 기대: >=1
grep -c "ExitPromptError" src/commands/configure.ts   # 기대: >=1
grep -nE "\.get\([^)]+\)!|as unknown as " src/commands/configure.ts   # 기대: 0건
```

## 주의사항

- 비밀 입력은 `password` (마스킹). 에코·로그에 secret 노출 금지.
- 대화형/비대화형 분기 — flag 유무로 명확히. 두 경로의 검증·저장 로직은 공통 helper 로 (중복 금지, common-pitfalls 1-15 검증 정책 일관성).
- 데이터·진행 메시지는 stderr, 최종 결과만 필요 시 stdout.

## Blocked 조건

- 없음 (Phase 1~3 기반 자기완결).
