# Phase 02. 모든 하위 명령 도움말에 전역 옵션을 보인다

**Execution profile**: fast

## 목표

`nhncloud logncrash search --help` 처럼 하위 명령의 도움말에 루트 전역 옵션(`--json`, `--quiet`, `--no-color`, `--request-timeout`)이 `Global Options:` 절로 나오게 한다.
GitHub 이슈 #118 을 해결한다. 지금은 루트 도움말에만 보여서, 하위 명령 도움말만 읽은 에이전트가 `--json` 을 모르고 표 출력을 파싱하다 실패했다.

**범위 외**: 전역 옵션의 이름, 설명, 동작은 바꾸지 않는다. 오류 처리 경계(phase 01)와 하네스 정리(phase 03)는 다른 phase 다.

## 컨텍스트

- 전역 옵션은 `src/index.ts` 의 루트 `program` 에만 선언돼 있다.
- commander 14 의 `configureHelp({ showGlobalOptions: true })` 를 걸면 하위 명령 도움말에 `Global Options:` 절이 생긴다.
- 하위 명령은 모두 `addCommand` 로 붙는데, `addCommand` 는 부모의 help 설정을 복사하지 않는다. 루트에만 걸면 하위 명령에 적용되지 않는 것을 실측했다. 트리를 순회하며 각 명령에 걸어야 한다.
- Load Balancer 만 이미 이렇게 하고 있다. `src/commands/loadbalancer/help.ts` 의 `configureLoadBalancerHelp(command)` 가 그 트리를 순회한다. `src/index.ts` 가 `configureLoadBalancerHelp(loadbalancerCommand)` 로 부른다.
- 트리 전체에 정책을 거는 선례로 `src/commands/commander-errors.ts` 의 `configureCommanderExitCodes(root)` 가 있다. `src/index.ts` 끝에서 `configureCommanderExitCodes(program)` 로 부른다.

**근거 문서**: `docs/code-architecture.md` 의 「명령 실행 경계」 절. 명령 트리를 만든 뒤 `src/commands/help.ts` 가 모든 하위 명령 도움말에 루트 전역 옵션을 보여 준다고 적혀 있다.

## 의도 메모

- Load Balancer 전용 함수를 남기지 않고 공통 함수로 옮긴다. 남기면 같은 순회가 두 곳에 생긴다.
- `configureHelp` 는 기존 help 설정을 통째로 바꾸므로, 다른 help 설정을 건 명령이 있는지 `grep -rn "configureHelp" src` 로 먼저 확인한다. 계획 시점에는 `src/commands/loadbalancer/help.ts` 한 곳뿐이었다.

## 작업 항목

### 1. `src/commands/help.ts` 신규

```ts
/** 완성된 Commander 트리 전체에서 하위 명령 도움말이 루트 전역 옵션을 보여 주게 한다. */
export function configureGlobalOptionsHelp(root: Command): void
```

- 본문은 `src/commands/loadbalancer/help.ts` 와 같다. `command.configureHelp({ showGlobalOptions: true })` 후 `command.commands` 를 재귀 순회한다.

### 2. `src/commands/loadbalancer/help.ts` 삭제와 호출부 변경

- `src/commands/loadbalancer/help.ts` 를 지운다.
- `src/index.ts`: `configureLoadBalancerHelp` import 와 `configureLoadBalancerHelp(loadbalancerCommand);` 호출을 지운다.
  `configureCommanderExitCodes(program);` 바로 옆에서 `configureGlobalOptionsHelp(program);` 를 부른다. 명령 트리를 모두 붙인 뒤여야 한다.
- 아래 테스트 세 파일의 `import { configureLoadBalancerHelp } from "./help.js";` 를 `import { configureGlobalOptionsHelp } from "../help.js";` 로, 호출부 이름도 함께 바꾼다.
  - `src/commands/loadbalancer/commands.test.ts`
  - `src/commands/loadbalancer/write.test.ts`
  - `src/commands/loadbalancer/target.test.ts`

### 3. `src/commands/help.test.ts` 신규

- 루트에 `--json` 옵션을 둔 `Command` 를 만들고, 그 아래 그룹과 하위 명령을 `addCommand` 로 두 단계 붙인다.
- `configureGlobalOptionsHelp(root)` 를 부르기 전에는 하위 명령 `helpInformation()` 에 `--json` 이 없고, 부른 뒤에는 `Global Options:` 와 `--json` 이 있음을 확인한다.

## 검증

```bash
node_modules/.bin/vitest run src/commands/help.test.ts src/commands/loadbalancer/commands.test.ts src/commands/loadbalancer/write.test.ts src/commands/loadbalancer/target.test.ts
node_modules/.bin/tsc --noEmit
node_modules/.bin/vitest run
node_modules/.bin/tsup
node dist/index.js logncrash search --help | grep -c -- --json
node dist/index.js skm keystore auth add --help | grep -c "Global Options:"
node dist/index.js loadbalancer list --help | grep -c "Global Options:"
node dist/index.js commands --json > /dev/null
```

- grep 세 줄은 모두 `1` 이상이어야 한다.
- `grep -rn "configureLoadBalancerHelp" src` 결과가 0건이어야 한다.

## 변경 파일

| 파일 | 변경 |
|---|---|
| `src/commands/help.ts` | 신규 |
| `src/commands/help.test.ts` | 신규 |
| `src/commands/loadbalancer/help.ts` | 삭제 |
| `src/index.ts` | 수정 |
| `src/commands/loadbalancer/commands.test.ts` | 수정 |
| `src/commands/loadbalancer/write.test.ts` | 수정 |
| `src/commands/loadbalancer/target.test.ts` | 수정 |
