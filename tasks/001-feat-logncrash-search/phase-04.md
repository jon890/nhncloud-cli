# Phase 4: logncrash 서비스 client

## 컨텍스트

nhncloud-cli 의 `nhncloud logncrash search` 구현 중. Phase 1(utils) + 2(api 공통) + 3(config) 완료.
이 phase 는 Log & Crash 검색 API 를 호출하는 서비스 client 를 만든다.

먼저 아래 문서를 읽어라:

- `docs/flow.md` — 명령 시그니처, 검색 파라미터, 시간 제약
- `docs/adr.md` — ADR-006 (봉투)
- `CLAUDE.md` — NHN 인증 모델 (Log & Crash = appkey path + `X-LNCS-SECRET` 헤더)

API 스펙 (NHN Log & Crash 검색):

- `POST {endpoint}/api/v2/search/{appkey}`
- 헤더: `X-LNCS-SECRET: {secret}`, `Content-Type: application/json`
- body: `{ query: string, from: string(ISO8601), to: string(ISO8601), pageNumber?: number(기본0), pageSize?: number(기본10, 최대100), sort?: object }`
- 응답: `{ header:{isSuccessful,resultCode(number),resultMessage}, body:{ totalItems, pageNumber, pageSize, data: [...] } }`
- 제약: 최근 90일 이내, 범위 31일 이하, 최대 10만 건

이전 phase 산출물:

- `src/api/endpoints.ts` (`endpointFor`), `src/api/envelope.ts` (`unwrap`), `src/api/httpError.ts` (`toNhnCloudCliError`)
- `src/config/types.ts` (`ServiceCredential`)

## 목표

src/services/logncrash/ 에 타입 + client 작성.

## 작업 목록

- [ ] `src/services/logncrash/types.ts`
  - `interface LogSearchParams { query: string; from: string; to: string; pageNumber?: number; pageSize?: number }`
  - `interface LogSearchResult { totalItems: number; pageNumber: number; pageSize: number; data: Record<string, unknown>[] }`
- [ ] `src/services/logncrash/client.ts`
  - `class LogncrashClient { constructor(appkey: string, secret: string) }`
  - `search(params: LogSearchParams): Promise<LogSearchResult>`
    - `endpointFor("logncrash")` + `/api/v2/search/{appkey}`
    - ky POST, 헤더 `X-LNCS-SECRET`, json body (pageNumber 기본 0, pageSize 기본 10)
    - 응답을 `unwrap` 으로 봉투 해제
    - catch 는 `toNhnCloudCliError(err)` 로 변환 후 throw

## 성공 기준

```bash
# cwd: /Users/nhn/personal/nhncloud-cli
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l   # 기대: 0
ls src/services/logncrash/types.ts src/services/logncrash/client.ts
grep -c "X-LNCS-SECRET" src/services/logncrash/client.ts   # 기대: 1
grep -c "/api/v2/search/" src/services/logncrash/client.ts # 기대: 1
grep -c "unwrap" src/services/logncrash/client.ts          # 기대: >=1
# 이중 단언 금지
grep -nE "as unknown as " src/services/logncrash/  # 기대: 0건
```

## 주의사항

- HTTP 는 `ky` 전용. 에러는 `toNhnCloudCliError` 통과.
- `data` 배열은 동적 커스텀 필드라 `Record<string, unknown>[]` 로 둔다 (강제 타입 금지).
- 봉투 판정은 `isSuccessful` (resultCode 비교 금지).

## Blocked 조건

- API 응답 shape 가 docs 와 크게 다르면: `PHASE_BLOCKED: Log & Crash 응답 shape 재확인 필요`
