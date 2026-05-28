# Phase 2: API 공통 계층 (endpoints / envelope / httpError)

## 컨텍스트

nhncloud-cli 의 `nhncloud logncrash search` 구현 중. Phase 1 에서 `src/utils/` (errors, exit-codes, spinner, time) 가 만들어졌다.
이 phase 는 NHN Cloud API 공통 계층을 만든다 — 모든 서비스 client 가 공유할 엔드포인트 맵, 응답 봉투 unwrap, HTTP 에러 매핑.

먼저 아래 문서를 읽어라:

- `docs/adr.md` — ADR-005 (엔드포인트 맵), ADR-006 (봉투 정규화, resultCode 타입 혼재)
- `docs/code-architecture.md` — api/ 섹션, 인증·엔드포인트 추상화 계층
- `CLAUDE.md` — NHN Cloud 인증 모델 표, ky 전용 규칙

기존 코드 참조 (dooray-cli, 읽기만):

- `/Users/nhn/personal/dooray-cli/src/api/client.ts` — ky 인스턴스 + 에러 변환 패턴 (`toDoorayCliError`)
- `.claude/skills/_shared/code-review-pitfalls.md` 섹션 2 + 6 — 에러 처리 / HTTP 패턴 함정

이전 phase 산출물:

- `src/utils/errors.ts` (`NhnCloudCliError`), `src/utils/exit-codes.ts`

## 목표

src/api/ 에 공통 3개 파일 작성.

## 작업 목록

- [ ] `src/api/endpoints.ts`
  - 서비스명 → 엔드포인트 맵 (일반/real 만, gov 제외 — ADR-005)
  - `logncrash` 검색: `https://api-lncs-search.nhncloudservice.com`
  - (예약) `deploy`: `https://api-tcd.nhncloudservice.com`
  - `export function endpointFor(service: string): string` — 미등록 서비스는 `NhnCloudCliError`
- [ ] `src/api/envelope.ts`
  - NHN 공통 봉투 타입: `interface NhnEnvelope<T> { header: { isSuccessful: boolean; resultCode: number | string; resultMessage: string }; body?: T }`
  - `export function unwrap<T>(res: NhnEnvelope<T>): T` — `header.isSuccessful === false` 면 `NhnCloudCliError(resultMessage, EXIT_API_ERROR)`. 성공 시 `res.body` 반환
  - `resultCode` 는 string|number 둘 다 허용 — `isSuccessful` 로만 판정 (ADR-006)
- [ ] `src/api/httpError.ts`
  - `export function toNhnCloudCliError(err: unknown): NhnCloudCliError`
  - ky `HTTPError` 의 status: 401/403 → `EXIT_AUTH_ERROR`, 그 외 4xx/5xx → `EXIT_API_ERROR`
  - 메시지에 status code 포함 (예: `API 호출 실패 (404): ...`)
  - HTTPError 가 아닌 raw Error 는 그대로 wrap (`EXIT_API_ERROR`)

## 성공 기준

```bash
# cwd: <레포 루트>
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l   # 기대: 0
ls src/api/endpoints.ts src/api/envelope.ts src/api/httpError.ts
grep -c "api-lncs-search.nhncloudservice.com" src/api/endpoints.ts   # 기대: 1
grep -c "export function unwrap" src/api/envelope.ts                  # 기대: 1
grep -c "export function toNhnCloudCliError" src/api/httpError.ts     # 기대: 1
# 봉투는 isSuccessful 우선 판정 (resultCode 타입 비교 금지)
grep -nE "resultCode\s*===" src/api/envelope.ts   # 기대: 0건 (resultCode 로 성공판정 금지)
```

## 주의사항

- `ky` 전용. axios/node-fetch/got 금지 (`grep -rnE "from ['\"](axios|node-fetch|got)" src/` = 0).
- 봉투 판정은 반드시 `isSuccessful` 로 — `resultCode` 가 string("SUCCESS")/number 혼재라 비교 금지 (ADR-006).
- catch 의 exitCode 분기는 `EXIT_API_ERROR` / `EXIT_AUTH_ERROR` 만 (code-review-pitfalls 2-2).

## Blocked 조건

- ADR-006 봉투 구조가 실제 응답과 달라 보이면: `PHASE_BLOCKED: 봉투 구조 재확인 필요`
