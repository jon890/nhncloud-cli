import { Command } from "commander";
import { output, type OutputOptions } from "../formatters/table.js";

export interface CommandCatalogEntry {
  path: string;
  description: string;
  arguments: string[];
  options: string[];
  subcommands: string[];
  metadata?: boolean;
}

export interface CommandCatalog {
  commands: CommandCatalogEntry[];
}

interface CommandsOpts extends OutputOptions {}

function commandPath(command: Command): string {
  const names: string[] = [];
  let current: Command | null = command;

  while (current?.parent) {
    names.unshift(current.name());
    current = current.parent;
  }

  return names.join(" ");
}

function collectCommand(command: Command): CommandCatalogEntry | null {
  const path = commandPath(command);
  if (!path || path === "help") return null;

  return {
    path,
    description: command.description() || command.summary() || "",
    arguments: command.registeredArguments.map((arg) => arg.name()),
    options: command.options.filter((option) => !option.hidden).map((option) => option.flags),
    subcommands: command.commands.map((subcommand) => subcommand.name()).filter((name) => name !== "help"),
    ...(path === "commands" ? { metadata: true } : {}),
  };
}

export function collectCommandCatalog(program: Command): CommandCatalog {
  const commands: CommandCatalogEntry[] = [];

  function visit(command: Command): void {
    const entry = collectCommand(command);
    if (entry) commands.push(entry);
    for (const subcommand of command.commands) {
      visit(subcommand);
    }
  }

  for (const command of program.commands) {
    visit(command);
  }

  commands.sort((a, b) => a.path.localeCompare(b.path));
  return { commands };
}

export function createCommandsCommand(program: Command): Command {
  return new Command("commands")
    .description("명령 경로와 옵션 catalog를 출력한다")
    .action((_opts: unknown, cmd: Command) => {
      const opts = cmd.optsWithGlobals<CommandsOpts>();
      const catalog = collectCommandCatalog(program);

      output(opts, {
        headers: ["path", "description", "options"],
        rows: catalog.commands.map((entry) => [
          entry.path,
          entry.description,
          entry.options.join(", "),
        ]),
        raw: catalog,
        ids: catalog.commands.map((entry) => entry.path),
      });
    });
}
