# Phase 01 — 코드: instance start / stop / reboot (전원 제어)

## 목표

인스턴스 전원 상태를 제어하는 세 명령을 추가한다.

- `nhncloud instance start <id>` — SHUTOFF → ACTIVE
- `nhncloud instance stop <id>` — ACTIVE/ERROR → SHUTOFF
- `nhncloud instance reboot <id>` — 재부팅 (기본 SOFT, `--hard` 로 HARD)

근거: NHN Cloud Instance public-api docs 의 server action API.

- 세 동작 모두 `POST /v2/{tenantId}/servers/{serverId}/action`, 응답 본문 없음(HTTP 202).
- action body 만 다르다:
  - start: `{"os-start": null}`
  - stop: `{"os-stop": null}`
  - reboot: `{"reboot": {"type": "SOFT"}}` (기본) 또는 `{"reboot": {"type": "HARD"}}` (`--hard`)
- 조회가 아니라 동작이므로 출력은 `delete.ts` 처럼 성공 메시지만 stderr 로 쓴다 (stdout 은 비움).

인증·endpoint 는 기존 `resolveInstanceClient`(ADR-010, `X-Auth-Token` + region 별 compute endpoint) 를 그대로 재사용한다.
새 인증·endpoint 가 없으므로 ADR 을 동반하지 않는다.

설계 포인트:
셋을 공용 내부 helper `serverAction(id, payload)` (POST action, 202 무본문) 로 묶어 client 에 추가한다.
`start`/`stop`/`reboot` public 메서드는 각자 payload 만 만들어 `serverAction` 에 위임한다.
resize/shelve 등 다른 action 도 향후 이 helper 를 재사용한다.

## 변경 파일 (3개)

1. `src/services/instance/client.ts` — private `serverAction(id, payload)` + public `start(id)` / `stop(id)` / `reboot(id, type)` 메서드 추가 (types.ts 변경 없음)
2. `src/commands/instance/power.ts` — 신규 파일 1개에 `startCommand` / `stopCommand` / `rebootCommand` 3개 export
3. `src/index.ts` — 세 command 를 instance 하위로 등록

> types.ts 변경 없음 — action payload 는 client 내부 리터럴이라 새 type 이 불필요하다.
> reboot type 은 `"SOFT" | "HARD"` 유니온 리터럴로 메서드 시그니처에만 둔다.

## 회피 항목 (code-review-pitfalls 사전 확인)

- **1-2 (spinner 후 try/catch + stopSpinner(false))**: 세 command 모두 `client.start/stop/reboot` 호출을
  `startSpinner` 직후 try/catch 로 감싸고 catch 에서 `stopSpinner(false)` 후 re-throw, 성공 시 `stopSpinner(true)`.
  `delete.ts` 가 reference.
- **9-1 (exit code 리터럴 금지)**: 입력 검증 실패는 `EXIT_PARAM_ERROR` **상수** import 사용 (숫자 3 리터럴·주석 금지).
- **reboot `--hard` 외 입력 검증**: reboot type 은 commander `--hard` boolean flag 하나로만 결정한다
  (`--hard` 있으면 HARD, 없으면 SOFT). `--type SOFT|HARD` 같은 자유 문자열 옵션을 두지 않는다 — 자유 입력은 검증 코드를 부르므로 boolean flag 로 입력 공간을 닫는다.
- **4-3 (requiredOption dead code 해당 없음)**: `<id>` 는 `requiredOption` 이 아니라 commander `argument("<id>")` 이므로 미입력 시 commander 가 진입 전 거부한다. action 내부 `if (!id)` 수동 재검증을 두지 않는다.
- **2-1 / type 변경 → tsc**: types.ts 는 변경 없지만 client 시그니처가 늘어나므로 성공 기준에 `pnpm tsc --noEmit` 포함.
- **DRY (serverAction 재사용)**: start/stop/reboot 가 각자 `ky.post(...action)` 을 중복 작성하지 않는다 — 반드시 `serverAction` 1곳을 경유한다 (검출 grep 으로 보장).

## 작업 상세

### 1. `src/services/instance/client.ts`

`delete()` 메서드 **뒤** (또는 `waitForActive` 앞 적당한 위치) 에 추가한다.
`authHeaders()` / `DEFAULT_TIMEOUT_MS` / `toNhnCloudCliError` 는 기존 것을 그대로 쓴다.

```ts
  /**
   * 서버 action 을 실행한다 (POST /servers/{id}/action, 202 무본문).
   * NHN Cloud(OpenStack Nova)의 모든 전원·라이프사이클 action 의 공용 경로다.
   * payload 는 호출자가 action 별로 구성한다 (예: { "os-start": null }).
   * start/stop/reboot 가 이 helper 를 재사용하며, resize/shelve 등 향후 action 도 동일.
   */
  private async serverAction(id: string, payload: Record<string, unknown>): Promise<void> {
    const url = `${this.computeEndpoint}/servers/${encodeURIComponent(id)}/action`;
    try {
      await ky.post(url, {
        headers: this.authHeaders(),
        json: payload,
        retry: 0,
        timeout: DEFAULT_TIMEOUT_MS,
      });
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  /** 인스턴스를 시작한다 (SHUTOFF → ACTIVE). */
  async start(id: string): Promise<void> {
    return this.serverAction(id, { "os-start": null });
  }

  /** 인스턴스를 정지한다 (ACTIVE/ERROR → SHUTOFF). */
  async stop(id: string): Promise<void> {
    return this.serverAction(id, { "os-stop": null });
  }

  /** 인스턴스를 재부팅한다. type 기본 SOFT, HARD 는 강제 전원 cycle. */
  async reboot(id: string, type: "SOFT" | "HARD" = "SOFT"): Promise<void> {
    return this.serverAction(id, { reboot: { type } });
  }
```

> 202 무본문이라 `.json()` 을 호출하지 않는다 (`delete()` 와 동일 — `ky.post` 만 await).
> payload 의 `os-start`/`os-stop` 은 NHN docs 가 명시한 키라 그대로 쓴다 (camelCase 로 바꾸지 말 것).

### 2. `src/commands/instance/power.ts` (신규)

`delete.ts` 패턴을 따른다. 한 파일에 3개 command 를 export 한다 (전원 제어로 묶음).
공통 옵션은 `--region` / `--profile`.

```ts
import { Command } from "commander";
import chalk from "chalk";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { resolveInstanceClient } from "./helpers.js";

interface PowerGlobalOpts {
  region?: string;
  profile?: string;
}

interface RebootGlobalOpts extends PowerGlobalOpts {
  hard?: boolean;
}

export const startCommand = new Command("start")
  .description("인스턴스를 시작한다 (SHUTOFF → ACTIVE)")
  .argument("<id>", "인스턴스 ID")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<PowerGlobalOpts>();
    const { client } = await resolveInstanceClient(opts);

    startSpinner(`인스턴스 시작 중... (id: ${id})`);
    try {
      await client.start(id);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    process.stderr.write(chalk.green(`✓ 인스턴스 "${id}" 시작을 요청했습니다 (→ ACTIVE).\n`));
  });

export const stopCommand = new Command("stop")
  .description("인스턴스를 정지한다 (ACTIVE/ERROR → SHUTOFF)")
  .argument("<id>", "인스턴스 ID")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<PowerGlobalOpts>();
    const { client } = await resolveInstanceClient(opts);

    startSpinner(`인스턴스 정지 중... (id: ${id})`);
    try {
      await client.stop(id);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    process.stderr.write(chalk.green(`✓ 인스턴스 "${id}" 정지를 요청했습니다 (→ SHUTOFF).\n`));
  });

export const rebootCommand = new Command("reboot")
  .description("인스턴스를 재부팅한다 (기본 SOFT, --hard 로 HARD)")
  .argument("<id>", "인스턴스 ID")
  .option("--hard", "HARD 재부팅 (강제 전원 cycle, 기본은 SOFT)")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<RebootGlobalOpts>();
    const { client } = await resolveInstanceClient(opts);

    const type = opts.hard ? "HARD" : "SOFT";

    startSpinner(`인스턴스 재부팅 중... (id: ${id}, ${type})`);
    try {
      await client.reboot(id, type);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    process.stderr.write(chalk.green(`✓ 인스턴스 "${id}" ${type} 재부팅을 요청했습니다.\n`));
  });
```

> 출력은 `output()` 을 쓰지 않는다 — 부수효과 명령이라 stdout 은 비우고 success 만 stderr (delete.ts 정책).
> `type` 은 `opts.hard` boolean 에서만 파생하므로 별도 입력 검증 함수가 없다 (입력 공간을 flag 로 닫음).

### 3. `src/index.ts`

(a) import 추가 (`deleteCommand` import 다음 줄):

```ts
import { startCommand, stopCommand, rebootCommand } from "./commands/instance/power.js";
```

(b) `instanceCommand.addCommand(deleteCommand);` **다음** 에 추가:

```ts
instanceCommand.addCommand(startCommand);
instanceCommand.addCommand(stopCommand);
instanceCommand.addCommand(rebootCommand);
```

## 성공 기준 (검증 명령 + 기대값)

```bash
# cwd: <repo root 또는 worktree>

# 1. 타입 체크 — client 시그니처 추가 → 필수
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l
# 기대: 0

# 2. 빌드 성공
pnpm build
# 기대: dist/index.js 생성, exit 0

# 3. 세 명령이 instance 하위로 노출
node dist/index.js instance --help 2>&1 | grep -Ec -- "start|stop|reboot"
# 기대: 3 이상

# 4. reboot 에 --hard 플래그 노출
node dist/index.js instance reboot --help 2>&1 | grep -c -- "--hard"
# 기대: 1

# 5. start/stop 에는 --hard 가 없음 (입력 공간을 flag 로 좁힌 결과)
node dist/index.js instance start --help 2>&1 | grep -c -- "--hard"
# 기대: 0

# 6. <id> 미입력 시 commander 가 진입 전 거부 (argument 강제)
node dist/index.js instance start; echo "exit=$?"
# 기대: stderr 에 "missing required argument", exit != 0

# 7. exit code 리터럴 미사용 (9-1)
grep -nE "NhnCloudCliError\([^,]+,\s*[0-9]+" src/commands/instance/power.ts | wc -l
# 기대: 0

# 8. start/stop/reboot 가 serverAction 1곳을 경유 (DRY) — client 에 action ky.post 가 1번만
grep -cE "/servers/.*\$\{.*\}.*/action|servers/\$\{encodeURIComponent\(id\)\}/action" src/services/instance/client.ts
# 기대: 1  (serverAction 안의 단일 url 조립만)

# 9. spinner leak 회귀 없음 (1-2) — 각 action 호출이 try/catch 로 감싸짐
grep -cE "stopSpinner\(false\)" src/commands/instance/power.ts
# 기대: 3  (start/stop/reboot 각 1회)
```

성공 기준 3~7 은 자격증명·네트워크 없이 help / commander 검증만으로 통과한다.

## 수동 확인 (자격증명 필요 — phase-02 후 사용자/QA)

```bash
node dist/index.js instance stop <instance-id>
node dist/index.js instance start <instance-id>
node dist/index.js instance reboot <instance-id>
node dist/index.js instance reboot <instance-id> --hard
# 각 호출 후 `instance get <instance-id>` 로 status 전이 확인 (SHUTOFF / ACTIVE)
```
