# Phase 01 — NCS 기반 + template list

## 목표

NCS endpoint/client 골격을 추가하고, 최소 읽기 명령 `nhncloud ncs template list` 를 동작시킨다.

- 검증: `pnpm tsc --noEmit`, `pnpm run build`, `pnpm test`.
- help 검증: `node dist/index.js ncs --help` stdout 에 `template` 이 포함된다.
- help 검증: `node dist/index.js ncs template list --help` stdout 에 `list` 가 포함된다.
- 자격증명 가능 시 실측: `node dist/index.js ncs template list --json` 이 200 응답을 반환한다.

## 선행

구현 전 `docs/adr/020-ncs-container-service-api.md` 를 반드시 읽는다.

핵심 요약(본문 상세는 ADR 참조):

- 인증은 Deploy 와 같은 UAK OAuth Bearer 토큰이다. `src/api/oauth.ts` 의 `getAccessToken(profile, uakId, uakSecret)` 를 그대로 재사용한다.
  헤더는 `x-nhn-authorization: Bearer <token>` (대소문자 무시 — 소문자로 작성해도 무방).
- endpoint 는 region 별 `{region}-ncs.api.nhncloudservice.com` + base path `/ncs/v1.0` 이다.
  region 은 `kr1`·`kr3` 만 지원한다(공식 docs 근거, `kr2`·`jp1` 없음).
- appkey 는 경로 `/ncs/v1.0/appkeys/{appKey}/...` 에 포함한다.
  profile 의 `ncs` 자격증명 블록(`ServiceCredential.appkey`) 또는 `--app-key` override 로 해석한다.
- 응답은 NHN 공통 `{ header, body }` 봉투이고 `header.resultCode` 는 숫자다. `src/api/envelope.ts` 의 unwrap 을 사용한다(ADR-006).
  모든 API 가 HTTP 200 으로 응답하고 성공/실패는 header 로만 판별한다.

공식 API 기준: <https://docs.nhncloud.com/ko/Container/NCS/ko/public-api/>

## 구현 항목

### 1. endpoint

- `src/api/endpoints.ts`
  - `NCS_HOST` 맵 추가: `kr1`, `kr3`.
  - `ncsHost(region)` 추가. 미등록 region 은 `EXIT_PARAM_ERROR` (ncr 의 `ncrHost` 패턴 참고).

### 2. NCS service

- `src/services/ncs/types.ts`
  - Phase 1 최소 타입: `NcsTemplateSummary` (id, name 등 template list 응답 필드).
  - 응답 가드: `templates` 또는 목록 배열 필드(공식 docs 예제 JSON 으로 실측 후 확정 — 추측 금지).
- `src/services/ncs/client.ts`
  - constructor: `accessToken`, `region`, `appKey`.
  - base URL: `https://${ncsHost(region)}/ncs/v1.0/appkeys/${appKey}`.
  - 공통 header: `x-nhn-authorization: Bearer ${accessToken}`.
  - `listTemplates(query?: { page?: number; size?: number; disableContainers?: boolean })`: `GET /templates`.
  - 응답은 `unwrap` 으로 봉투를 벗긴다(ADR-006).
  - `retry: 0`, `timeout: 30_000`.
  - HTTP 에러는 `toNhnCloudCliError`.

### 3. command

- `src/commands/ncs/helpers.ts`
  - `resolveNcsClient({ profile, region, appKeyOpt })`.
    - profile 해석 → `getUserAccessKey` 로 UAK 로드 → `getAccessToken(profile, uak.id, uak.secret)` 로 토큰 획득.
    - appKey 는 `--app-key` > profile 의 `ncs` 블록 `appkey` 순으로 해석 (ncr 의 `resolveAppKey` 패턴 참고, 없으면 `EXIT_CONFIG_ERROR` + 설정 안내).
    - region 기본값 `kr1`.
    - spinner 시작 *전* (파라미터 검증·자격증명 로드 단계) 에 호출한다.
- `src/commands/ncs/template.ts`
  - `template` subcommand container 생성.
  - `list` 만 Phase 1에서 구현.
  - 기본 table 컬럼은 공식 docs 예제 JSON 기준으로 확정한다(id·name 등).
- `src/index.ts`
  - `ncs` command group 등록 (`template` subcommand 만 우선 연결).

### 4. tests

- `src/services/ncs/client.test.ts`
  - `listTemplates()` 봉투 성공 케이스.
  - `x-nhn-authorization` header 포함 단언.
  - HTTP 401/403 mock 은 `toNhnCloudCliError` 매핑(EXIT_AUTH_ERROR) 유지.
  - HTTP 4xx(그 외) 는 `EXIT_API_ERROR`.

### 5. task 상태

- `tasks/036-feat-ncs-foundation-read/index.json` 에서 Phase 1 `status` 를 `completed` 로, `current_phase` 를 `2` 로 갱신한다.

## 회피 항목

- `grep -rnE "exitCode\s*===\s*EXIT_PARAM_ERROR" src/commands/ncs src/services/ncs` → 0건.
- `grep -rnE "NhnCloudCliError\([^,]+,\s*[0-9]+" src/services/ncs src/commands/ncs` → 0건(exitCode 는 항상 `EXIT_*` 상수).
- `grep -nE "startSpinner" src/commands/ncs/*.ts` → spinner 가 있다면 resolver·param 검증 뒤에 위치.
- `grep -nE "\.get\([^)]+\)!" src/services/ncs src/commands/ncs` → 0건.
- `grep -nE "as unknown as " src/services/ncs src/commands/ncs` → 0건.

## 완료 조건

1. `pnpm tsc --noEmit` 0.
2. `pnpm run build` 정상.
3. `pnpm test` 정상.
4. `node dist/index.js ncs --help` stdout 에 `template` 이 포함된다.
5. `node dist/index.js ncs template list --help` stdout 에 `list` 가 포함된다.
6. index.json 은 Phase 2 대기 상태로 갱신.

## 변경 파일 (정확)

- `src/api/endpoints.ts`
- `src/services/ncs/types.ts`
- `src/services/ncs/client.ts`
- `src/services/ncs/client.test.ts`
- `src/commands/ncs/helpers.ts`
- `src/commands/ncs/template.ts`
- `src/index.ts`
- `tasks/036-feat-ncs-foundation-read/index.json`

## 커밋

```bash
git commit -m "feat(ncs): add base client and template list command"
```
