# Phase 01. 알 수 없는 옵션 오류에 위치 인수 안내를 붙인다

**Execution profile**: standard

## 목표

알 수 없는 옵션의 이름이 그 명령의 위치 인수를 가리키면, Commander 오류 줄 뒤에 안내 두 줄을 stderr에 덧붙인다.
에이전트가 `nhncloud instance get --instance-id <instance-id>` 처럼 부를 때 `--help` 를 다시 부르지 않고 바로 고칠 수 있게 하는 것이 목적이다.

**범위 외**

- 종료 코드 변경. 알 수 없는 옵션은 지금처럼 종료 코드 1이다(ADR-035).
- 짧은 옵션(`-x`)과 옵션 이름 오타. 오타는 Commander가 `(Did you mean ...)` 으로 이미 제안한다.
- `--cluster-id` 와 `<cluster>` 처럼 옵션 이름이 `<인수 이름>-` 으로 시작하는 경우. 판정 셋에 들지 않는다.
- `README.md` 와 `skills/nhncloud-cli/references/` 수정. 안내 문구가 오류 출력 안에 있어 따로 적지 않는다.
- `docs/` 수정. 근거 문서는 이미 갱신됐다.

## 컨텍스트

- `src/commands/commander-errors.ts` 의 `configureCommanderExitCodes(root)` 가 명령 트리를 재귀로 돌며 각 명령에 `exitOverride(throwWithNormalizedExitCode)` 를 건다.
  지금은 `error.code === "commander.missingMandatoryOptionValue"` 일 때만 `error.exitCode = EXIT_PARAM_ERROR` 로 바꾸고 그대로 던진다.
- `src/index.ts` 는 트리를 다 만든 뒤 `configureCommanderExitCodes(program)` 와 `configureGlobalOptionsHelp(program)` 를 부른다.
  `parseAsync().catch` 는 `CommanderError` 를 받으면 아무것도 출력하지 않고 `process.exit(err.exitCode)` 만 한다. 이 파일은 바꾸지 않는다.
- Commander 버전은 14.0.3 이다. 아래 동작을 실측했다.
  - 알 수 없는 옵션이 나면 Commander가 먼저 그 명령의 `outputError` 로 오류를 출력하고, 그다음 **오류가 난 그 명령**의 exitOverride 콜백을 부른다.
    `instance get --instance-id x` 는 `get` 명령의 콜백이, `instance --foo` 는 `instance` 명령의 콜백이 불린다.
  - `error.code` 는 `"commander.unknownOption"` 이고 `error.exitCode` 는 1이다.
  - `error.message` 예: `error: unknown option '--instance-id'`, `error: unknown option '--instance-id=x'`,
    오타면 `error: unknown option '--regoin'\n(Did you mean --region?)`.
  - `command.usage()` 는 `[options] <id>` 처럼 옵션 표기와 인수 표기를 돌려준다.
  - `command.registeredArguments` 는 `readonly Argument[]` 이고 `Argument` 에 `name()`, `required: boolean`, `variadic: boolean` 이 있다.
    인수 이름은 선언한 그대로다. `instance volume detach` 는 `<id> <volumeId>` 로 선언되어 `volumeId` 가 나온다.
  - `command.parent` 의 타입은 `Command | null` 이다.
  - `command.configureOutput()` 를 인수 없이 부르면 현재 출력 설정(`OutputConfiguration`)을 돌려준다. `writeErr?(str: string): void` 는 타입상 선택 필드다.
- 지금 빌드한 CLI 출력은 다음과 같다. stdout은 비어 있고 종료 코드는 1이다.

  ```text
  $ node dist/index.js instance get --instance-id x
  error: unknown option '--instance-id'
  ```

**근거 문서**: `docs/flow.md` 「공통 CLI 입력 오류」 절, `docs/code-architecture.md` 의 `commander-errors.ts` 문단, `docs/adr/035-required-option-exit-code.md`.

## 의도 메모

- 안내 판정은 Commander 객체를 받지 않는 순수 함수로 둔다. `commander-errors.ts` 가 Commander 객체에서 값을 꺼내 넘긴다.
- Commander 오류 줄은 바꾸지 않는다. 안내는 그 뒤에 붙인다. `configureOutput({ outputError })` 를 덮어쓰는 방식은 쓰지 않는다.
  분류는 `error.code` 로 하고, 기존 경계 한 곳(`commander-errors.ts`)에 둔다.
- 안내를 쓸 때 출력 함수는 콜백이 불린 시점에 `command.configureOutput().writeErr` 에서 읽는다.
  `configureCommanderExitCodes` 를 부르는 시점에 미리 잡아 두면, 테스트처럼 출력 설정을 나중에 바꾸는 경우를 따르지 못한다.
  `writeErr` 가 없으면 `process.stderr.write` 를 쓴다.
- 알 수 없는 옵션을 위치 인수로 해석해 명령을 실행하지 않는다. 안내만 붙이고 원래 오류를 그대로 던진다.
- dooray-cli 의 같은 기능은 판정이 둘(정확히 같다, 앞부분이 같다)이다. 그 둘만으로는 `instance get` 의 `--instance-id` 와 `<id>` 를 맞추지 못해 셋째 판정(명령 경로 단계 이름을 앞에 붙인 이름)을 더한다.
  이 저장소는 위치 인수 이름을 `id` 로 둔 명령이 많다(`instance get`, `volume get`, `ncs workload get` 등).

## 작업 항목

### 1. `src/commands/unknown-option-hint.ts` 신규

다음을 export 한다. 다른 파일을 import 하지 않는다.

```ts
export interface HintArgument {
  name: string;      // 선언한 그대로. 예: "id", "volumeId", "instance-id"
  required: boolean;
  variadic: boolean;
}

export interface UnknownOptionHintInput {
  message: string;       // CommanderError.message
  commandPath: string[]; // 루트부터. 예: ["nhncloud", "instance", "get"]
  usage: string;         // command.usage() 의 값. 예: "[options] <id>"
  arguments: HintArgument[];
}

export function parseUnknownOptionName(message: string): string | undefined;
export function findReferencedArgument(
  optionName: string,
  commandPath: string[],
  argumentNames: string[],
): string | undefined;
export function buildUnknownOptionHint(input: UnknownOptionHintInput): string;
```

`parseUnknownOptionName`

- 정규식 `/unknown option '--([^'=]+)/` 로 `--` 뒤 이름을 꺼낸다. `=값` 은 버린다.
- 짧은 옵션(`'-i'`)이나 다른 오류 문구면 `undefined` 다.

`findReferencedArgument`

- 비교는 정규화한 이름끼리 한다. 정규화는 camelCase 경계에 `-` 를 넣고 소문자로 바꾸는 것이다.
  `name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()`. `volumeId` 는 `volume-id` 가 된다.
- 판정 A: 정규화한 인수 이름이 정규화한 옵션 이름과 같은 인수가 있으면 그 인수를 돌려준다.
- A에 맞는 인수가 없으면 아래 B와 C에 맞는 인수를 모은다. 서로 다른 인수가 정확히 하나면 그 인수를, 아니면 `undefined` 를 돌려준다.
  - 판정 B: 정규화한 인수 이름이 `<옵션 이름>-` 으로 시작한다. 이 판정에 맞는 인수가 둘 이상이면 B의 후보는 없는 것으로 친다.
  - 판정 C: `commandPath` 에서 첫 원소(루트 이름)를 뺀 단계 가운데 하나를 `segment` 라 할 때, 옵션 이름이 `<segment>-<정규화한 인수 이름>` 과 같다.
- 돌려주는 값은 선언한 인수 이름 그대로다(`volumeId`). 정규화한 값을 돌려주지 않는다.
- `argumentNames` 가 비어 있으면 `undefined` 다.

`buildUnknownOptionHint`

- `input.message` 에 `(Did you mean` 이 있으면 빈 문자열을 돌려준다. Commander가 비슷한 옵션을 이미 제안했다는 뜻이고, 그 옵션이 더 그럴듯한 의도다.
  실측 예: `instance volume attach x --volume v --volume-id y` 는 `error: unknown option '--volume-id'\n(Did you mean --volume?)` 를 내고, 판정 C는 `--volume-id` 를 `<id>`(인스턴스 ID)로 잘못 가리킨다.
- `parseUnknownOptionName(input.message)` 가 `undefined` 거나 `findReferencedArgument` 가 `undefined` 면 빈 문자열을 돌려준다.
- 인수 표기는 `required` 면 `<name>`, 아니면 `[name]` 이고, `variadic` 이면 이름 뒤에 `...` 을 붙인다(`<ids...>`).
- 맞으면 정확히 아래 두 줄을 돌려준다. 끝에 줄바꿈이 있다.

  ```text
  안내: --<옵션 이름> 는 옵션이 아닙니다. 위치 인수 <인수 표기> 로 전달하세요.
  사용법: <commandPath 를 공백으로 이은 값> <usage>
  ```

  `instance get --instance-id x` 의 결과:
  `"안내: --instance-id 는 옵션이 아닙니다. 위치 인수 <id> 로 전달하세요.\n사용법: nhncloud instance get [options] <id>\n"`
- 옵션 이름은 `parseUnknownOptionName` 이 돌려준 값을 그대로 쓴다(`=값` 을 뗀 값).
- 색을 넣지 않는다. Commander 오류 줄도 색이 없다.

### 2. `src/commands/commander-errors.ts` 수정

- `throwWithNormalizedExitCode(error)` 를 명령을 함께 받는 함수로 바꾼다. 예: `handleCommanderError(command: Command, error: CommanderError): never`.
- `configureCommanderExitCodes` 는 각 명령에 `command.exitOverride((error) => handleCommanderError(command, error))` 를 건다. 재귀 구조와 export 이름은 그대로 둔다.
- `handleCommanderError` 순서
  1. 지금처럼 `commander.missingMandatoryOptionValue` 면 `error.exitCode = EXIT_PARAM_ERROR`.
  2. `error.code === "commander.unknownOption"` 이면 안내를 만든다.
     - `commandPath`: `command` 에서 `parent` 를 따라 올라가며 `name()` 을 모아 루트가 앞에 오게 한다.
     - `usage`: `command.usage()`.
     - `arguments`: `command.registeredArguments.map((a) => ({ name: a.name(), required: a.required, variadic: a.variadic }))`.
     - 결과가 빈 문자열이 아니면 `command.configureOutput().writeErr` 로 쓴다. 없으면 `process.stderr.write` 로 쓴다.
  3. `error` 를 그대로 던진다. `exitCode` 와 `message` 는 바꾸지 않는다.
- 파일 머리의 doc 주석은 「CLI 종료 코드 정책과 알 수 없는 옵션 안내를 적용한다」 처럼 바뀐 책임을 담는다.

### 3. `src/commands/unknown-option-hint.test.ts` 신규

명령 트리 없이 순수 함수만 확인한다. 표본은 `nhncloud commands --json` 의 실제 명령 모양을 쓴다.

`parseUnknownOptionName`

| 입력 | 기대값 |
|---|---|
| `"error: unknown option '--instance-id'"` | `"instance-id"` |
| `"error: unknown option '--instance-id=x'"` | `"instance-id"` |
| `"error: unknown option '--regoin'\n(Did you mean --region?)"` | `"regoin"` |
| `"error: unknown option '-i'"` | `undefined` |
| `"error: required option '--name <name>' not specified"` | `undefined` |

`findReferencedArgument`

| optionName | commandPath | argumentNames | 기대값 | 판정 |
|---|---|---|---|---|
| `id` | `nhncloud instance get` | `id` | `id` | A |
| `volume-id` | `nhncloud instance volume detach` | `id`, `volumeId` | `volumeId` | A가 C보다 앞선다 |
| `instance` | `nhncloud instance security-group add` | `instance-id`, `group` | `instance-id` | B |
| `instance-id` | `nhncloud instance get` | `id` | `id` | C |
| `template-id` | `nhncloud ncs template version get` | `id`, `version` | `id` | C |
| `post` | `nhncloud post get` | `post-number`, `post-id` | `undefined` | B 후보가 둘 |
| `x-id` | `nhncloud x get` | `id`, `x-id-name` | `undefined` | B와 C가 다른 인수 |
| `cluster-id` | `nhncloud nks cluster get` | `cluster` | `undefined` | 범위 밖 |
| `nhncloud-id` | `nhncloud get` | `id` | `undefined` | 루트 이름은 C에서 뺀다 |
| `region` | `nhncloud instance get` | `id` | `undefined` | 맞는 인수 없음 |
| `id` | `nhncloud instance list` | (없음) | `undefined` | 인수 없음 |

`commandPath` 는 공백으로 나눈 배열로 넘긴다.

`buildUnknownOptionHint`

- `instance get` 입력(`usage: "[options] <id>"`, 인수 `{ name: "id", required: true, variadic: false }`)에서 위 두 줄 문자열과 `toBe` 로 같다.
- 선택 인수 `{ name: "region", required: false, variadic: false }`, `--region` 이면 첫 줄에 `위치 인수 [region] 로` 가 든다.
- 가변 인수 `{ name: "ids", required: true, variadic: true }`, `--ids` 면 첫 줄에 `위치 인수 <ids...> 로` 가 든다.
- 맞는 인수가 없는 입력과 `required option` 오류 문구 입력은 빈 문자열이다.
- 메시지가 `"error: unknown option '--volume-id'\n(Did you mean --volume?)"` 이고 commandPath 가 `nhncloud instance volume attach`, 인수가 `id` 하나면 빈 문자열이다. 이 입력은 `findReferencedArgument` 만으로는 `id` 를 돌려준다.

### 4. `src/commands/commander-errors.test.ts` 수정

기존 테스트 다섯 개는 그대로 통과해야 한다.
기존 「알 수 없는 옵션은 기존 code와 exit 1을 유지한다」 는 `leaf` 에 위치 인수가 없어 stderr가 `"error: unknown option '--unknown'\n"` 그대로다. 이 단언을 바꾸지 않는다.

`describe("configureCommanderExitCodes")` 안에 아래를 더한다.
트리는 기존 `createCapturedTree` 와 같은 방식으로 출력을 잡되, 이름을 `nhncloud` → `instance` → `get` 으로 만든다.
`get` 에는 `.argument("<id>")`, `.option("--region <region>")`, `vi.fn()` action 을 둔다. 출력 설정은 `configureCommanderExitCodes` 를 부르기 전에 세 명령 모두에 건다.

- `parseAsync(["instance", "get", "--instance-id", "x"], { from: "user" })` 는 `{ code: "commander.unknownOption", exitCode: 1 }` 로 reject 된다.
  stderr는 정확히 `"error: unknown option '--instance-id'\n안내: --instance-id 는 옵션이 아닙니다. 위치 인수 <id> 로 전달하세요.\n사용법: nhncloud instance get [options] <id>\n"` 이다.
  stdout은 빈 문자열이고 action 은 불리지 않는다.
- `--instance-id x --json` 처럼 루트에 `--json` 옵션을 둔 트리에서 불러도 stdout은 빈 문자열이고 안내는 stderr에 있다. 루트에 `.option("--json")` 을 더해 확인한다.
- `--regoin x` 는 같은 code와 exitCode 1로 reject 되고, stderr에 `(Did you mean --region?)` 가 있으며 `안내:` 가 없다.
- `get` 에 `.option("--instance <name>")` 을 더한 별도 트리에서 `--instance-id x` 는 Commander가 `(Did you mean --instance?)` 를 내므로 stderr에 `안내:` 가 없다. 이 테스트는 제안 억제 분기를 지우면 실패해야 한다.
- `instance --foo` 처럼 위치 인수가 없는 그룹 명령의 알 수 없는 옵션은 stderr가 `"error: unknown option '--foo'\n"` 그대로다.

이 테스트 가운데 첫째는 `commander-errors.ts` 의 안내 연결을 지우면 실패해야 한다. 구현 후 그 분기를 잠시 주석 처리해 첫째 테스트가 실패하는지 확인하고 되돌린다.

테스트 표본에 사내 도메인처럼 보이는 문자열이나 16자 이상의 비밀값 리터럴을 쓰지 않는다. 공개 정보 검사(`scripts/check-pii.mjs`)가 `src/` 도 본다.

## 검증

worktree 에서 `pnpm install` 이 esbuild 실행을 막으면 설치를 반복하지 않고 `node_modules/.bin/` 의 도구를 직접 쓴다.

```bash
node_modules/.bin/vitest run src/commands/unknown-option-hint.test.ts src/commands/commander-errors.test.ts
node_modules/.bin/tsc --noEmit
node_modules/.bin/vitest run
node_modules/.bin/tsup
node dist/index.js instance get --instance-id x 2>&1 >/dev/null | grep -F "사용법: nhncloud instance get [options] <id>"
node dist/index.js instance get --instance-id x 2>/dev/null; test $? -eq 1
test -z "$(node dist/index.js instance get --instance-id x --json 2>/dev/null)"
node dist/index.js instance security-group add --instance a b 2>&1 >/dev/null | grep -F "위치 인수 <instance-id> 로"
! node dist/index.js instance get --idd x 2>&1 | grep -q "안내:"
! node dist/index.js instance volume attach x --volume v --volume-id y 2>&1 | grep -q "안내:"
node dist/index.js instance get --idd x 2>/dev/null; test $? -eq 1
node dist/index.js commands --json > /dev/null
node scripts/check-pii.mjs
git diff --check
```

- 첫 줄의 두 테스트 파일이 모두 통과한다.
- CLI 확인은 자격증명 없이 돈다. 오류가 자격증명을 읽기 전에 나기 때문이다.
- `--json` 을 줘도 stdout이 비어 있어야 한다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `src/commands/unknown-option-hint.ts` | 신규 |
| `src/commands/unknown-option-hint.test.ts` | 신규 |
| `src/commands/commander-errors.ts` | 수정 |
| `src/commands/commander-errors.test.ts` | 수정 |
