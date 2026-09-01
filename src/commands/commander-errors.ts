import { Command, CommanderError } from "commander";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

function throwWithNormalizedExitCode(error: CommanderError): never {
  if (error.code === "commander.missingMandatoryOptionValue") {
    error.exitCode = EXIT_PARAM_ERROR;
  }

  throw error;
}

/** 완성된 Commander 트리 전체에 CLI 종료 코드 정책을 적용한다. */
export function configureCommanderExitCodes(root: Command): void {
  root.exitOverride(throwWithNormalizedExitCode);

  for (const command of root.commands) {
    configureCommanderExitCodes(command);
  }
}
