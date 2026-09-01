# Phase 01: 서비스 appkey resolver 공통화

**Execution profile**: standard

---

## 목표

NCR, NCS, API Gateway와 Deploy에 복제된 appkey 조회와 필수값 검증을 공통 resolver로 모은다.
서비스 블록이나 appkey가 없을 때는 기존 서비스별 설정 안내와 종료 코드 4를 유지한다.
자격증명 파일 손상과 존재하지 않는 profile은 공통 resolver가 가리지 않고 원래 오류를 전달한다.

**범위 외**: 명령·인수·옵션, HTTP 요청, 인증 순서, 자격증명 JSON 스키마, 기존 오류 문구, 종료 코드, stdout·stderr와 spinner 동작은 바꾸지 않는다.
Log & Crash의 appkey 조회는 서비스별 secret 처리와 호출 흐름이 달라 이번 공통화에 포함하지 않는다.
`docs/flow.md`, `docs/code-architecture.md`, `docs/data-schema.md`는 planning의 문서 우선 커밋 `18ebfab`에서 갱신됐다.
이 phase에서는 관리 문서를 다시 편집하지 않는다.

---

## 작업 항목 (4)

### 1. 서비스 블록 부재를 구분하는 config 조회 함수를 추가한다

`src/config/credentials.ts`에 다음 함수를 추가한다.

```typescript
getOptionalServiceCredential(
  service: string,
  profileName: string,
): Promise<ServiceCredential | undefined>
```

기존 `loadCredentials()`와 profile 조회를 재사용한다.
자격증명 파일 부재·파싱 오류와 profile 부재는 기존 `NhnCloudCliError`를 그대로 던지고,
profile은 있지만 `profiles.<profileName>.<service>` 블록만 없으면 `undefined`를 반환한다.
`userAccessKey`와 `iaas` 거부 규칙도 기존 `getServiceCredential`과 같게 유지한다.

`getServiceCredential`은 이 함수를 재사용하되 서비스 블록이 없을 때 현재의 일반 설정 안내를 계속 던진다.
별도 JSON 로더나 오류 메시지 문자열 비교는 추가하지 않는다.

### 2. 명령 공통 appkey resolver를 만든다

`src/commands/service-appkey.ts`에 다음 함수를 추가한다.

```typescript
resolveServiceAppKey(
  service: string,
  profileName: string,
  missingMessage: string,
): Promise<string>
```

`getOptionalServiceCredential`의 결과에 비어 있지 않은 `appkey`가 있으면 반환한다.
서비스 블록이 없거나 `appkey`가 `undefined` 또는 빈 문자열이면
`missingMessage`와 `EXIT_CONFIG_ERROR`를 가진 `NhnCloudCliError`를 던진다.
config 조회를 `try/catch`로 감싸지 않아 파일 손상과 profile 부재 오류를 원인과 객체까지 그대로 전달한다.

### 3. 네 서비스 helper의 중복 구현을 위임으로 바꾼다

다음 기존 export 이름과 서비스별 오류 문구는 유지하고, 함수 본문만 `resolveServiceAppKey` 호출로 바꾼다.

- `src/commands/ncr/helpers.ts`: `resolveAppKey`와 서비스 키 `ncr`
- `src/commands/ncs/helpers.ts`: `resolveNcsAppKey`와 서비스 키 `ncs`
- `src/commands/apigateway/helpers.ts`: `resolveApiGatewayAppKey`와 서비스 키 `apigateway`
- `src/commands/deploy/helpers.ts`: `resolveDeployAppKey`와 서비스 키 `deploy`

기존 command 호출부와 client 생성 순서는 바꾸지 않는다.
Deploy resolver를 단독 호출해도 파일 손상과 profile 부재를 가리지 않으므로
안전성이 `createDeployClient` 선행 호출에 의존한다는 주석은 제거한다.
각 helper에서 더는 쓰지 않는 `getServiceCredential`, `EXIT_CONFIG_ERROR`와 관련 import만 정리한다.

### 4. config 경계와 네 서비스 회귀를 테스트한다

`src/config/credentials.test.ts`에 `getOptionalServiceCredential` 테스트를 추가한다.
기존 임시 home 구조에 `credentials.json` 작성 helper를 더해 다음을 검증한다.

- 서비스 블록이 있으면 값을 반환한다.
- profile은 있고 서비스 블록만 없으면 `undefined`를 반환한다.
- profile이 없으면 기존 profile 오류와 종료 코드 4를 보존한다.
- JSON이 손상됐으면 기존 파싱 오류와 종료 코드 4를 보존한다.
- `getServiceCredential`의 서비스 블록 누락 오류 문구는 유지된다.

`src/commands/service-appkey.test.ts`를 추가해 정상 appkey, 서비스 블록 부재,
`undefined`·빈 문자열 appkey, config 조회 오류 객체 보존을 검증한다.
NCR, NCS, API Gateway와 Deploy의 기존 wrapper가 올바른 서비스 키와 기존 설정 안내를 사용한다는 회귀도 고정한다.

`src/commands/deploy/commands.test.ts`의 config mock을 `getOptionalServiceCredential` 경계에 맞춰 갱신한다.
기존 Deploy resolver 테스트의 성공, 누락 안내와 다른 오류 객체 보존 기대값은 유지한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/config/credentials.ts` | 수정: 서비스 블록 부재만 `undefined`로 구분하는 조회 경계 추가 |
| `src/config/credentials.test.ts` | 수정: 서비스 블록, profile과 파일 오류 구분 테스트 추가 |
| `src/commands/service-appkey.ts` | 추가: 네 서비스 공통 appkey 필수값 resolver |
| `src/commands/service-appkey.test.ts` | 추가: 공통 resolver와 서비스별 wrapper 회귀 테스트 |
| `src/commands/ncr/helpers.ts` | 수정: `resolveAppKey`를 공통 resolver에 위임 |
| `src/commands/ncs/helpers.ts` | 수정: `resolveNcsAppKey`를 공통 resolver에 위임 |
| `src/commands/apigateway/helpers.ts` | 수정: `resolveApiGatewayAppKey`를 공통 resolver에 위임 |
| `src/commands/deploy/helpers.ts` | 수정: `resolveDeployAppKey`를 공통 resolver에 위임하고 호출 순서 의존 주석 제거 |
| `src/commands/deploy/commands.test.ts` | 수정: config mock을 새 조회 경계에 맞춤 |
| `tasks/068-extract-service-appkey-resolver/index.json` | 수정: 검증 완료 뒤 task 상태를 `completed`로 변경 |

## 검증

```bash
# cwd: <레포 루트>
pnpm vitest run src/config/credentials.test.ts src/commands/service-appkey.test.ts src/commands/deploy/commands.test.ts
pnpm tsc --noEmit
pnpm test
pnpm run build
node dist/index.js commands --json
git diff --check
```

모든 명령은 종료 코드 0이어야 하고 전체 테스트와 명령 카탈로그 170개가 유지돼야 한다.

중복 제거와 오류 삼킴 제거도 확인한다.

```bash
# cwd: <레포 루트>
test "$(rg -l 'getServiceCredential\("(ncr|ncs|apigateway|deploy)"' src/commands/{ncr,ncs,apigateway,deploy}/helpers.ts | wc -l | tr -d ' ')" -eq 0
test "$(rg -l 'resolveServiceAppKey' src/commands/{ncr,ncs,apigateway,deploy}/helpers.ts | wc -l | tr -d ' ')" -eq 4
! rg -n 'createDeployClient.*선행|앞 줄 호출 순서|안전성이.*의존' src/commands/deploy/helpers.ts
```

세 검사는 모두 종료 코드 0이어야 한다.

마지막으로 `tasks/068-extract-service-appkey-resolver/index.json`의 `status`를 `completed`로 바꾸고,
`current_phases`를 `1`로 유지한다.
phase 파일과 `phases` 배열은 같은 커밋에서 일치해야 한다.

## 의도 메모

- 서비스 블록 부재만 선택적으로 반환하면 메시지 문자열이나 같은 종료 코드로 오류 원인을 추측하지 않아도 된다.
- 공통 resolver를 `commands`에 두면 `config`는 저장과 조회만 맡고 서비스별 `configure` 문구를 알지 않는다.
- 서비스별 wrapper 이름을 유지하면 여러 command 호출부를 바꾸지 않고 메시지와 import 계약을 보존할 수 있다.
- 기존 호출 순서를 유지하되 오류 보존을 resolver 자체 계약으로 만들면 Deploy의 우연한 선행 검증에 기대지 않는다.
- 새 ADR은 만들지 않는다. 이 결정은 코드와 디렉터리 책임에서 드러나고 되돌리기 쉬운 내부 리팩터링이다.

## Blocked 조건

- `docs/flow.md`, `docs/code-architecture.md`와 `docs/data-schema.md`가 문서 우선 커밋 `18ebfab`의 오류 경계와 다르면 `PHASE_BLOCKED: 관리 문서 계약 불일치`를 출력하고 종료한다.
- `loadCredentials()`를 재사용하면서 서비스 블록 부재만 구분할 수 없으면 새 로더를 만들지 말고 `PHASE_BLOCKED: config 조회 경계 분리 불가`를 출력하고 종료한다.
- 네 서비스의 기존 설정 안내 문구를 정확히 보존할 수 없으면 `PHASE_BLOCKED: 서비스별 오류 문구 계약 불일치`를 출력하고 종료한다.
