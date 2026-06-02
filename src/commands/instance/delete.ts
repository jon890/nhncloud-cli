import { Command } from "commander";
import chalk from "chalk";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { resolveInstanceClient } from "./helpers.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

interface DeleteGlobalOpts {
  yes?: boolean;
  region?: string;
  profile?: string;
}

export const deleteCommand = new Command("delete")
  .description("인스턴스를 삭제한다")
  .argument("<id>", "인스턴스 ID")
  .option("--yes", "확인 프롬프트 생략 (CI/비대화형 필수)")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<DeleteGlobalOpts>();

    // ── 1. TTY / --yes 검증 ──
    const isTTY = process.stdin.isTTY;

    if (!isTTY && !opts.yes) {
      // non-TTY 에서 --yes 없으면 사고 방지로 거부
      throw new NhnCloudCliError(
        "비대화형 환경에서 인스턴스 삭제는 --yes 플래그가 필요합니다.",
        EXIT_PARAM_ERROR,
      );
    }

    if (isTTY && !opts.yes) {
      // TTY 에서 --yes 미지정 시 confirm 프롬프트
      const { confirm } = await import("@inquirer/prompts");
      const ok = await confirm({
        message: `인스턴스 "${id}" 를 삭제하시겠습니까?`,
        default: false,
      });
      if (!ok) {
        process.stderr.write(chalk.yellow("삭제가 취소되었습니다.\n"));
        return;
      }
    }

    // ── 2. 자격증명 + token 획득 (spinner 시작 전) ──
    const { client } = await resolveInstanceClient(opts);

    // ── 3. 삭제 (spinner 내부) ──
    startSpinner(`인스턴스 삭제 중... (id: ${id})`);

    try {
      await client.delete(id);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }

    stopSpinner(true);

    // ── 4. 출력 — 부수효과 명령: success 는 stderr, stdout 은 비움 ──
    process.stderr.write(chalk.green(`✓ 인스턴스 "${id}" 가 삭제되었습니다.\n`));
  });
