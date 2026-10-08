# Phase 03. `--check-connection` 연결 확인과 사용자 문서

**Execution profile**: deep

## 목표

`nhncloud doctor --check-connection` 이 대상 profile 하나의 UAK, IaaS, Log & Crash, NCR, NCS 연결을 확인해 `connection.targets` 에 담게 한다.
README 와 공개 스킬 reference 의 doctor 안내를 새 동작에 맞춘다.
설정이 갖춰졌는데 실제로 접속되는지를 `configure` 를 다시 돌리지 않고 확인하게 하려는 것이다.

**범위 외**: 기본 실행에서 연결 확인(ADR-042 로 기각), 공공망 연결 확인, `deploy`, `apigateway`, `skm` 연결 확인(검증 함수가 없다), 종료 코드로 진단 실패를 알리는 모드.

## 컨텍스트

- phase 02 가 `src/commands/doctor.ts` 에 `DoctorConnectionTarget`, `DoctorConnectionResult`, `DoctorConnection`, `DoctorDependencies`, `buildDoctorReport(options, dependencies)`, `createDoctorCommand(dependencies?)` 를 만들었다. 이 phase 는 연결 확인을 더한다.
- 연결 검증 함수는 `src/commands/configure-verify.ts` 에 있다. 새 HTTP 요청을 만들지 않고 그대로 쓴다.
  - `verifyUserAccessKey(uak: UserAccessKey): Promise<boolean>`
  - `verifyIaas(iaas: IaasCredential): Promise<boolean>`
  - `verifyLogncrash(uak: UserAccessKey, appkey: string): Promise<boolean>`
  - `verifyNcr(uak: UserAccessKey, appkey: string): Promise<boolean>`
  - `verifyNcs(uak: UserAccessKey, appkey: string): Promise<boolean>`
  - 인증 실패(401, 403)는 `false`, 그 밖의 오류는 throw 한다. 모두 `forceRefresh=true` 와 `"__verify__"` profile 로 토큰 캐시를 읽거나 쓰지 않는다. `ncr`, `ncs` 는 `kr1` 을 가정한다.
- 자격증명 값은 `src/config/credentials.ts` 의 기존 getter 로 읽는다.
  - `getUserAccessKey(profileName)`: 없거나 불완전하면 `NhnCloudCliError`(`EXIT_CONFIG_ERROR`).
  - `getIaasCredential(profileName)`: 없거나 불완전하면 같은 오류.
  - `getOptionalServiceCredential(service, profileName)`: 블록이 없으면 `undefined`.
- 공공망 판정은 `report.credentials.profiles` 의 대상 profile 요약 `environment` 로 한다. 공공망 자격증명을 일반망 주소로 보내지 않는다(ADR-037). `src/commands/configure.ts` 의 `saveAndVerify` 가 같은 이유로 공공망 연결 테스트를 거부한다.
- 상태와 사유 값, 확인 순서는 `skills/nhncloud-cli/references/common.md` 의 「설정 진단」 절과 `docs/flow.md` 의 「설정 진단」 절 흐름도가 정한다.

**근거 문서**: `docs/adr/042-doctor-offline-default-and-exit-code.md`, `docs/adr/037-gov-profile-endpoints.md`, `docs/adr/036-logncrash-available-token-preflight.md`, `docs/flow.md` 의 「설정 진단」 절, `skills/nhncloud-cli/references/common.md` 의 「설정 진단」 절

## 의도 메모

- 연결 확인은 순차로 한다. 한 대상이 실패해도 다음 대상을 확인한다. 병렬로 하면 결과 순서와 요청 부하가 실행마다 달라진다.
- `failed` 와 `error` 의 `exitCode` 는 잡은 오류가 `NhnCloudCliError` 면 그 `exitCode`, 아니면 `EXIT_API_ERROR`(`src/utils/exit-codes.ts`). 오류 메시지는 보고서에 넣지 않는다. Log & Crash, NCR, NCS 요청 URL 경로에 appkey 가 들어가 오류 메시지에 섞일 수 있다.
- 요청마다 `--request-timeout`(기본 30초) 상한이 적용되므로 순차 확인의 최악 시간은 요청 수에 비례한다. 그래서 UAK 확인이 실패하면 UAK 로 OAuth 토큰을 받는 대상은 건너뛴다.
- 진단 결과가 실패여도 종료 코드는 0 이다(ADR-042). `NhnCloudCliError` 를 다시 던지지 않는다.
- 기존 `verifyLogncrash` 는 최근 1분 범위 검색 요청을 하나 보내 조회 토큰을 쓴다. 이 비용 때문에 연결 확인은 명시 플래그로만 한다. `available-token` 으로 바꾸는 것은 이 plan 범위 밖이다.

## 작업 항목

### 1. `src/commands/doctor.ts` 에 연결 확인 추가

- `DoctorDependencies` 에 `connection: DoctorConnectionDependencies` 를 더한다.

```ts
export interface DoctorConnectionDependencies {
  getUserAccessKey: (profileName: string) => Promise<UserAccessKey>;
  getIaasCredential: (profileName: string) => Promise<IaasCredential>;
  getOptionalServiceCredential: (service: string, profileName: string) => Promise<ServiceCredential | undefined>;
  verifyUserAccessKey: (uak: UserAccessKey) => Promise<boolean>;
  verifyIaas: (iaas: IaasCredential) => Promise<boolean>;
  verifyLogncrash: (uak: UserAccessKey, appkey: string) => Promise<boolean>;
  verifyNcr: (uak: UserAccessKey, appkey: string) => Promise<boolean>;
  verifyNcs: (uak: UserAccessKey, appkey: string) => Promise<boolean>;
}
```

- `buildDoctorReport` 의 `options` 에 `checkConnection?: boolean` 을 더한다. false 나 생략이면 `{ checked: false }` 이고 연결 의존성을 하나도 부르지 않는다.
- true 면 `{ checked: true, profile: profile.name, targets }`. `targets` 는 `userAccessKey`, `iaas`, `logncrash`, `ncr`, `ncs` 순서로 채운다.
  1. `credentials.state !== "ok"`, `profile.name === null`, `profile.exists === false`, 대상 profile 요약의 `environment === "invalid"` 가운데 하나면 다섯 대상 모두 `{ status: "skipped", reason: "profile-unavailable" }`.
  2. `environment === "gov"` 면 다섯 대상 모두 `{ status: "skipped", reason: "gov-unsupported" }`. 네트워크 요청을 보내지 않는다.
  3. 일반망이면 대상별로 다음을 한다.
     - `userAccessKey`: `getUserAccessKey` 가 `NhnCloudCliError` 를 던지면 `skipped` 와 `not-configured`. 아니면 `verifyUserAccessKey`.
     - `iaas`: `getIaasCredential` 이 `NhnCloudCliError` 를 던지면 `not-configured`. 아니면 `verifyIaas`.
     - `logncrash`, `ncr`, `ncs`: `getOptionalServiceCredential(service, name)` 가 `undefined` 거나 `appkey` 가 빈 값이면 `not-configured`. appkey 는 있는데 `userAccessKey` 단계의 결과가 `skipped` 의 `not-configured` 나 `profile-unavailable` 이면 `uak-missing`(대상마다 `getUserAccessKey` 를 다시 부르지 않고 `userAccessKey` 단계에서 읽은 UAK 를 재사용한다). `logncrash`, `ncs` 는 OAuth 토큰을 UAK 로 받으므로 `userAccessKey` 결과가 `ok` 가 아니면 `skipped` 와 `uak-failed`(`ncr` 은 정적 UAK 서명이라 해당하지 않는다). 모두 통과하면 해당 verify 함수.
  4. 3번에 규칙이 없는 getter 예외(`getUserAccessKey`, `getIaasCredential` 이 `NhnCloudCliError` 가 아닌 예외를 던지거나, `getOptionalServiceCredential` 이 `NhnCloudCliError` 를 포함해 무엇이든 던지는 경우. inspect 이후 파일이 바뀐 경우)는 그 대상을 `skipped` 와 `profile-unavailable` 로 처리하고 종료 코드 0 을 유지한다. verify 함수의 예외는 위 `failed`/`error` 규칙을 따른다.
     - verify 결과가 `true` 면 `{ status: "ok" }`, `false` 면 `{ status: "failed", reason: "auth" }`, throw 하면 `{ status: "failed", reason: "error", exitCode }`.
- `ready` 계산은 phase 02 규칙 그대로다. `targets` 에 `failed` 가 있으면 `false`.
- 명령에 `.option("--check-connection", "대상 profile 의 자격증명으로 실제 연결을 확인한다 (외부 API 호출)")` 를 더한다. 이름은 root 예약 플래그와 겹치지 않는다.
- description 을 `"자격증명·설정·스킬 상태를 진단한다(기본 오프라인, --check-connection 으로 연결 확인)"` 로 바꾼다.
- 텍스트 모드에 「연결 확인」 절을 더한다. `checked` 가 false 면 이 절을 출력하지 않는다. 대상별로 `ok` 는 성공, `failed`/`auth` 는 인증 실패와 확인할 값, `failed`/`error` 는 오류와 종료 코드, `skipped` 는 건너뛴 사유를 한 줄씩 보인다. `ncr`, `ncs` 성공 줄에는 `(kr1)` 을 붙인다.
- 연결 확인 중 진행 안내를 출력하지 않는다. stdout 에는 보고서만 쓴다.
- 기본 의존성은 `src/config/credentials.ts` 와 `src/commands/configure-verify.ts` 의 실제 함수다.

### 2. 이 phase 를 검증하는 `src/commands/doctor.test.ts`

phase 02 의 fake 의존성에 `connection` fake 를 더한다. 실제 네트워크를 쓰지 않는다.

- `--check-connection` 없이 실행하면 연결 의존성의 어떤 함수도 불리지 않고 `connection` 이 `{ checked: false }` 다.
- 일반망 `default` profile 에 UAK, iaas, logncrash appkey 가 있고 ncr, ncs 블록이 없을 때: verify 가 모두 `true` 면 `userAccessKey`, `iaas`, `logncrash` 는 `ok`, `ncr`, `ncs` 는 `skipped` 와 `not-configured`, `ready: true`.
- `verifyUserAccessKey` 가 `false` 면 `userAccessKey` 가 `failed` 와 `auth`, `ready: false`.
- `verifyIaas` 가 `new NhnCloudCliError("x", EXIT_API_ERROR)` 를 throw 하면 `iaas` 가 `failed`, `error`, `exitCode: 1` 이고(`EXIT_API_ERROR` 는 기본값과 같으므로 아래 두 경우를 별도로 둔다) 그 뒤 `logncrash` 도 확인된다(verify 호출 순서를 단언). 보고서 JSON 에 오류 메시지 `"x"` 가 없다.
- `getUserAccessKey` 가 `NhnCloudCliError` 를 던지고 ncr appkey 가 있으면 `ncr` 이 `uak-missing`, `verifyNcr` 는 불리지 않는다.
- 대상 profile 요약의 `environment` 가 `"gov"` 면 다섯 대상 모두 `gov-unsupported` 이고 getter 와 verify 가 하나도 불리지 않는다.
- `credentials.state: "missing"` 이면 다섯 대상 모두 `profile-unavailable`.
- `verifyUserAccessKey` 가 `false` 면 `logncrash`, `ncs` 는 `skipped` 와 `uak-failed` 이고 `verifyLogncrash`, `verifyNcs` 는 불리지 않으며, `ncr` 은 그대로 확인된다.
- `getIaasCredential` 이 `Error("x")`(NhnCloudCliError 아님)를 던지면 `iaas` 가 `skipped` 와 `profile-unavailable` 이고 명령은 종료 코드 0 으로 끝나며 나머지 대상은 계속 확인된다.
- `verifyIaas` 가 `new Error("ECONNREFUSED")`(NhnCloudCliError 아님)를 throw 하면 `failed`, `error`, `exitCode: 1`. `EXIT_CONFIG_ERROR` 를 가진 `NhnCloudCliError` 를 throw 하면 `exitCode` 가 그 코드 그대로다.
- 위 모든 경우 `process.exitCode` 가 바뀌지 않는다.
- 텍스트 모드: 실패와 건너뜀이 섞인 입력에서 「연결 확인」 절이 출력되고, fixture 의 UAK secret, iaas password, appkey 문자열이 stdout 과 stderr 어디에도 없다.

fixture 비밀값은 `fake-secret`, `fake-password`, `test-appkey` 처럼 하이픈이 든 짧은 값만 쓴다. 16자 이상 영숫자 연속 값과 사내 도메인처럼 보이는 문자열은 쓰지 않는다.

### 3. 사용자 문서 갱신

- `README.md`:
  - 「3.」 절의 `` `doctor` 는 외부 API 를 호출하지 않고 자격증명과 스킬 설치 상태만 확인해요. `` 문장을 「기본으로 외부 API 를 호출하지 않으며, `--check-connection` 을 주면 대상 profile 의 연결까지 확인해요」 취지로 바꾸고 `nhncloud doctor --check-connection` 예시를 하나 더한다. README 의 기존 경어체(「~해요」)를 따른다.
  - 「문제가 생기면」 절의 이슈 첨부 안내를 `nhncloud doctor --json` 출력으로 바꾼다. 비밀값은 출력에 들어가지 않지만 경로에 사용자 이름이 보일 수 있다는 점을 한 줄로 알린다.
- `skills/nhncloud-cli/references/troubleshooting.md` 14행의 오프라인 진단 문장을 바꾼다: 기본은 오프라인, `--check-connection` 으로 대상 profile 의 연결 확인, 필드는 `common.md` 의 「설정 진단」 절을 본다.
- `skills/nhncloud-cli/references/common.md` 의 「설정 진단」 절은 이미 계획 단계에서 작성됐다. 구현한 필드 이름, 상태 값, 사유 값, 예시 명령이 그 절과 같은지 대조하고, 다르면 구현을 문서에 맞춘다. 문서를 바꿔야 할 사유가 생기면 `docs/flow.md` 의 「설정 진단」 절과 ADR-042 도 같이 맞춘다.

## 검증

```bash
pnpm vitest run src/commands/doctor.test.ts src/commands/reserved-flags.test.ts src/commands/commands.test.ts
pnpm tsc --noEmit
pnpm test
pnpm run build
pnpm verify:package
node dist/index.js commands --json | node -e 'const c=JSON.parse(require("fs").readFileSync(0,"utf8")).commands.find(x=>x.path==="doctor"); if(!JSON.stringify(c).includes("--check-connection")) process.exit(1)'
EMPTY_HOME=$(mktemp -d) && HOME="$EMPTY_HOME" node dist/index.js doctor --json | node -e 'const r=JSON.parse(require("fs").readFileSync(0,"utf8")); if(r.credentials.state!=="missing"||r.ready!==false||r.connection.checked!==false) process.exit(1)'
EMPTY_HOME=$(mktemp -d) && HOME="$EMPTY_HOME" node dist/index.js doctor --check-connection --json | node -e 'const r=JSON.parse(require("fs").readFileSync(0,"utf8")); if(r.connection.targets.userAccessKey.reason!=="profile-unavailable") process.exit(1)'
node scripts/check-pii.mjs
git diff --check
```

- 모든 명령이 종료 코드 0.
- 빈 HOME 두 줄은 네트워크 없이 끝난다. 두 번째 줄은 자격증명이 없어 연결 확인 대상이 모두 `profile-unavailable` 이므로 외부 요청을 보내지 않는다.
- 문서를 고쳤으면 저장소의 한국어 표기 검사를 바꾼 md 파일에 실행해 종료 코드 0 을 확인한다. `python3 $(ls -d $HOME/.claude/plugins/cache/*/*/*/korean-check 2>/dev/null | head -1)/scripts/korean-style-check.py <파일>` 형태이며, 경로가 없으면 건너뛰고 건너뛰었다고 보고한다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `src/commands/doctor.ts` | 수정 |
| `src/commands/doctor.test.ts` | 수정 |
| `README.md` | 수정 |
| `skills/nhncloud-cli/references/troubleshooting.md` | 수정 |
| `skills/nhncloud-cli/references/common.md` | 대조. 차이가 있을 때만 수정 |
| `docs/flow.md` | 대조. 차이가 있을 때만 수정 |
| `docs/adr/042-doctor-offline-default-and-exit-code.md` | 대조. 차이가 있을 때만 수정 |
