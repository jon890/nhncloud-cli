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
