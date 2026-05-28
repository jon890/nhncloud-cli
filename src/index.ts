import { Command } from "commander";
import chalk from "chalk";
import { setQuiet } from "./utils/spinner.js";
import { NhnCloudCliError } from "./utils/errors.js";
import { searchCommand } from "./commands/logncrash/search.js";

const program = new Command();

program
  .name("nhncloud")
  .description("NHN Cloud CLI — AI agent & terminal friendly")
  .version("0.1.0")
  .option("--json", "JSON 형식으로 출력")
  .option("--quiet", "최소 출력 (자동화용)")
  .option("--no-color", "색상 비활성화");

// 전역 옵션 훅 — no-color: chalk 비활성화 / json·quiet: spinner 비활성화
program.hook("preAction", () => {
  const opts = program.opts<{ color: boolean; json?: boolean; quiet?: boolean }>();
  if (!opts.color || process.env["NO_COLOR"]) {
    chalk.level = 0;
  }
  if (opts.json || opts.quiet) {
    setQuiet(true);
  }
});

// logncrash 커맨드 그룹
const logncrashCommand = new Command("logncrash").description("Log & Crash 관련 명령");
logncrashCommand.addCommand(searchCommand);

program.addCommand(logncrashCommand);

program.parseAsync().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  const exitCode = err instanceof NhnCloudCliError ? err.exitCode : 1;
  process.stderr.write(chalk.red(`오류: ${message}`) + "\n");
  process.exit(exitCode);
});
