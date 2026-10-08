# Phase 01. 자격증명과 설정 파일 진단 함수

**Execution profile**: standard

## 목표

`src/config/credentials.ts` 에 예외를 던지지 않고 파일 상태를 값으로 돌려주는 진단 함수 `inspectCredentialsFile` 과 `inspectConfigFile` 을 추가한다.
doctor 가 자체 파일 읽기 코드를 두지 않고 자격증명 경계를 재사용하게 하려는 것이다.

**범위 외**: `src/commands/doctor.ts` 변경(phase 02), 연결 확인(phase 03), 문서 변경.

## 컨텍스트

- 지금 `src/commands/doctor.ts` 는 `readProfiles`, `readDefaultProfile` 로 파일을 직접 읽고 모든 오류를 「없음」이나 `null` 로 삼킨다. 이 phase 는 그 역할을 `src/config/credentials.ts` 로 옮길 함수를 만든다. doctor 는 아직 고치지 않는다.
- `src/config/credentials.ts` 는 모듈 최상위 상수 `CREDENTIALS_PATH`, `CONFIG_PATH` 를 `homedir()` 로 만든다. 같은 상수를 그대로 쓴다.
- 이미 있는 타입 가드 `isCredentials`, `isConfig` 를 재사용한다. `JSON.parse` 결과를 `as` 로 단언하지 않는다.
- 출력 필드와 값 집합은 `skills/nhncloud-cli/references/common.md` 의 「설정 진단」 절이 소유한다. 아래 타입은 그 절의 `credentials`, `config` 표와 같다.

**근거 문서**: `skills/nhncloud-cli/references/common.md` 의 「설정 진단」 절, `docs/flow.md` 의 「설정 진단」 절, `docs/code-architecture.md` 의 「공개 스킬 관리」 절 끝 문단, `docs/adr/042-doctor-offline-default-and-exit-code.md`

## 의도 메모

- 기존 로더(`loadCredentials`, `loadCredentialsOrEmpty`, `readConfigJson`)는 고치지 않는다. 그 함수들은 명령 실행 경로의 오류 계약(`EXIT_CONFIG_ERROR`)을 소유한다. 진단 함수는 같은 판정을 값으로 돌려주는 별도 함수다.
- `docs/pitfalls/code-review/credential-loader-reinvented-swallow.md`: 진단 함수가 「파일 없음」 과 「손상」 과 「읽기 실패」 를 하나로 삼키면 안 된다. 세 상태를 각각 다른 `state` 로 낸다.
- `reason` 에 `JSON.parse` 의 오류 메시지를 넣지 않는다. Node 의 `SyntaxError` 메시지는 파일 내용 일부를 인용해 비밀값이 섞일 수 있다. 아래의 고정 문구만 쓴다.
- 반환값에 `userAccessKey.secret`, `iaas.password`, appkey 같은 값을 절대 담지 않는다. profile 이름과 블록 이름만 담는다.

## 작업 항목

### 1. `src/config/credentials.ts` 에 타입과 진단 함수 추가

다음 타입을 export 한다.

```ts
export type LocalFileState = "ok" | "missing" | "invalid" | "unreadable";

export interface CredentialsProfileSummary {
  name: string;
  environment: "real" | "gov" | "invalid";
  blocks: string[];
}

export interface CredentialsFileInspection {
  path: string;
  state: LocalFileState;
  reason?: string;
  permissions?: "ok" | "too-open" | "unknown";
  profiles: CredentialsProfileSummary[];
}

export interface ConfigFileInspection {
  path: string;
  state: LocalFileState;
  reason?: string;
  defaultProfile: string | null;
}
```

`export async function inspectCredentialsFile(): Promise<CredentialsFileInspection>`

- `path` 는 `CREDENTIALS_PATH`.
- `readFile` 이 `code === "ENOENT"` 로 실패하면 `state: "missing"`, `profiles: []`, `permissions` 없음.
- 그 밖의 읽기 실패는 `state: "unreadable"`, `reason: \`파일을 읽지 못했습니다 (${code ?? "UNKNOWN"})\``, `profiles: []`.
- JSON 파싱 실패는 `state: "invalid"`, `reason: "JSON 형식이 아닙니다"`.
- `isCredentials` 가 false 면 `state: "invalid"`, `reason: "version: 1 과 profiles 필드가 필요합니다"`.
- 정상이면 `state: "ok"`, `profiles` 는 `Object.entries(profiles)` 를 이름순으로 정렬해 만든다.
  - 값이 객체가 아니거나 배열이면 `environment: "invalid"`, `blocks: []`.
  - `environment` 키가 없으면 `"real"`, `"gov"` 면 `"gov"`, 그 밖의 값이면 `"invalid"`. 판정 규칙은 기존 `getProfileEnvironment` 와 같다.
  - `blocks` 는 profile 키 가운데 `environment` 를 뺀 이름을 정렬한 목록이다.
- `permissions`: `state` 가 `missing` 이 아닐 때 `stat(CREDENTIALS_PATH)` 를 시도한다. 실패하면 필드를 두지 않는다.
  `process.platform === "win32"` 면 `"unknown"`, `(mode & 0o077) === 0` 이면 `"ok"`, 아니면 `"too-open"`.
- 이 함수는 어떤 경우에도 throw 하지 않는다.

`export async function inspectConfigFile(): Promise<ConfigFileInspection>`

- `path` 는 `CONFIG_PATH`. 상태 판정은 위와 같다(`ENOENT` 는 `missing`, 기타 읽기 실패는 `unreadable`, 파싱 실패는 `invalid` 와 `"JSON 형식이 아닙니다"`).
- `isConfig` 가 false 면 `state: "invalid"`, `reason: "version: 1 이 필요합니다"`.
- `defaultProfile` 은 `state` 가 `ok` 이고 값이 비어 있지 않은 문자열일 때만 그 값, 아니면 `null`.
- throw 하지 않는다.

`node:fs/promises` 의 `stat` import 를 추가한다. 다른 export 의 동작은 바꾸지 않는다.

### 2. 이 phase 를 검증하는 `src/config/credentials.test.ts`

기존 파일의 패턴을 그대로 쓴다: `vi.hoisted` 로 만든 `home.dir` 을 `node:os` 의 `homedir` mock 이 돌려주고, SUT 는 `beforeAll` 에서 `home.dir` 을 정한 뒤 동적 `await import("./credentials.js")` 로 불러온다. SUT 를 파일 상단에서 정적 import 하지 않는다(`docs/pitfalls/plan/test-module-const-mock-timing.md`).
`describe("inspectCredentialsFile")` 과 `describe("inspectConfigFile")` 을 추가하고 다음을 확인한다.

- 파일이 없으면 `state: "missing"`, `profiles: []`, `permissions` 가 없다.
- `"{not json"` 을 쓰면 `state: "invalid"`, `reason` 이 `"JSON 형식이 아닙니다"` 이고 `reason` 에 파일 내용 조각(`not json`)이 없다.
- `{ "version": 2, "profiles": {} }` 는 `invalid` 와 형식 문구.
- `credentials.json` 경로에 디렉터리를 만들면 `state: "unreadable"`, `reason` 에 `EISDIR` 가 들어간다. 테스트 끝에 디렉터리를 지운다(`afterEach` 의 `rm` 에 `recursive: true` 를 더한다).
- 정상 파일: profile 두 개(`default` 는 `userAccessKey`, `iaas`, `logncrash` 블록, `public-project` 는 `environment: "gov"` 와 `userAccessKey`)와 `environment: "other"` 인 profile 하나를 쓰고, 이름순 정렬, `environment` 값, 정렬된 `blocks` 를 확인한다.
- 같은 정상 파일에서 `JSON.stringify(result)` 가 fixture 의 비밀값 문자열을 하나도 포함하지 않는다.
- `chmod 0o600` 이면 `permissions: "ok"`, `0o644` 면 `"too-open"`(Windows 에서는 건너뛴다: `it.skipIf(process.platform === "win32")`).
- `inspectConfigFile`: 없음은 `missing` 과 `defaultProfile: null`, `{ "version": 1, "defaultProfile": "staging" }` 은 `ok` 와 `"staging"`, `{ "version": 1 }` 은 `ok` 와 `null`, 파싱 오류는 `invalid`.

fixture 의 비밀값은 `fake-secret`, `fake-password`, `test-appkey` 처럼 하이픈이 든 짧은 값을 쓴다. 16자 이상 영숫자 연속 값이나 사내 도메인처럼 보이는 문자열은 쓰지 않는다(`node scripts/check-pii.mjs` 가 `src/` 도 검사한다).

## 검증

```bash
pnpm vitest run src/config/credentials.test.ts
pnpm tsc --noEmit
pnpm test
node scripts/check-pii.mjs
git status --short
```

- 모든 명령이 종료 코드 0.
- `git status --short` 에 이 phase 의 변경 파일 외 untracked 파일(작업 트리 안의 `.nhncloud/`)이 없어야 한다. 있으면 테스트가 mock 전에 SUT 를 불러온 것이다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `src/config/credentials.ts` | 수정 |
| `src/config/credentials.test.ts` | 수정 |
