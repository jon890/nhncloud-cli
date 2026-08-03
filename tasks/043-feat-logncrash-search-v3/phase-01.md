# Phase 01 — v3 API 클라이언트와 공통 UAK 인증

**Execution profile**: standard
**Status**: pending

---

## 목표

Log & Crash 검색 클라이언트를 공식 v3 커서·scroll 경로와 UAK OAuth Bearer 인증으로 전환한다.
검색과 내보내기가 Deploy·NCS의 공통 user-access-token 캐시를 재사용하도록 명령 공용 해석기를 만든다.

**범위 외**: Commander 옵션, `configure` 입력 흐름, 공개 사용자 문서는 다음 phase에서 변경한다.
`logncrash send`, BETA·ALPHA host, 일반 검색·available-token·Symbol API는 바꾸거나 추가하지 않는다.

---

## 실행 전제

구현 전 현재 브랜치와 최신 공개 v3 명세를 확인한다.
branch 갱신, worktree 생성, commit·push는 `build-with-teams` team-lead 책임이다.
executor는 현재 실행 경로에서 선행 관계만 검사하고 직접 history를 바꾸지 않는다.

```bash
# cwd: <repo root>
set -e
test "$(git branch --show-current)" = "feat/043-feat-logncrash-search-v3"
git fetch origin
git merge-base --is-ancestor origin/main HEAD
test -f docs/adr/024-logncrash-search-v3.md
git log origin/main --oneline -20 -- \
  src/services/logncrash src/commands/logncrash \
  src/commands/configure.ts src/commands/configure-verify.ts \
  src/api/oauth.ts src/cache/token-store.ts
```

공식 공개 OpenAPI가 계획 당시 계약을 유지하는지 기계적으로 확인한다.

```bash
# cwd: <repo root>
set -e
lncs_spec_file="$(mktemp)"
trap 'rm -f "$lncs_spec_file"' EXIT
curl -fsSL --max-time 30 \
  https://api-lncs-search.alpha-nhncloudservice.com/v3/lncs-api-gateway/openapi-public.yaml \
  -o "$lncs_spec_file"
grep -F '/v3/{appkey}/logs/cursor:' "$lncs_spec_file"
grep -F '/v3/{appkey}/logs/scroll:' "$lncs_spec_file"
grep -F '/v3/{appkey}/logs/scroll/{scrollKey}:' "$lncs_spec_file"
grep -F 'name: "X-NHN-Authorization"' "$lncs_spec_file"
grep -F 'CursorSearchRequest:' "$lncs_spec_file"
grep -F 'nextCursor:' "$lncs_spec_file"
```

`origin/main`이 선행 관계가 아니면
`PHASE_BLOCKED: team-lead의 최신 main 반영 필요`를 보고한다.
경로·헤더·스키마가 달라졌거나 공개 명세를 받을 수 없으면
`PHASE_BLOCKED: Log & Crash Search v3 공개 계약 재확인 필요`를 보고하고 추측 구현을 중단한다.

---

## 확정 계약

- 단일 소스는 `docs/adr/024-logncrash-search-v3.md`와 공식 공개 OpenAPI다.
- host는 기존 `endpointFor("logncrash")`가 반환하는 공개 REAL host를 유지한다.
- 읽기 요청 헤더는 `X-NHN-Authorization: Bearer <token>`이다.
- 커서 검색 경로는 `POST /v3/{appkey}/logs/cursor`다.
- scroll 시작 경로는 `POST /v3/{appkey}/logs/scroll`이며 요청 body는 `query`·`from`·`to`만 보낸다.
- scroll 계속 경로는 `POST /v3/{appkey}/logs/scroll/{scrollKey}`이며 body를 보내지 않는다.
- 응답은 숫자 `resultCode`를 가진 `{ header, body }` 봉투라 기존 `unwrap`을 재사용한다.
- UAK 토큰은 실제 시그니처 `getAccessToken(profile, uakId, uakSecret, forceRefresh?)`를 그대로 호출한다.
- 새 dependency, endpoint 설정, cache 파일, credentials schema version을 추가하지 않는다.

---

## 작업 항목 (4)

### 1. v3 요청·응답 타입

`src/services/logncrash/types.ts`를 공식 공개 OpenAPI에 맞춘다.

- `CursorSearchParams`: `query`, `from`, `to`, 선택 `pageSize`, 선택 `cursor`.
- `CursorSearchResult`: `totalItems`, `pageNumber`, `pageSize`, `data`, 선택 `nextCursor`.
- `ScrollStartParams`: `query`, `from`, `to`만 포함한다.
- `ScrollResult.pageSize`는 scroll 계속 응답에서 빠질 수 있으므로 선택 필드로 바꾼다.
- `LogSendParams`와 `LogLevel`은 그대로 유지한다.

`nextCursor`는 문자열이거나 생략된 값만 다루고 클라이언트에서 decode·변형하지 않는다.
공개 OpenAPI의 `sort`는 선택 필드지만 2026년 8월 3일 REAL API 실측에서
생략 시 HTTP 500, `{ "logTime": "DESC" }` 전달 시 HTTP 200과 `nextCursor` 반환을 확인했다.
따라서 CLI 옵션으로 노출하지 않고 클라이언트가 모든 커서 요청에
`sort: { "logTime": "DESC" }`를 고정해서 보낸다.
client 테스트는 첫 페이지와 다음 페이지 요청 body의 고정 정렬을 단언한다.

### 2. LogncrashClient v3 전환

`src/services/logncrash/client.ts`의 생성자를 다음 계약으로 바꾼다.

```ts
constructor(appkey: string, accessToken?: string)
```

- `cursorSearch(params: CursorSearchParams): Promise<CursorSearchResult>`를 추가하고 기존 v2 `search`를 제거한다.
- `scrollStart(params: ScrollStartParams): Promise<ScrollResult>`와 `scrollNext(scrollKey: string): Promise<ScrollResult>`를 v3 경로로 바꾼다.
- 세 읽기 메서드는 access token 누락을 `EXIT_CONFIG_ERROR`로 거부하고 같은 Bearer 헤더를 쓴다.
- `pageSize`와 `cursor`는 값이 있을 때만 body에 넣고, 고정 `sort`는 항상 넣는다.
- POST 오류는 기존 `toNhnCloudCliError`를 그대로 거친다.
- `send()`는 collector host·payload·무인증 헤더·봉투 판정을 변경하지 않는다.

### 3. 공용 client 해석기

`src/commands/logncrash/helpers.ts`를 새로 만들고 다음 실제 시그니처를 구현한다.

```ts
resolveLogncrashClient(profile?: string): Promise<LogncrashClient>
```

해석 순서는 아래와 같다.

1. `resolveProfileName(profile)`로 profile을 확정한다.
2. `getServiceCredential("logncrash", profileName)`에서 appkey를 읽고 없으면 `EXIT_CONFIG_ERROR`로 종료한다.
3. `getUserAccessKey(profileName)`로 공통 UAK를 읽는다.
4. `getAccessToken(profileName, uak.id, uak.secret)`로 공통 cache를 재사용한다.
5. appkey와 token으로 `LogncrashClient`를 반환한다.

새 자격증명 loader나 catch-all fallback을 만들지 않는다.
검색·내보내기에서 이 helper를 공유하고 `send`는 appkey만 필요하므로 사용하지 않는다.

### 4. client·helper 회귀 테스트와 상태 갱신

`src/services/logncrash/client.test.ts`를 추가한다.

- 커서 검색 URL·Bearer 헤더·첫 페이지와 다음 cursor의 정확한 JSON body를 단언하고
  `sort: { "logTime": "DESC" }` 고정 전달을 확인한다.
- scroll 시작 body에 `pageSize`가 없고, 계속 요청은 body가 없음을 단언한다.
- 숫자 성공 봉투 unwrap과 실패 봉투 오류를 고정한다.
- `send`가 collector v2 경로, appkey payload, 무인증 헤더를 유지하는지 고정한다.

`src/commands/logncrash/helpers.test.ts`를 추가한다.

- profile → appkey·UAK → OAuth token → client 순서를 고정한다.
- appkey와 UAK 누락은 API와 spinner 호출 전에 `EXIT_CONFIG_ERROR`인지 확인한다.
- canonical loader 오류를 빈 설정으로 삼키지 않는지 확인한다.

Phase 1을 `completed`, `current_phase`를 `2`로 갱신한다.
task 상태 파일은 Phase 4의 실행 기록 커밋까지 작업 트리에 유지한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/services/logncrash/types.ts` | v3 cursor·scroll 요청과 응답 타입 |
| `src/services/logncrash/client.ts` | v3 경로·Bearer 인증, collector 회귀 보존 |
| `src/services/logncrash/client.test.ts` | URL·헤더·body·봉투 단위 테스트 |
| `src/commands/logncrash/helpers.ts` | appkey·UAK·공통 OAuth cache 해석 |
| `src/commands/logncrash/helpers.test.ts` | 자격증명·cache 해석 테스트 |
| `tasks/043-feat-logncrash-search-v3/index.json` | phase 상태 갱신 |

## 검증

```bash
# cwd: <repo root>
set -e
pnpm tsc --noEmit
pnpm test -- \
  src/services/logncrash/client.test.ts \
  src/commands/logncrash/helpers.test.ts
test "$(rg -n 'X-LNCS-SECRET|/api/v2/search' \
  src/services/logncrash src/commands/logncrash || true)" = ""
git diff --check
```

성공 기준은 네 명령의 종료 코드가 0이고,
client 테스트가 v3 URL·Bearer 헤더·요청 body와 collector 무변경을 모두 단언하는 것이다.

## Blocked 조건

- 공개 OpenAPI가 위 경로·헤더·필드와 다르면 추측 구현하지 않는다.
- 기존 `getAccessToken`을 재사용하려면 cache schema를 바꿔야 한다면 scope 확장이므로 차단한다.
- `send` 회귀를 피하려면 collector 계약을 바꿔야 한다면 ADR-014와 충돌하므로 차단한다.
