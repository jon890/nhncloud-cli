import { Command } from "commander";
import chalk from "chalk";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { resolveInstanceClient } from "./helpers.js";

interface ResizeGlobalOpts {
  flavor?: string;
  region?: string;
  profile?: string;
}

interface ResizeConfirmRevertOpts {
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
      chalk.green(
        `✓ 인스턴스 "${id}" 타입 변경(flavor: ${opts.flavor}) 을 요청했습니다 (→ VERIFY_RESIZE, instance get 으로 확인 후 resize-confirm/resize-revert).\n`,
      ),
    );
  });

export const resizeConfirmCommand = new Command("resize-confirm")
  .description("resize 를 확정한다 (VERIFY_RESIZE → ACTIVE, 새 flavor 로 고정)")
  .argument("<id>", "인스턴스 ID")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<ResizeConfirmRevertOpts>();
    const { client } = await resolveInstanceClient(opts);

    startSpinner(`resize 확정 중... (id: ${id})`);
    try {
      await client.confirmResize(id);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    process.stderr.write(chalk.green(`✓ 인스턴스 "${id}" resize 확정을 요청했습니다 (→ ACTIVE).\n`));
  });

export const resizeRevertCommand = new Command("resize-revert")
  .description("resize 를 롤백한다 (VERIFY_RESIZE → ACTIVE, 이전 flavor 로 복귀)")
  .argument("<id>", "인스턴스 ID")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<ResizeConfirmRevertOpts>();
    const { client } = await resolveInstanceClient(opts);

    startSpinner(`resize 롤백 중... (id: ${id})`);
    try {
      await client.revertResize(id);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    process.stderr.write(
      chalk.green(`✓ 인스턴스 "${id}" resize 롤백을 요청했습니다 (이전 flavor 로 복귀).\n`),
    );
  });
