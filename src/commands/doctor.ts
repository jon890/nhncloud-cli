import { Command } from "commander";
import chalk from "chalk";
import {
  inspectConfigFile,
  inspectCredentialsFile,
  resolveProfileName,
  type ConfigFileInspection,
  type CredentialsFileInspection,
} from "../config/credentials.js";
import { printJson } from "../formatters/table.js";
import { createSkillManagerContext, type SkillManagerContext } from "../skill/context.js";
import { inspectSkill, type SkillStatus } from "../skill/manager.js";
import { NhnCloudCliError } from "../utils/errors.js";
import { sanitizeForTerminal } from "../utils/terminal.js";
import { skillRecoveryCommand } from "./skills-output.js";

const SKILL_NAME = "nhncloud-cli";
const SKILL_ERROR_REASON = "공개 스킬 상태를 판정하지 못했습니다";

export type DoctorConnectionTarget = "userAccessKey" | "iaas" | "logncrash" | "ncr" | "ncs";

export interface DoctorConnectionResult {
  status: "ok" | "failed" | "skipped";
  reason?:
    | "auth"
    | "error"
    | "not-configured"
    | "uak-missing"
    | "uak-failed"
    | "gov-unsupported"
    | "profile-unavailable";
  exitCode?: number;
}

export type DoctorConnection =
  | { checked: false }
  | {
      checked: true;
      profile: string | null;
      targets: Record<DoctorConnectionTarget, DoctorConnectionResult>;
    };

export type DoctorSkillAgentStatus =
  | (SkillStatus & { recoveryCommand: string | null })
  | { status: "error"; reason: string };

export interface DoctorReport {
  schemaVersion: 1;
  ready: boolean;
  credentials: CredentialsFileInspection;
  config: ConfigFileInspection;
  profile: { name: string | null; exists: boolean };
  connection: DoctorConnection;
  skills: { agents: { claude: DoctorSkillAgentStatus } };
}

export interface DoctorDependencies {
  inspectCredentials: () => Promise<CredentialsFileInspection>;
  inspectConfig: () => Promise<ConfigFileInspection>;
  resolveProfile: (cliProfile?: string) => Promise<string>;
  createSkillContext: () => SkillManagerContext;
  inspectSkill: (context: SkillManagerContext) => Promise<SkillStatus>;
}

const defaultDependencies: DoctorDependencies = {
  inspectCredentials: inspectCredentialsFile,
  inspectConfig: inspectConfigFile,
  resolveProfile: resolveProfileName,
  createSkillContext: createSkillManagerContext,
  inspectSkill,
};

interface DoctorCommandOptions {
  profile?: string;
  json?: boolean;
  quiet?: boolean;
}

/** profile 해석 실패는 사용자 설정 문제이므로 보고서의 null 로 바꾼다. */
async function resolveTargetProfile(
  cliProfile: string | undefined,
  dependencies: DoctorDependencies,
): Promise<string | null> {
  try {
    return await dependencies.resolveProfile(cliProfile);
  } catch (err) {
    if (err instanceof NhnCloudCliError) return null;
    throw err;
  }
}

/**
 * 스킬 판정 오류는 보고서 필드로 바꾼다.
 * 오류 메시지는 경로나 파일 내용을 담을 수 있어 고정 문구와 오류 코드만 남긴다.
 */
async function inspectClaudeSkill(dependencies: DoctorDependencies): Promise<DoctorSkillAgentStatus> {
  try {
    const status = await dependencies.inspectSkill(dependencies.createSkillContext());
    return { ...status, recoveryCommand: skillRecoveryCommand(status.status) ?? null };
  } catch (err) {
    const code =
      typeof err === "object" && err !== null && "code" in err && typeof err.code === "string"
        ? err.code
        : undefined;
    return { status: "error", reason: code ? `${SKILL_ERROR_REASON}: ${code}` : SKILL_ERROR_REASON };
  }
}

function connectionHasFailure(connection: DoctorConnection): boolean {
  return (
    connection.checked &&
    Object.values(connection.targets).some((target) => target.status === "failed")
  );
}

export async function buildDoctorReport(
  options: { profile?: string },
  dependencies: DoctorDependencies,
): Promise<DoctorReport> {
  const credentials = await dependencies.inspectCredentials();
  const config = await dependencies.inspectConfig();
  const profileName = await resolveTargetProfile(options.profile, dependencies);
  const profileSummary =
    credentials.state === "ok" && profileName !== null
      ? credentials.profiles.find((summary) => summary.name === profileName)
      : undefined;
  const connection: DoctorConnection = { checked: false };
  const claude = await inspectClaudeSkill(dependencies);

  const ready =
    profileSummary !== undefined &&
    profileSummary.environment !== "invalid" &&
    profileSummary.blocks.length > 0 &&
    !connectionHasFailure(connection);

  return {
    schemaVersion: 1,
    ready,
    credentials,
    config,
    profile: { name: profileName, exists: profileSummary !== undefined },
    connection,
    skills: { agents: { claude } },
  };
}

function line(text = ""): void {
  process.stdout.write(`${text}\n`);
}

function printCredentialsSection(credentials: CredentialsFileInspection): void {
  const filePath = sanitizeForTerminal(credentials.path);
  const reason = sanitizeForTerminal(credentials.reason ?? "");

  line(chalk.bold("자격증명"));
  switch (credentials.state) {
    case "missing":
      line(`  ${chalk.red("❌ 미설정")} — ${filePath} 없음. nhncloud configure 로 설정하세요.`);
      break;
    case "invalid":
      line(`  ${chalk.red("❌ 형식 오류")} — ${filePath}: ${reason}`);
      break;
    case "unreadable":
      line(`  ${chalk.red("❌ 읽기 실패")} — ${filePath}: ${reason}`);
      break;
    case "ok":
      if (credentials.profiles.length === 0) {
        line(`  ${chalk.yellow("⚠ profile 없음")} — nhncloud configure 로 설정하세요.`);
        break;
      }
      line(`  ${chalk.green("✓ 설정됨")} — profile:`);
      for (const summary of credentials.profiles) {
        const name = sanitizeForTerminal(summary.name);
        const blocks = summary.blocks.map(sanitizeForTerminal).join(", ") || "-";
        if (summary.environment === "invalid") {
          line(`    ${name} ${chalk.yellow("⚠ environment 값이 올바르지 않습니다")} [${blocks}]`);
        } else {
          line(`    ${name}${summary.environment === "gov" ? " (gov)" : ""} [${blocks}]`);
        }
      }
      break;
  }

  if (credentials.permissions === "too-open") {
    line(`  ${chalk.yellow("⚠ 파일 권한이 넓습니다")} — chmod 600 ${filePath}`);
  }
}

function printConfigSection(config: ConfigFileInspection): void {
  line(chalk.bold("\n설정 파일"));
  if (config.state === "invalid" || config.state === "unreadable") {
    line(
      `  ${chalk.red(config.state === "invalid" ? "❌ 형식 오류" : "❌ 읽기 실패")} — ` +
        `${sanitizeForTerminal(config.path)}: ${sanitizeForTerminal(config.reason ?? "")}`,
    );
  }
  line(
    `  기본 profile: ${
      config.defaultProfile
        ? chalk.green(sanitizeForTerminal(config.defaultProfile))
        : chalk.gray("미지정 (default 사용)")
    }`,
  );
}

function printProfileSection(profile: DoctorReport["profile"]): void {
  line(chalk.bold("\n대상 profile"));
  if (profile.name === null) {
    line(`  ${chalk.red("❌ 해석 실패")} — config.json 을 먼저 고치세요.`);
  } else if (profile.exists) {
    line(`  ${chalk.green(`✓ ${sanitizeForTerminal(profile.name)}`)}`);
  } else {
    line(
      `  ${chalk.yellow(`⚠ ${sanitizeForTerminal(profile.name)} 없음`)} — nhncloud configure 로 설정하세요.`,
    );
  }
}

function printSkillSection(skill: DoctorSkillAgentStatus): void {
  line(chalk.bold("\nClaude Code 스킬"));
  if (skill.status === "error") {
    line(`  ${SKILL_NAME}: ${chalk.yellow("⚠ error")} — ${sanitizeForTerminal(skill.reason)}`);
  } else if (skill.status === "current") {
    const version = sanitizeForTerminal(skill.installedVersion ?? skill.currentVersion);
    line(`  ${SKILL_NAME}: ${chalk.green(`✓ current (${version})`)}`);
  } else if (skill.status === "missing") {
    line(`  ${SKILL_NAME}: ${chalk.gray(`미설치 — ${skill.recoveryCommand}`)}`);
  } else {
    line(`  ${SKILL_NAME}: ${chalk.yellow(`⚠ ${skill.status}`)} — ${skill.recoveryCommand}`);
  }
}

function printText(report: DoctorReport): void {
  line(chalk.bold("\n🔍 nhncloud-cli 진단\n"));
  printCredentialsSection(report.credentials);
  printConfigSection(report.config);
  printProfileSection(report.profile);
  printSkillSection(report.skills.agents.claude);

  line();
  if (report.ready) {
    line(chalk.green("✓ 기본 설정이 완료되었습니다."));
  } else {
    line(chalk.yellow("⚠ 설정이 필요합니다: nhncloud configure"));
  }
  line();
}

export function createDoctorCommand(dependencies: DoctorDependencies = defaultDependencies): Command {
  return new Command("doctor")
    .description("자격증명·스킬 설치 상태를 진단한다(오프라인 — 연결 테스트는 configure 로)")
    .option("--profile <name>", "진단할 profile 이름")
    .action(async (_opts: unknown, cmd: Command) => {
      const opts = cmd.optsWithGlobals<DoctorCommandOptions>();
      const report = await buildDoctorReport({ profile: opts.profile }, dependencies);

      if (opts.json) {
        printJson(report);
      } else if (opts.quiet) {
        process.stdout.write(report.ready ? "ready\n" : "not-ready\n");
      } else {
        printText(report);
      }
    });
}

export const doctorCommand = createDoctorCommand();
