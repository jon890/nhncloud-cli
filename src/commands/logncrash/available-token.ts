import { Command } from "commander";
import { output, type OutputOptions } from "../../formatters/table.js";
import {
  availableTokenStatus,
  type AvailableTokenStatus,
} from "../../services/logncrash/token.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { resolveLogncrashClient } from "./helpers.js";

interface AvailableTokenGlobalOpts extends OutputOptions {
  profile?: string;
}

export const availableTokenCommand = new Command("available-token")
  .description("Log & Crash 남은 조회 토큰과 추정 대기 시간을 확인")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<AvailableTokenGlobalOpts>();
    const client = await resolveLogncrashClient(opts.profile);

    startSpinner("조회 토큰 확인 중...");
    let status: AvailableTokenStatus;
    try {
      const result = await client.availableToken();
      status = availableTokenStatus(result.availableToken);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    output(opts, {
      headers: ["항목", "값"],
      rows: [
        ["남은 조회 토큰", String(status.availableToken)],
        [
          "양수까지 추정 대기 시간(초)",
          status.estimatedWaitSeconds === null
            ? "대기 불필요"
            : String(status.estimatedWaitSeconds),
        ],
      ],
      raw: status,
      ids: [String(status.availableToken)],
    });
  });
