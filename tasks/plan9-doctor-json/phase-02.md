# Phase 02. doctor 진단 보고서와 `--json`, `--quiet` 출력

**Execution profile**: standard

## 목표

`nhncloud doctor` 가 진단 보고서 객체 하나를 만들고 그것을 텍스트, `--json`, `--quiet` 로 출력하게 바꾼다.
자동화와 이슈 첨부가 문구 대신 고정된 필드를 읽게 하려는 것이다.

**범위 외**: `--check-connection` 과 연결 확인(phase 03). 이 phase 의 보고서는 항상 `connection: { checked: false }` 다. README 와 공개 스킬 reference 수정(phase 03).

## 컨텍스트

- 현재 `src/commands/doctor.ts` 는 `console.log` 로 텍스트만 낸다. `readProfiles`, `readDefaultProfile`, 모듈 상수 `CREDENTIALS_PATH`, `CONFIG_PATH` 를 지우고 phase 01 의 `inspectCredentialsFile`, `inspectConfigFile`(`src/config/credentials.ts`)을 쓴다.
- `--json` 과 `--quiet` 는 root program(`src/index.ts`)의 전역 옵션이다. doctor 에 같은 이름의 옵션을 정의하면 `src/commands/reserved-flags.test.ts` 가 실패한다. `cmd.optsWithGlobals<...>()` 로 읽는다. 패턴은 `src/commands/skills.ts` 의 `showStatus` 를 따른다.
- 의존성 주입 패턴은 `src/commands/skills.ts` 의 `SkillCommandDependencies` 와 `createSkillsCommand(dependencies = defaultDependencies)` 를 따른다. `src/index.ts` 가 import 하는 `doctorCommand` 이름은 유지한다(`export const doctorCommand = createDoctorCommand();`).
- profile 해석은 `resolveProfileName(cliProfile?)`(`src/config/credentials.ts`)을 재사용한다. 해석 순서를 doctor 에 다시 구현하지 않는다. 이 함수는 `config.json` 이 JSON 이 아닐 때 `NhnCloudCliError` 를 던진다.
- 공개 스킬 상태는 `createSkillManagerContext()`(`src/skill/context.ts`)와 `inspectSkill(context)`(`src/skill/manager.ts`)이 판정한다. 둘 다 throw 할 수 있다. 복구 명령은 `skillRecoveryCommand(status)`(`src/commands/skills-output.ts`)가 소유한다.
- 출력 필드, 상태 값, 종료 코드 정책은 `skills/nhncloud-cli/references/common.md` 의 「설정 진단」 절과 ADR-042 가 정한다. 이 phase 는 그 표와 같은 이름을 쓴다.

**근거 문서**: `skills/nhncloud-cli/references/common.md` 의 「설정 진단」 절, `docs/flow.md` 의 「설정 진단」 절, `docs/adr/042-doctor-offline-default-and-exit-code.md`, `docs/code-architecture.md` 의 「공개 스킬 관리」 절

## 의도 메모

- 텍스트, JSON, quiet 가 서로 다른 판정을 하지 않도록 보고서 객체를 먼저 만들고 출력은 그 객체만 읽는다.
- 진단 보고서를 냈으면 문제가 있어도 `process.exitCode` 를 바꾸지 않고 `NhnCloudCliError` 를 던지지 않는다(ADR-042). `resolveProfileName` 과 스킬 판정의 예외는 잡아서 보고서 필드로 바꾼다. 그 밖의 예상하지 못한 예외는 잡지 않는다.
- `skills` 를 `{ agents: { claude } }` 로 두는 이유: 다른 에이전트 경로(Codex 등)의 스킬 설치가 추가되면 `agents` 에 키만 늘린다. `claude` 키의 모양은 바꾸지 않는다.
- 출력은 `console.log` 대신 `process.stdout.write` 로 쓴다. 테스트가 stdout spy 로 출력을 모은다.
- 텍스트 모드에서 credentials 파일에서 온 문자열(profile 이름, 블록 이름)과 경로, `reason` 은 `sanitizeForTerminal`(`src/utils/terminal.ts`)을 거쳐 출력한다(`docs/pitfalls/code-review/external-string-unsanitized.md`). JSON 은 원문 그대로 둔다.

## 작업 항목

### 1. `src/commands/doctor.ts` 를 보고서 기반으로 다시 쓴다

다음 타입과 함수를 이 파일에 둔다.

```ts
export type DoctorConnectionTarget = "userAccessKey" | "iaas" | "logncrash" | "ncr" | "ncs";

export interface DoctorConnectionResult {
  status: "ok" | "failed" | "skipped";
  reason?: "auth" | "error" | "not-configured" | "uak-missing" | "uak-failed" | "gov-unsupported" | "profile-unavailable";
  exitCode?: number;
}

export type DoctorConnection =
  | { checked: false }
  | { checked: true; profile: string | null; targets: Record<DoctorConnectionTarget, DoctorConnectionResult> };

export type DoctorSkillAgentStatus =
  | (SkillStatus & { recoveryCommand: string | null })
  | { status: "error"; reason: string };

export interface DoctorReport {
  schemaVersion: 1;
  ready: boolean;
  credentials: CredentialsFileInspection;
  config: ConfigFileInspection;
  profile: { name: string | null; exists: boolean };
  connection: DoctorConnection;
  skills: { agents: { claude: DoctorSkillAgentStatus } };
}

export interface DoctorDependencies {
  inspectCredentials: () => Promise<CredentialsFileInspection>;
  inspectConfig: () => Promise<ConfigFileInspection>;
  resolveProfile: (cliProfile?: string) => Promise<string>;
  createSkillContext: () => SkillManagerContext;
  inspectSkill: (context: SkillManagerContext) => Promise<SkillStatus>;
}

export async function buildDoctorReport(
  options: { profile?: string },
  dependencies: DoctorDependencies,
): Promise<DoctorReport>;

export function createDoctorCommand(dependencies?: DoctorDependencies): Command;
export const doctorCommand = createDoctorCommand();
```

`DoctorConnectionTarget`, `DoctorConnectionResult` 는 phase 03 이 채운다. 이 phase 에서는 타입만 두고 `connection` 은 `{ checked: false }` 로 고정한다.

`buildDoctorReport` 규칙:

1. `credentials = await inspectCredentials()`, `config = await inspectConfig()`.
2. `profile.name`: `resolveProfile(options.profile)` 결과. `NhnCloudCliError` 를 던지면 `null`. 다른 예외는 그대로 던진다.
3. `profile.exists`: `credentials.state === "ok"` 이고 `credentials.profiles` 에 같은 이름이 있을 때 `true`.
4. `skills.agents.claude`: `createSkillContext()` 와 `inspectSkill(context)` 를 하나의 try 로 감싼다. 성공하면 `{ ...status, recoveryCommand: skillRecoveryCommand(status.status) ?? null }`. 실패하면 `{ status: "error", reason }`. `reason` 은 고정 문구(`공개 스킬 상태를 판정하지 못했습니다`)이고, `err` 가 객체이며 `err.code` 가 문자열이면 `: <code>` 만 붙인다. `err.message` 와 원문 오류 문자열은 어떤 경우에도 넣지 않는다.
5. `ready`: `credentials.state === "ok"` 이고 `profile.exists` 이고 그 profile 요약의 `environment !== "invalid"` 이며 `blocks.length > 0` 이고, `connection.checked` 가 true 면 `targets` 에 `status: "failed"` 가 없을 때 `true`.

명령 정의:

- `new Command("doctor")`, description 은 이 phase 에서 그대로 둔다.
- `.option("--profile <name>", "진단할 profile 이름")`.
- action 은 `cmd.optsWithGlobals<{ profile?: string; json?: boolean; quiet?: boolean }>()` 로 옵션을 읽는다.
- `json` 이면 `printJson(report)`(`src/formatters/table.ts`).
- `quiet` 이면 stdout 에 `ready\n` 또는 `not-ready\n` 한 줄.
- 둘 다 아니면 텍스트 출력. 기존 절 구성(제목, 「자격증명」, 「Claude Code 스킬」, 요약 줄)을 유지하고 다음을 보탠다.
  - 자격증명: `state` 별 문구. `missing` 은 기존 「미설정」 안내, `invalid` 와 `unreadable` 은 경로와 `reason`. `ok` 면 profile 목록(`이름 (gov)` 처럼 공공망 표기, `invalid` 는 경고 표기). `permissions` 가 `too-open` 이면 `chmod 600 <path>` 안내.
  - 설정 파일: `invalid`, `unreadable` 일 때만 경로와 `reason` 을 보인다. 기본 profile 은 `config.defaultProfile` 이나 「미지정 (default 사용)」.
  - 대상 profile: `profile.name` 과 존재 여부. `name` 이 `null` 이면 「config.json 을 먼저 고치세요」.
  - 스킬: 기존 상태별 문구를 유지하고 `error` 면 경고와 `reason`.
  - 요약 줄은 `report.ready` 로 정한다.

`DoctorDependencies` 기본값은 `inspectCredentialsFile`, `inspectConfigFile`, `resolveProfileName`, `createSkillManagerContext`, `inspectSkill` 이다.

### 2. 이 phase 를 검증하는 `src/commands/doctor.test.ts`

`src/commands/skills.test.ts` 처럼 `new Command("nhncloud").exitOverride().option("--json").option("--quiet").addCommand(createDoctorCommand(deps))` 로 실행하고 `process.stdout.write` 를 spy 로 모은다. 의존성은 모두 `vi.fn` fake 로 준다. 파일 시스템을 쓰지 않는다.

- 빈 HOME 에 해당하는 입력(`credentials.state: "missing"`, `config.state: "missing"`, `resolveProfile` 은 `"default"`, 스킬 `missing`)에서 `doctor --json` 의 stdout 이 `JSON.parse` 되고 `schemaVersion: 1`, `ready: false`, `profile: { name: "default", exists: false }`, `connection: { checked: false }`, `skills.agents.claude.status: "missing"`, `recoveryCommand: "nhncloud skills install"` 이다.
- 같은 입력으로 `nhncloud --json doctor`(전역 옵션 앞) 도 같은 JSON 을 낸다.
- 정상 입력(`credentials.state: "ok"`, `default` profile 존재, 스킬 `current`)이면 `ready: true`, `recoveryCommand: null`, `--quiet` 출력이 정확히 `"ready\n"`.
- `resolveProfile` 이 `NhnCloudCliError` 를 던지면 `profile.name: null`, `ready: false` 이고 명령은 정상 종료한다.
- `--profile staging` 을 주면 `resolveProfile` 이 `"staging"` 으로 불린다.
- `inspectSkill` 이 throw 하면 `skills.agents.claude` 가 `{ status: "error", reason }` 이고 나머지 필드는 그대로 나온다.
- profile 요약의 `environment` 가 `"invalid"` 면 `ready: false`.
- 대상 profile 요약의 `blocks` 가 빈 배열이면 `ready: false`.
- `inspectSkill` 이 `message` 에 `fake-secret` 이 든 오류를 `code: "EACCES"` 와 함께 던지면 `reason` 에 `EACCES` 가 있고 `fake-secret` 과 원문 메시지는 없다. `code` 가 없으면 고정 문구만 나온다.
- 텍스트 모드: `credentials.state: "invalid"` 에서 출력에 `reason` 이 들어가고, profile 이름에 `"\u001b[31m"` 같은 제어 문자를 넣으면 출력에 ESC 문자가 남지 않는다.
- 모든 경우에 `process.exitCode` 가 바뀌지 않는다(테스트 전후로 `undefined`).

fixture 에 16자 이상 영숫자 연속 비밀값이나 사내 도메인처럼 보이는 문자열을 쓰지 않는다. 경로는 `/home/tester/.nhncloud/credentials.json` 같은 가상 값을 쓴다.

## 검증

```bash
pnpm vitest run src/commands/doctor.test.ts src/commands/reserved-flags.test.ts
pnpm tsc --noEmit
pnpm test
pnpm run build
node dist/index.js doctor --json | node -e 'JSON.parse(require("fs").readFileSync(0,"utf8"))'
node scripts/check-pii.mjs
! grep -nE "console\.log|readProfiles|readDefaultProfile" src/commands/doctor.ts
```

- 모든 명령이 종료 코드 0.
- 마지막 줄은 `src/commands/doctor.ts` 에 `console.log`, `readProfiles`, `readDefaultProfile` 이 남지 않았는지 확인한다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `src/commands/doctor.ts` | 수정 |
| `src/commands/doctor.test.ts` | 신규 |
