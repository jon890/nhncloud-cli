# Phase 1: 기반 유틸 + 에러 체계

## 컨텍스트

nhncloud-cli 는 NHN Cloud 서비스를 호출하는 TypeScript CLI 다. 첫 명령으로 `nhncloud logncrash search` (Log & Crash 로그 검색) 를 구현 중이다.
이 phase 는 가장 아래 레이어 — 다른 모든 파일이 의존하는 유틸·에러·시간 변환을 만든다. 아직 src/ 에 코드가 없다 (scaffold 만 존재).

먼저 아래 문서를 읽어라:

- `CLAUDE.md` — 코드 컨벤션 (ky, NhnCloudCliError, stdout/stderr 분리, pnpm)
- `docs/code-architecture.md` — 디렉터리 구조 + 레이어 의존 방향
- `docs/flow.md` — 에러 경로 (exit code 매핑), 시간 입력 해석 규칙

기존 코드 참조 (패턴 파악용 — dooray-cli, 읽기만):

- `/Users/nhn/personal/dooray-cli/src/utils/errors.ts` — 에러 클래스 패턴
- `/Users/nhn/personal/dooray-cli/src/utils/exit-codes.ts` — exit code 상수
- `/Users/nhn/personal/dooray-cli/src/utils/spinner.ts` — ora 래퍼 (quiet no-op proxy)

## 목표

src/utils/ 에 기반 4개 파일 작성.

## 작업 목록

- [ ] `src/utils/exit-codes.ts`
  - `EXIT_SUCCESS=0`, `EXIT_API_ERROR=1`, `EXIT_AUTH_ERROR=2`, `EXIT_PARAM_ERROR=3`, `EXIT_CONFIG_ERROR=4`
- [ ] `src/utils/errors.ts`
  - `export class NhnCloudCliError extends Error { constructor(message: string, public readonly exitCode: number) }`
- [ ] `src/utils/spinner.ts`
  - dooray spinner.ts 패턴 그대로 — `setQuiet`, `startSpinner(text)`, `stopSpinner(success?, text?)`. quiet 모드 no-op proxy. stream 은 `process.stderr`
- [ ] `src/utils/time.ts`
  - `export function resolveTime(input: string): string` — ISO8601 정규화
  - `now` → 현재 시각 ISO8601
  - 상대시간 `^(\d+)(m|h|d)$` → 현재 기준 과거 시각 (`30m`/`1h`/`2d`)
  - 이미 ISO8601 형식이면 그대로 반환
  - 파싱 불가 시 `throw new NhnCloudCliError("시간 형식 오류: ...", EXIT_PARAM_ERROR)`
  - 출력은 타임존 오프셋 포함 ISO8601 (`YYYY-MM-DDThh:mm:ss±hh:mm`)

## 성공 기준

```bash
# cwd: /Users/nhn/personal/nhncloud-cli
pnpm install
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l   # 기대: 0
ls src/utils/exit-codes.ts src/utils/errors.ts src/utils/spinner.ts src/utils/time.ts
grep -c "export class NhnCloudCliError" src/utils/errors.ts   # 기대: 1
grep -c "export function resolveTime" src/utils/time.ts        # 기대: 1
```

## 주의사항

- `CLAUDE.md` 컨벤션 준수. 데이터=stdout / 스피너=stderr.
- `time.ts` 의 상대시간 변환은 `Date` 기반. 외부 라이브러리 추가 금지 (dayjs 등 불요).
- dooray 코드를 참조하되 `DoorayCliError` → `NhnCloudCliError` 로.

## Blocked 조건

- `pnpm install` 이 네트워크 등으로 실패하면: `PHASE_BLOCKED: pnpm install 실패`
