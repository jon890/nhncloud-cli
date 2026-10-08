import { Command, CommanderError } from "commander";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";
import { buildUnknownOptionHint } from "./unknown-option-hint.js";

function writeUnknownOptionHint(command: Command, error: CommanderError): void {
  const commandPath: string[] = [];
  for (let current: Command | null = command; current !== null; current = current.parent) {
    commandPath.unshift(current.name());
  }

  const hint = buildUnknownOptionHint({
    message: error.message,
    commandPath,
    usage: command.usage(),
    arguments: command.registeredArguments.map((argument) => ({
      name: argument.name(),
      required: argument.required,
      variadic: argument.variadic,
    })),
  });
  if (hint === "") {
    return;
  }

  const writeErr = command.configureOutput().writeErr;
  if (writeErr) {
    writeErr(hint);
  } else {
    process.stderr.write(hint);
  }
}

function handleCommanderError(command: Command, error: CommanderError): never {
  if (error.code === "commander.missingMandatoryOptionValue") {
    error.exitCode = EXIT_PARAM_ERROR;
  } else if (error.code === "commander.unknownOption") {
    writeUnknownOptionHint(command, error);
  }

  throw error;
}

/** 완성된 Commander 트리 전체에 CLI 종료 코드 정책과 알 수 없는 옵션 안내를 적용한다. */
export function configureCommanderExitCodes(root: Command): void {
  root.exitOverride((error) => handleCommanderError(root, error));

  for (const command of root.commands) {
    configureCommanderExitCodes(command);
  }
}
