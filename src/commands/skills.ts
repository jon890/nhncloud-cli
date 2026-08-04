import { Command } from "commander";
import type { OutputOptions } from "../formatters/table.js";
import { createSkillManagerContext, type SkillManagerContext } from "../skill/context.js";
import {
  inspectSkill,
  installSkill,
  uninstallSkill,
  type SkillInstallResult,
  type SkillStatus,
} from "../skill/manager.js";
import {
  outputSkillInstallResult,
  outputSkillStatus,
  outputSkillUninstallResult,
} from "./skills-output.js";

const SKILL_NAME = "nhncloud-cli";

interface SkillCommandOptions extends OutputOptions {
  force?: boolean;
}

export interface SkillCommandDependencies {
  createContext: () => SkillManagerContext;
  inspect: (context: SkillManagerContext) => Promise<SkillStatus>;
  install: (
    context: SkillManagerContext,
    options?: { force?: boolean },
  ) => Promise<SkillInstallResult>;
  uninstall: (context: SkillManagerContext) => Promise<"removed" | "absent">;
}

const defaultDependencies: SkillCommandDependencies = {
  createContext: createSkillManagerContext,
  inspect: inspectSkill,
  install: installSkill,
  uninstall: uninstallSkill,
};

async function showStatus(
  cmd: Command,
  dependencies: SkillCommandDependencies,
): Promise<void> {
  const opts = cmd.optsWithGlobals<SkillCommandOptions>();
  const context = dependencies.createContext();
  outputSkillStatus(opts, await dependencies.inspect(context));
}

function createInstallCommand(
  name: "install" | "update",
  dependencies: SkillCommandDependencies,
): Command {
  return new Command(name)
    .description(
      name === "install"
        ? "Claude Code 스킬을 관리 저장소에 설치한다"
        : "Claude Code 스킬을 현재 CLI 버전으로 갱신한다",
    )
    .option("--force", "사용자 항목이나 수정·손상된 관리 저장소를 백업 후 교체한다")
    .action(async (_localOpts: unknown, cmd: Command) => {
      const opts = cmd.optsWithGlobals<SkillCommandOptions>();
      const context = dependencies.createContext();
      const result = await dependencies.install(context, { force: opts.force ?? false });
      outputSkillInstallResult(opts, result);
    });
}

export function createSkillsCommand(
  dependencies: SkillCommandDependencies = defaultDependencies,
): Command {
  const statusCommand = new Command("status")
    .description("Claude Code 스킬의 관리 상태를 조회한다")
    .action(async (_opts: unknown, cmd: Command) => showStatus(cmd, dependencies));

  const uninstallCommand = new Command("uninstall")
    .description("활성 Claude Code 스킬 링크를 제거한다")
    .action(async (_opts: unknown, cmd: Command) => {
      const opts = cmd.optsWithGlobals<SkillCommandOptions>();
      const context = dependencies.createContext();
      const previousStatus = await dependencies.inspect(context);
      const action = await dependencies.uninstall(context);
      const result = {
        schemaVersion: 1 as const,
        action,
        changed: action === "removed",
        status: "missing" as const,
        destination: previousStatus.destination,
        repositoryPreserved: true as const,
      };

      outputSkillUninstallResult(opts, result);
    });

  return new Command("skills")
    .description(`Claude Code 스킬(${SKILL_NAME}) 설치 관리`)
    .addCommand(statusCommand)
    .addCommand(createInstallCommand("install", dependencies))
    .addCommand(createInstallCommand("update", dependencies))
    .addCommand(uninstallCommand)
    .action(async (_opts: unknown, cmd: Command) => showStatus(cmd, dependencies));
}

export const skillsCommand = createSkillsCommand();
