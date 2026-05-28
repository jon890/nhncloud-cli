# Code Architecture — nhncloud-cli

## 기술 스택

- 언어: TypeScript (Node ≥ 20)
- CLI 프레임워크: Commander.js
- HTTP: ky ([[adr-002]])
- 빌드: tsup (CJS 단일 번들, shebang 포함)
- 테스트: vitest
- 출력: chalk / cli-table3 / ora

## 디렉터리 구조

```
src/
  index.ts                  # CLI entrypoint (Commander 등록 + 전역 옵션)
  config/
    credentials.ts          # ~/.nhncloud/credentials.json + config.json 로드, profile 해석
    types.ts                # Credentials / Config / ServiceCredential 타입
  api/
    endpoints.ts            # 서비스별 엔드포인트 맵 (adr-005)
    envelope.ts             # NHN 공통 봉투 unwrap + 에러 매핑 (adr-006)
    httpError.ts            # ky HTTPError → NhnCloudCliError (status별 exit code)
  services/
    logncrash/
      client.ts             # LogncrashClient — search()
      types.ts              # 검색 요청/응답 타입
  utils/
    errors.ts               # NhnCloudCliError(message, exitCode)
    exit-codes.ts           # EXIT_* 상수
    spinner.ts              # ora 래퍼 (quiet 모드 no-op)
    time.ts                 # 상대시간 → ISO8601 변환
  formatters/
    table.ts                # 테이블 / json / quiet 출력
  commands/
    logncrash/
      search.ts             # nhncloud logncrash search
```

## 레이어 의존 방향

```
commands → services/<svc>/client → api/envelope + api/endpoints + config/credentials
                                  ↘ utils, formatters
```

역류 금지 — `services` 가 `commands` 를 import 하지 않는다.

## 인증·엔드포인트 추상화 (dooray 대비 신규 계층)

dooray-cli 는 단일 `config + client` 로 충분했지만, NHN Cloud 는 서비스마다 인증·엔드포인트가 달라 계층을 하나 더 둔다.

- `config/credentials.ts` — profile 해석 후 서비스 자격증명 블록 반환 ([[adr-004]])
- `api/endpoints.ts` — 서비스명 → 엔드포인트 (gov 분기는 후속, [[adr-005]])
- `api/envelope.ts` — `{ header, body }` 봉투 검사, `resultCode` 타입 혼재 흡수 ([[adr-006]])
- 각 `services/<svc>/client.ts` — 위 셋을 조합해 서비스 고유 헤더(`X-LNCS-SECRET` 등) 부착

## 커맨드 실행 흐름 (예: `nhncloud logncrash search`)

1. `index.ts` 가 전역 옵션 처리 (`--json`/`--quiet`/`--no-color`)
2. `search.ts` 가 `--from`/`--to` 를 `utils/time.ts` 로 ISO8601 정규화
3. `credentials.ts` 로 profile 의 `logncrash` 블록 로드 (없으면 `EXIT_CONFIG_ERROR`)
4. `LogncrashClient.search()` 호출 — `api/endpoints` 엔드포인트 + `X-LNCS-SECRET` 헤더
5. `api/envelope.ts` 가 봉투 unwrap, 실패 시 `NhnCloudCliError`
6. `formatters/table.ts` 가 모드별 출력 (데이터=stdout)

## 에러 처리 원칙

- 모든 에러는 `NhnCloudCliError(message, exitCode)` 로 통일.
- HTTP 에러는 `api/httpError.ts` 에서 status → exit code 매핑 (401/403 = AUTH, 그 외 = API).
- 데이터는 stdout, 스피너·에러는 stderr.

## 빌드·배포

- `pnpm run build` — tsup 단일 번들 (`dist/index.js`)
- `pnpm tsc --noEmit` — 타입 체크 (tsup/vitest 는 type-check 스킵)
- bin: `nhncloud`
