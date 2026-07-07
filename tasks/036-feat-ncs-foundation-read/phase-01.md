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
- 응답은 NHN 공통 봉투이고 `header.resultCode` 는 숫자다. 성공/실패는 header 로만 판별한다(모든 API HTTP 200, ADR-006).
- **봉투 형태 확정 (구현 첫 단계, 추측 금지)**: 데이터가 `body` 로 래핑되는지, NCR 처럼 named 필드(`templates`/`template` 식)로 오는지 먼저 확정한다.
  - 확정 방법: 공식 docs 예제 JSON 인용, 또는 자격증명 가능 시 실측(`node dist/index.js ncs template list --json` raw 응답 확인).
  - **기본 패턴은 NCR** (`src/services/ncr/client.ts:63,95`) — Container 계열·appkey 경로임에도 `body` 가 아니라 named 필드라 `unwrap`(body 필수, 없으면 throw) 대신 `unwrapHeader` + 필드 가드(`Array.isArray(res.templates)`)를 쓴다.
  - 실측/docs 가 `body` 래핑을 명확히 보일 때만 `unwrap` 으로 전환한다. 확정 전에는 `unwrapHeader` + named 필드로 작성한다.

공식 API 기준: <https://docs.nhncloud.com/ko/Container/NCS/ko/public-api/>

## 구현 항목

### 1. endpoint

- `src/api/endpoints.ts`
  - `NCS_HOST` 맵 추가: `kr1`, `kr3`.
  - `ncsHost(region)` 추가. 미등록 region 은 `EXIT_PARAM_ERROR` (ncr 의 `ncrHost` 패턴 참고).

### 2. NCS service

- `src/services/ncs/types.ts`
  - Phase 1 최소 타입: `NcsTemplateSummary` (id, name 등 template list 응답 필드).
  - 응답 가드: `templates` 또는 목록 배열 필드(공식 docs 예제 JSON 으로 실측 후 확정 — 추측 금지). `isTemplate` 타입 가드로 `filter` (NCR `isRegistry` 패턴).
- `src/services/ncs/client.ts`
  - constructor: `accessToken`, `region`, `appKey`.
  - base URL: `https://${ncsHost(region)}/ncs/v1.0/appkeys/${appKey}`.
  - 공통 header: `x-nhn-authorization: Bearer ${accessToken}`.
  - `listTemplates(query?: { page?: number; size?: number; disableContainers?: boolean })`: `GET /templates`.
  - 응답은 확정한 봉투 형태에 맞춰 `unwrapHeader`(+named 필드 가드) 또는 `unwrap` 으로 벗긴다(위 "봉투 형태 확정" 참조, ADR-006).
  - **pagination 확인**: NCS 목록 응답의 기본 page size·`totalCount`(또는 총계 필드) 노출 여부를 docs 예제/실측으로 확인한다. 기본 호출이 앞부분만 조용히 반환(silent truncation)하지 않는지 검증하고, `page`/`size` 옵션으로 수동 페이징이 가능하도록 노출한다(ncr images/tags PR28 MAJOR 재발 방지).
  - `retry: 0`, `timeout: 30_000`.
  - HTTP 에러는 `toNhnCloudCliError`.

### 3. command

- `src/commands/ncs/helpers.ts`
  - `resolveNcsClient({ profile, region, appKeyOpt })`.
    - profile 해석 → `getUserAccessKey` 로 UAK 로드 → `getAccessToken(profile, uak.id, uak.secret)` 로 토큰 획득.
    - appKey 는 `--app-key` > profile 의 `ncs` 블록 `appkey` 순으로 해석 (ncr 의 `resolveAppKey` 패턴 참고, 없으면 `EXIT_CONFIG_ERROR` + 설정 안내).
    - **안내 메시지 주의 (존재하지 않는 flag 금지)**: `configure` 마법사는 아직 ncs 를 지원하지 않는다(`src/commands/configure.ts` 에 ncs 블록 없음). ncr helpers 의 `nhncloud configure --ncr-appkey` 문구를 복사하면 **존재하지 않는 `--ncs-appkey`** 를 안내하게 된다. NCS 는 `--app-key <key>` 옵션으로 넘기거나 `~/.nhncloud/credentials.json` 의 `profiles.<profile>.ncs.appkey` 를 수기 편집하도록 안내한다.
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
