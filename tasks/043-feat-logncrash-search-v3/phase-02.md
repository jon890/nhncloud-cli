# Phase 02 — 검색·내보내기·설정 흐름 전환

**Execution profile**: standard
**Status**: pending

---

## 목표

기존 `logncrash search`·`export` 사용자 흐름을 v3 client에 연결하고,
`configure`가 서비스 secret 대신 appkey와 profile 공통 UAK를 사용하도록 전환한다.

**범위 외**: 새 command path, endpoint 선택 옵션, 토큰 재시도 정책, 공개 사용자 문서, `send` 명령은 변경하지 않는다.

---

## 선행 조건

Phase 1이 만든 아래 파일과 메서드를 전제로 한다.

- `src/commands/logncrash/helpers.ts`의 `resolveLogncrashClient(profile?)`.
- `LogncrashClient.cursorSearch`, v3 `scrollStart`, v3 `scrollNext`.
- `CursorSearchResult.nextCursor?`, `ScrollResult.pageSize?`.

선행 파일이나 메서드가 없으면 `PHASE_BLOCKED: Phase 1 v3 client 산출물 필요`를 보고한다.

---

## 작업 항목 (4)

### 1. search 커서 페이지 이동

`src/commands/logncrash/search.ts`를 아래 계약으로 바꾼다.

- `--cursor <value>`를 추가한다. 빈 문자열은 입력 오류로 거부한다.
- `--size`는 기존 1~100 검증을 유지하고 v3 `pageSize`로 전달한다.
- `--page`는 전환 호환용으로 유지한다. 기본값은 0이며 `0` 이외 값은 `EXIT_PARAM_ERROR`로 거부하고 `--cursor` 사용을 안내한다.
- 모든 입력·시간 범위·page·size·cursor 검증을 profile·UAK·token·spinner보다 먼저 끝낸다.
- `resolveLogncrashClient(opts.profile)`로 client를 얻고 `cursorSearch`를 호출한다.
- table·quiet 출력 열은 유지한다.
- JSON raw는 `totalItems`, `pageNumber`, `pageSize`, `data`를 유지하고 다음 페이지가 있을 때만 `nextCursor`를 포함한다.
- spinner 시작 이후의 client 오류는 기존처럼 `stopSpinner(false)` 후 다시 던진다.

`src/commands/logncrash/search.test.ts`를 추가한다.

- `--page 1`과 빈 cursor는 자격증명·token·spinner·API 호출 전에 실패한다.
- 첫 페이지는 cursor를 생략하고, 다음 페이지는 opaque 값을 변형 없이 전달한다.
- JSON 결과의 조건부 `nextCursor`와 기존 table·quiet 식별 값을 고정한다.

### 2. export v3 scroll 연결과 호환 경고

`src/commands/logncrash/export.ts`에서 appkey·secret 직접 로딩을 제거하고
`resolveLogncrashClient(opts.profile)`를 사용한다.

- `scrollStart`에는 `query`·`from`·`to`만 전달한다.
- 기존 `--size`는 옵션을 명시했을 때만 10~100 정수 검증 후 stderr에 폐기 예정 경고를 한 번 출력한다.
- `--size` 값은 v3 요청에 넣지 않는다. Commander 기본값도 두지 않아 옵션 생략과 명시를 구분한다.
- scroll 계속 응답에 `pageSize`가 없어도 순회한다.
- 다음 페이지 오류 메시지는 원인을 보존하고 검색 범위를 좁혀 재실행하도록 안내한다.
- v3에 근거 없는 1분 TTL과 `--size`로 만료를 피한다는 문구는 제거한다.
- 임시 파일·원자적 rename·10만 건 안전 상한·stdout/stderr 계약은 유지한다.

`src/commands/logncrash/export.test.ts`를 추가한다.

- `--size` 생략 시 경고가 없고 scroll body에도 size가 없음을 확인한다.
- `--size 100`은 경고하지만 body에 넣지 않고, 범위 밖 값은 자격증명·파일·API 전에 실패한다.
- `pageSize` 없는 다음 응답과 빈 data 종료를 처리하는지 확인한다.
- 실패 시 임시 파일을 정리하고 원본 오류를 메시지에 보존하는지 고정한다.

### 3. configure appkey + 공통 UAK 전환

`src/commands/configure.ts`의 통합 표면을 함께 변경한다.

- 대화형 logncrash 단계는 appkey만 입력받고 `{ appkey }`를 저장한다.
- 비대화형 `--logncrash-appkey`는 secret 없이 단독 서비스 값으로 인식한다.
- 새 UAK flag가 없고 기존 profile에 UAK가 있으면 canonical `getUserAccessKey(profileName)`로 읽어 검증에 사용한다.
- UAK가 새 값과 기존 값 모두 없으면 logncrash 검증을 건너뛰지 말고 `EXIT_CONFIG_ERROR`로 종료한다.
- `--logncrash-secret`은 이번 전환에서 command option과 `hasFlag`에 남긴다.
  값이 있으면 stderr에 폐기 예정·미저장 경고를 한 번 출력하고 값은 자격증명 객체에 넣지 않는다.
- `NHNCLOUD_LOGNCRASH_SECRET`은 더 읽거나 안내하지 않는다.
- 비대화형 빈 입력 가드, `hasFlag`, `saveAndVerify` 시그니처와 모든 호출처, 오류 문구를 함께 맞춘다.
- `src/config/credentials.ts`의 초기 설정 예시는 `logncrash: { appkey: "<appkey>" }`로 고친다.
  서비스 자격증명 누락 오류의 공통 예시도 appkey-only로 바꿔 검색 secret을 다시 안내하지 않게 한다.

`src/commands/configure-verify.ts`의 실제 시그니처를 아래처럼 바꾼다.

```ts
verifyLogncrash(uak: UserAccessKey, appkey: string): Promise<boolean>
```

`getAccessToken("__verify__", uak.id, uak.secret, true)`로 cache 읽기·쓰기를 모두 우회한 뒤
v3 커서 검색을 1건 호출한다.
401·403만 `false`, 그 밖의 오류는 다시 던지는 기존 정책을 유지한다.

### 4. configure 회귀 테스트와 상태 갱신

`src/commands/configure-verify.test.ts`에 logncrash 검증을 추가한다.

- OAuth token 발급과 v3 검색 성공은 `true`다.
- cache 우회 인수 `forceRefresh=true`를 실제 호출로 확인한다.
- OAuth 또는 검색의 401·403은 `false`, 5xx는 원형 오류를 다시 던진다.

`src/commands/configure.test.ts`를 추가한다.

- `--logncrash-appkey`만으로 비대화형 분기에 들어가고 저장 값에 secret이 없다.
- 새 UAK flag와 기존 profile UAK 두 경로를 검증한다.
- `--logncrash-secret` 경고가 실제 미저장 동작과 일치한다.
- UAK가 없으면 저장·검색 전에 설정 오류가 난다.
- UAK·logncrash·NCR·NCS·IaaS 기존 고정 위치 인자가 밀리지 않는지 확인한다.

Phase 2를 `completed`, `current_phase`를 `3`으로 갱신한다.
task 상태 파일은 Phase 4의 실행 기록 커밋까지 작업 트리에 유지한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/commands/logncrash/search.ts` | cursor 옵션·v3 검색·출력 |
| `src/commands/logncrash/search.test.ts` | 입력 선검증·cursor·출력 테스트 |
| `src/commands/logncrash/export.ts` | v3 scroll·size 호환 경고·오류 안내 |
| `src/commands/logncrash/export.test.ts` | scroll 순회·파일 정리·경고 테스트 |
| `src/commands/configure.ts` | appkey + UAK 설정·deprecated secret 처리 |
| `src/commands/configure.test.ts` | 대화형·비대화형 통합 표면 테스트 |
| `src/commands/configure-verify.ts` | cache 우회 v3 검증 |
| `src/commands/configure-verify.test.ts` | token·검색 검증 분기 테스트 |
| `src/config/credentials.ts` | appkey-only 설정 예시 |
| `tasks/043-feat-logncrash-search-v3/index.json` | phase 상태 갱신 |

## 검증

```bash
# cwd: <repo root>
set -e
pnpm tsc --noEmit
pnpm test -- \
  src/services/logncrash/client.test.ts \
  src/commands/logncrash/helpers.test.ts \
  src/commands/logncrash/search.test.ts \
  src/commands/logncrash/export.test.ts \
  src/commands/configure.test.ts \
  src/commands/configure-verify.test.ts
test "$(rg -n 'X-LNCS-SECRET|/api/v2/search|scrollKey 만료\(유효 1분\)' src || true)" = ""
test "$(rg -n 'NHNCLOUD_LOGNCRASH_SECRET|<secretkey>|appkey / secret|logncrash (search|scroll) 에는 secret|자격증명에 secret 이 없습니다' \
  src README.md skills docs AGENTS.md || true)" = ""
git diff --check
```

성공 기준은 네 명령의 종료 코드가 0이고,
잘못된 page·cursor·size와 UAK 누락 테스트에서 자격증명·spinner·API 부작용 호출 수가 0인 것이다.

## Blocked 조건

- 기존 profile UAK를 읽기 위해 새 credentials parser가 필요하면 canonical loader 재사용 원칙과 충돌하므로 차단한다.
- deprecated secret 경고와 실제 저장 동작을 같은 테스트로 고정할 수 없으면 통합 표면 분리가 필요하므로 차단한다.
- `--logncrash-secret` option 자체와 폐기 예정 안내는 의도된 전환 호환 예외다. 검색 secret을 다시 요구하는 근거로 사용하지 않는다.
- export command 테스트가 실제 사용자 파일을 덮어써야만 가능하면 테스트 격리 설계를 다시 검토한다.
