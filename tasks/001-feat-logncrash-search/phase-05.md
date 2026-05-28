# Phase 5: command + formatter + entrypoint

## 컨텍스트

nhncloud-cli 의 `nhncloud logncrash search` 구현 중. Phase 1~4 완료 (utils, api 공통, config, logncrash client).
이 phase 는 사용자 진입점을 만든다 — Commander 명령, 출력 포매터, CLI entrypoint. 이 phase 후 `node dist/index.js logncrash search` 가 실제 동작해야 한다.

먼저 아래 문서를 읽어라:

- `docs/flow.md` — 명령 시그니처, 옵션, 출력 3모드, 시간 입력
- `docs/code-architecture.md` — 커맨드 실행 흐름, 디렉터리 구조
- `CLAUDE.md` — stdout/stderr 분리

기존 코드 참조 (dooray-cli, 읽기만):

- `/Users/nhn/personal/dooray-cli/src/index.ts` — Commander 등록 + 전역 옵션 preAction 훅
- `/Users/nhn/personal/dooray-cli/src/formatters/table.ts` — table/json/quiet `output()` 패턴
- `/Users/nhn/personal/dooray-cli/src/commands/project/list.ts` — 명령 구조 (optsWithGlobals, spinner)
- `.claude/skills/_shared/code-review-pitfalls.md` 섹션 1 (spinner 순서/leak), 7-2 (early return 출력 분기)

이전 phase 산출물:

- `src/services/logncrash/client.ts` (`LogncrashClient`), `src/config/credentials.ts` (`getServiceCredential`/`resolveProfileName`)
- `src/utils/time.ts` (`resolveTime`), `src/utils/spinner.ts`

## 목표

formatter + command + entrypoint 작성. 전역 옵션 동작.

## 작업 목록

- [ ] `src/formatters/table.ts`
  - dooray output() 패턴 — `printTable` / `printJson` / `printQuiet` + `output(opts, {headers, rows, raw, ids})`
  - `OutputOptions { json?, quiet? }`
- [ ] `src/commands/logncrash/search.ts`
  - Commander `search` — 옵션 `--query <q>` `--from <t>` `--to <t>` `--page <n>` `--size <n>` `--profile <name>`
  - `--query`/`--from`/`--to` 필수 (없으면 `EXIT_PARAM_ERROR` 친절 메시지)
  - `resolveTime` 으로 from/to 정규화 (spinner 시작 *전* — param 검증 단계)
  - 정규화 직후 `assertSearchRange(from, to)` 호출 — 90일/31일/역전 사전 검증 (flow.md 제약, spinner 시작 전)
  - `--page`/`--size` 파싱 시 `--size` 가 100 초과면 `NhnCloudCliError(EXIT_PARAM_ERROR)`, 음수 page/size 도 거름 (flow.md "최대 100")
  - `resolveProfileName` → `getServiceCredential("logncrash", profile)` → `LogncrashClient`
  - spinner 시작 후 client.search 는 try/catch + `stopSpinner(false)` re-throw (leak 방지)
  - 테이블: 고정 컬럼 `logTime`/`logType`/본문 요약. `--json`: raw data + 페이지 메타. `--quiet`: 행별 최소 출력
- [ ] `src/index.ts`
  - Commander program, name `nhncloud`, 전역 `--json`/`--quiet`/`--no-color`
  - preAction 훅: no-color 시 chalk.level=0, json/quiet 시 setQuiet(true)
  - `logncrash` 커맨드 그룹 → `search` 등록
  - `parseAsync().catch` — `NhnCloudCliError.exitCode` 로 process.exit, 메시지는 stderr

## 성공 기준

```bash
# cwd: <레포 루트>
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l   # 기대: 0
pnpm run build
node dist/index.js logncrash search --help 2>&1 | grep -c "\-\-query"   # 기대: >=1
node dist/index.js --help 2>&1 | grep -c "logncrash"                    # 기대: >=1
# spinner leak / 순서 자가 점검
grep -A 15 "startSpinner" src/commands/logncrash/search.ts | grep -cE "try\s*\{"  # 기대: >=1
# 시간 범위 사전 검증 호출 (spinner 시작 전)
grep -c "assertSearchRange" src/commands/logncrash/search.ts   # 기대: >=1
# early return 출력 분기 — json 있으면 quiet 도 (7-2)
grep -nE "\.get\([^)]+\)!|as unknown as " src/   # 기대: 0건
```

## 주의사항

- spinner 는 param 검증/resolveTime *뒤*, client 호출은 try/catch 안 (code-review-pitfalls 1-1, 1-2).
- 빈 결과(0건)는 stdout (테이블 "결과 없음" / json `{...,data:[]}` / quiet 무출력) — stderr 금지 (common-pitfalls CLI8).
- 서버 응답 문자열을 그대로 출력 시 control char 우려 — 본 PoC 는 테이블 truncate 로 충분 (과보호 금지).

## Blocked 조건

- 없음 (자기완결적).
