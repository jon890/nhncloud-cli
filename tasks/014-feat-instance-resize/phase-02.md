# Phase 02 — 코드: serverAction 재사용 resize 메서드 + command + index 등록

## 목표

phase-01 에서 확정한 설계대로 `instance resize` 를 구현한다.

- `nhncloud instance resize <id> --flavor <flavorId>` — 인스턴스 타입(flavor) 변경.
- resize: `POST /servers/{id}/action`, body `{ "resize": { "flavorRef": "<flavor-id>" } }`, 응답 202 무본문.
- 008 의 공용 `serverAction(id, payload)` 를 재사용한다 (각자 `ky.post` 중복 금지).
- 출력은 부수효과 명령이라 성공 메시지(stderr)만, stdout 은 비운다 (`delete.ts` / `power.ts` 정책).

> **phase-01 선행 필수** — 실측으로 (A) 자동 confirm / (B) 수동 confirm 필요 가 확정돼야 아래 "(B) 추가분" 포함 여부가 결정된다.
> phase-01 이 `blocked` 면 본 phase 를 시작하지 않는다.

## 변경 파일

### (A) 자동 confirm 인 경우 (resize 단일)

1. `src/services/instance/client.ts` — `resize(id, flavorRef)` public 메서드 추가 (serverAction 위임)
2. `src/commands/instance/resize.ts` — 신규 `resizeCommand`
3. `src/index.ts` — `instanceCommand.addCommand(resizeCommand)`

### (B) 수동 confirm 필요인 경우 (resize + confirm/revert — 위 3개 + 아래)

4. `client.ts` 에 `confirmResize(id)` / `revertResize(id)` 메서드 추가 (serverAction 위임)
5. `resize.ts` 에 `resizeConfirmCommand` / `resizeRevertCommand` 추가 export (전원 제어 power.ts 처럼 한 파일에 묶음)
6. `index.ts` 에 두 command 등록

> types.ts 변경 없음 — action payload 는 client 내부 리터럴이라 새 type 이 불필요하다 (008 과 동일).

## 회피 항목 (code-review-pitfalls 사전 확인)

- **1-2 (spinner 후 try/catch + stopSpinner(false))**: resize/confirm/revert command 모두 `client.*` 호출을 `startSpinner` 직후 try/catch 로 감싸고 catch 에서 `stopSpinner(false)` 후 re-throw, 성공 시 `stopSpinner(true)`. `delete.ts` 가 reference.
- **9-1 (exit code 리터럴 금지)**: 입력 검증은 `EXIT_PARAM_ERROR` **상수** import 사용 (숫자 3 리터럴·주석 금지).
- **`--flavor` requiredOption (4-3 dead code 회피)**: `--flavor` 는 `requiredOption` 으로 진입 전 강제 → action 내부 `if (!opts.flavor)` 수동 재검증 두지 않음 (`create.ts` 의 `opts.flavor!` non-null assertion + 이유 주석 패턴 그대로). `<id>` 도 `argument("<id>")` 라 commander 가 진입 전 거부 → 수동 재검증 없음.
- **DRY (serverAction 재사용)**: resize/confirm/revert 가 각자 `ky.post(...action)` 을 쓰지 않고 008 의 `serverAction` 1곳을 경유 (검출 grep 으로 보장).
- **다단계 spinner 전환 시 직전 stop (1-2 재발)**: (B) 에서 `--wait` 자동 confirm 옵션을 채택한 경우에만 — "resize 중..." spinner 를 `stopSpinner(true)` 로 닫은 뒤 "VERIFY_RESIZE 대기 중..." 두 번째 spinner 시작 (create `--wait` PR #6 회귀 패턴). `--wait` 를 안 두면 해당 없음.
- **2-1 / 시그니처 추가 → tsc**: types.ts 는 무변경이나 client 메서드가 늘어나므로 성공 기준에 `pnpm tsc --noEmit` 포함.

## 작업 상세

### 1. `src/services/instance/client.ts`

008 의 `serverAction(id, payload)` (private, POST action, 202 무본문) **를 그대로 재사용**한다.
008 phase-01 의 시그니처: `private async serverAction(id: string, payload: Record<string, unknown>): Promise<void>`.
008 의 `reboot()` 메서드 **뒤** 에 추가한다 (`authHeaders()` / `DEFAULT_TIMEOUT_MS` / `toNhnCloudCliError` 는 기존 것 사용).

```ts
  /**
   * 인스턴스 타입(flavor)을 변경한다 (resize action).
   * POST /servers/{id}/action body { "resize": { "flavorRef": "<flavor-id>" } }, 202 무본문.
   * 사전 상태는 ACTIVE 또는 SHUTOFF (ACTIVE 면 NHN 측에서 중지 후 재시작).
   */
  async resize(id: string, flavorRef: string): Promise<void> {
    return this.serverAction(id, { resize: { flavorRef } });
  }
```

(B) 수동 confirm 인 경우에만 아래 2개를 추가한다 (자동 confirm 이면 추가하지 않음 — 발생 불가 시나리오의 dead code 회피):

```ts
  /** resize 를 확정한다 (VERIFY_RESIZE → ACTIVE, 새 flavor 로 고정). */
  async confirmResize(id: string): Promise<void> {
    return this.serverAction(id, { confirmResize: null });
  }

  /** resize 를 롤백한다 (VERIFY_RESIZE → ACTIVE, 이전 flavor 로 복귀). */
  async revertResize(id: string): Promise<void> {
    return this.serverAction(id, { revertResize: null });
  }
```

> payload 키(`resize`/`flavorRef`/`confirmResize`/`revertResize`)는 NHN/Nova docs 가 명시한 키라 그대로 쓴다 (camelCase 로 임의 변환 금지). 실측에서 확인한 키 표기를 따른다.
> 202 무본문이라 `.json()` 을 호출하지 않는다 (`serverAction` 이 `ky.post` 만 await).

### 2. `src/commands/instance/resize.ts` (신규)

`delete.ts` / `power.ts` 패턴을 따른다. 공통 옵션은 `--region` / `--profile`.

```ts
import { Command } from "commander";
import chalk from "chalk";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { resolveInstanceClient } from "./helpers.js";

interface ResizeGlobalOpts {
  flavor?: string;
  region?: string;
  profile?: string;
}

export const resizeCommand = new Command("resize")
  .description("인스턴스 타입(flavor)을 변경한다")
  .argument("<id>", "인스턴스 ID")
  .requiredOption("--flavor <id>", "변경할 flavor ID (instance flavors 로 후보 조회)")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<ResizeGlobalOpts>();
    const { client } = await resolveInstanceClient(opts);

    startSpinner(`인스턴스 타입 변경 중... (id: ${id})`);
    try {
      // --flavor 는 requiredOption 으로 Commander 가 보장 → non-null assertion 안전
      await client.resize(id, opts.flavor!);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    process.stderr.write(
      chalk.green(`✓ 인스턴스 "${id}" 타입 변경(flavor: ${opts.flavor}) 을 요청했습니다.\n`),
    );
  });
```

(B) 수동 confirm 인 경우에만 같은 파일에 추가 export (자동 confirm 이면 추가하지 않음):

```ts
export const resizeConfirmCommand = new Command("resize-confirm")
  .description("resize 를 확정한다 (VERIFY_RESIZE → ACTIVE, 새 flavor 로 고정)")
  .argument("<id>", "인스턴스 ID")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<ResizeGlobalOpts>();
    const { client } = await resolveInstanceClient(opts);

    startSpinner(`resize 확정 중... (id: ${id})`);
    try {
      await client.confirmResize(id);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    process.stderr.write(chalk.green(`✓ 인스턴스 "${id}" resize 를 확정했습니다 (→ ACTIVE).\n`));
  });

export const resizeRevertCommand = new Command("resize-revert")
  .description("resize 를 롤백한다 (VERIFY_RESIZE → ACTIVE, 이전 flavor 로 복귀)")
  .argument("<id>", "인스턴스 ID")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<ResizeGlobalOpts>();
    const { client } = await resolveInstanceClient(opts);

    startSpinner(`resize 롤백 중... (id: ${id})`);
    try {
      await client.revertResize(id);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    process.stderr.write(chalk.green(`✓ 인스턴스 "${id}" resize 를 롤백했습니다 (이전 flavor 로 복귀).\n`));
  });
```

> 출력은 `output()` 을 쓰지 않는다 — 부수효과 명령이라 stdout 은 비우고 success 만 stderr (`delete.ts` / `power.ts` 정책).
> `confirm` 프롬프트는 두지 않는다 — resize 는 삭제와 달리 가역(revert 가능)이라 사고 위험이 낮다. `delete` 의 TTY confirm 패턴을 복제하지 않는다 (요청 외 기능 추가 금지).

### 3. `src/index.ts`

(a) import 추가 (`deleteCommand` import 다음 줄):

```ts
import { resizeCommand } from "./commands/instance/resize.js";
// (B) 수동 confirm 인 경우만:
// import { resizeCommand, resizeConfirmCommand, resizeRevertCommand } from "./commands/instance/resize.js";
```

(b) `instanceCommand.addCommand(deleteCommand);` **다음** 에 추가:

```ts
instanceCommand.addCommand(resizeCommand);
// (B) 수동 confirm 인 경우만:
// instanceCommand.addCommand(resizeConfirmCommand);
// instanceCommand.addCommand(resizeRevertCommand);
```

## 성공 기준 (검증 명령 + 기대값)

자동 검증은 자격증명·네트워크 없이 help / commander / grep 만으로 통과한다.

```bash
# cwd: <repo root 또는 worktree>

# 1. 타입 체크 — client 시그니처 추가 → 필수
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l
# 기대: 0

# 2. 빌드 성공
pnpm build
# 기대: dist/index.js 생성, exit 0

# 3. resize 가 instance 하위 명령으로 노출
node dist/index.js instance --help 2>&1 | grep -c "resize"
# 기대: 1 이상  (B 면 resize/resize-confirm/resize-revert 로 3 이상)

# 4. resize 에 --flavor 옵션 노출
node dist/index.js instance resize --help 2>&1 | grep -c -- "--flavor"
# 기대: 1

# 5. --flavor 미지정 시 commander 가 진입 전 거부 (requiredOption 강제)
node dist/index.js instance resize <instance-id>; echo "exit=$?"
# 기대: stderr 에 "required option" / "--flavor", exit != 0

# 6. <id> 미입력 시 commander 가 진입 전 거부 (argument 강제)
node dist/index.js instance resize --flavor <flavor-id>; echo "exit=$?"
# 기대: stderr 에 "missing required argument", exit != 0

# 7. exit code 리터럴 미사용 (9-1)
grep -nE "NhnCloudCliError\([^,]+,\s*[0-9]+" src/commands/instance/resize.ts | wc -l
# 기대: 0

# 8. action 내부 --flavor 수동 재검증 없음 (4-3 dead code 회피)
grep -cE "if \(!opts\.flavor\)" src/commands/instance/resize.ts
# 기대: 0

# 9. resize/confirm/revert 가 serverAction 1곳을 경유 (DRY) — client 에 새 ky.post 가 추가되지 않음
grep -cE "ky\.post\(" src/services/instance/client.ts
# 기대: 1  (008 serverAction + create 의 기존 ky.post 만 — resize 메서드는 ky.post 를 새로 추가하지 않음)
#   주: create() 에도 ky.post 가 1곳 있으므로 008 머지 상태에 따라 기대값이 2 일 수 있다.
#   핵심은 "resize/confirm/revert 메서드 본문에 ky.post 가 없다" — 아래로 직접 확인:
grep -nA1 "async resize\|async confirmResize\|async revertResize" src/services/instance/client.ts | grep -c "serverAction"
# 기대: resize 단일이면 1, B(resize+confirm+revert)면 3

# 10. spinner leak 회귀 없음 (1-2) — 각 command 호출이 try/catch 로 감싸짐
grep -cE "stopSpinner\(false\)" src/commands/instance/resize.ts
# 기대: 1 (resize 단일) 또는 3 (B: resize/confirm/revert 각 1회)
```

## 수동 확인 (자격증명 필요 — phase-02 후 사용자/QA)

```bash
# 1. resize 호출
node dist/index.js instance resize <instance-id> --flavor <new-flavor-id>

# 2. 상태 전이 확인
node dist/index.js instance get <instance-id>
#   (A) 자동 confirm: 잠시 후 ACTIVE + flavor 가 <new-flavor-id> 로 바뀜
#   (B) 수동 confirm: VERIFY_RESIZE 에서 대기 → 아래 확정/롤백 필요

# 3. (B) 인 경우 — 확정 또는 롤백
node dist/index.js instance resize-confirm <instance-id>   # 새 flavor 로 고정
# 또는
node dist/index.js instance resize-revert <instance-id>    # 이전 flavor 로 복귀
node dist/index.js instance get <instance-id>              # ACTIVE + flavor 확인
```
