import { Command } from "commander";
import chalk from "chalk";
import {
  getIaasCredential,
  getOptionalServiceCredential,
  getUserAccessKey,
  inspectConfigFile,
  inspectCredentialsFile,
  resolveProfileName,
  type ConfigFileInspection,
  type CredentialsFileInspection,
} from "../config/credentials.js";
import type { IaasCredential, ServiceCredential, UserAccessKey } from "../config/types.js";
import { printJson } from "../formatters/table.js";
import { createSkillManagerContext, type SkillManagerContext } from "../skill/context.js";
import { inspectAgentSkill, type SkillStatus } from "../skill/manager.js";
import { NhnCloudCliError } from "../utils/errors.js";
import { EXIT_API_ERROR } from "../utils/exit-codes.js";
import { sanitizeForTerminal } from "../utils/terminal.js";
import {
  verifyIaas,
  verifyLogncrash,
  verifyNcr,
  verifyNcs,
  verifyUserAccessKey,
} from "./configure-verify.js";
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

export interface DoctorConnectionDependencies {
  getUserAccessKey: (profileName: string) => Promise<UserAccessKey>;
  getIaasCredential: (profileName: string) => Promise<IaasCredential>;
  getOptionalServiceCredential: (service: string, profileName: string) => Promise<ServiceCredential | undefined>;
  verifyUserAccessKey: (uak: UserAccessKey) => Promise<boolean>;
  verifyIaas: (iaas: IaasCredential) => Promise<boolean>;
  verifyLogncrash: (uak: UserAccessKey, appkey: string) => Promise<boolean>;
  verifyNcr: (uak: UserAccessKey, appkey: string) => Promise<boolean>;
  verifyNcs: (uak: UserAccessKey, appkey: string) => Promise<boolean>;
}

export interface DoctorDependencies {
  inspectCredentials: () => Promise<CredentialsFileInspection>;
  inspectConfig: () => Promise<ConfigFileInspection>;
  resolveProfile: (cliProfile?: string) => Promise<string>;
  createSkillContext: () => SkillManagerContext;
  inspectSkill: (context: SkillManagerContext) => Promise<SkillStatus>;
  connection: DoctorConnectionDependencies;
}

const defaultDependencies: DoctorDependencies = {
  inspectCredentials: inspectCredentialsFile,
  inspectConfig: inspectConfigFile,
  resolveProfile: resolveProfileName,
  createSkillContext: createSkillManagerContext,
  inspectSkill: (c) => inspectAgentSkill(c, "claude"),
  connection: {
    getUserAccessKey,
    getIaasCredential,
    getOptionalServiceCredential,
    verifyUserAccessKey,
    verifyIaas,
    verifyLogncrash,
    verifyNcr,
    verifyNcs,
  },
};

interface DoctorCommandOptions {
  profile?: string;
  json?: boolean;
  quiet?: boolean;
  checkConnection?: boolean;
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

const CONNECTION_TARGETS: DoctorConnectionTarget[] = ["userAccessKey", "iaas", "logncrash", "ncr", "ncs"];

function skipAll(reason: DoctorConnectionResult["reason"]): Record<DoctorConnectionTarget, DoctorConnectionResult> {
  return Object.fromEntries(
    CONNECTION_TARGETS.map((target) => [target, { status: "skipped", reason }]),
  ) as Record<DoctorConnectionTarget, DoctorConnectionResult>;
}

/**
 * verify 함수 결과를 보고서 값으로 바꾼다.
 * 오류 메시지는 요청 URL 의 appkey 를 담을 수 있어 종료 코드만 남긴다.
 */
async function runVerify(verify: () => Promise<boolean>): Promise<DoctorConnectionResult> {
  try {
    return (await verify()) ? { status: "ok" } : { status: "failed", reason: "auth" };
  } catch (err) {
    const exitCode = err instanceof NhnCloudCliError ? err.exitCode : EXIT_API_ERROR;
    return { status: "failed", reason: "error", exitCode };
  }
}

/**
 * 필수 블록 getter 를 부른다.
 * 설정 누락(NhnCloudCliError)은 not-configured, 그 밖의 예외(진단 이후 파일 변경 등)는 profile-unavailable 이다.
 */
async function readRequired<T>(
  read: () => Promise<T>,
): Promise<{ value: T } | { skipped: DoctorConnectionResult }> {
  try {
    return { value: await read() };
  } catch (err) {
    const reason = err instanceof NhnCloudCliError ? "not-configured" : "profile-unavailable";
    return { skipped: { status: "skipped", reason } };
  }
}

/** appkey 를 쓰는 서비스 블록을 읽는다. getter 예외는 원인을 가리지 않고 profile-unavailable 이다. */
async function readAppkey(
  service: "logncrash" | "ncr" | "ncs",
  profileName: string,
  deps: DoctorConnectionDependencies,
): Promise<{ appkey: string } | { skipped: DoctorConnectionResult }> {
  try {
    const credential = await deps.getOptionalServiceCredential(service, profileName);
    if (!credential?.appkey) return { skipped: { status: "skipped", reason: "not-configured" } };
    return { appkey: credential.appkey };
  } catch {
    return { skipped: { status: "skipped", reason: "profile-unavailable" } };
  }
}

/**
 * 대상 profile 의 연결을 순차로 확인한다.
 * 공공망 자격증명은 일반망 주소로 보내지 않는다(ADR-037).
 * 진단 결과가 실패여도 예외를 던지지 않는다(ADR-042).
 */
async function checkConnection(
  profileName: string | null,
  credentials: CredentialsFileInspection,
  profileSummary: CredentialsFileInspection["profiles"][number] | undefined,
  deps: DoctorConnectionDependencies,
): Promise<Record<DoctorConnectionTarget, DoctorConnectionResult>> {
  if (
    credentials.state !== "ok" ||
    profileName === null ||
    profileSummary === undefined ||
    profileSummary.environment === "invalid"
  ) {
    return skipAll("profile-unavailable");
  }
  if (profileSummary.environment === "gov") return skipAll("gov-unsupported");

  const uakRead = await readRequired(() => deps.getUserAccessKey(profileName));
  const uak = "value" in uakRead ? uakRead.value : undefined;
  const userAccessKey =
    "value" in uakRead ? await runVerify(() => deps.verifyUserAccessKey(uakRead.value)) : uakRead.skipped;

  const iaasRead = await readRequired(() => deps.getIaasCredential(profileName));
  const iaasResult = "value" in iaasRead ? await runVerify(() => deps.verifyIaas(iaasRead.value)) : iaasRead.skipped;

  const checkAppkeyService = async (
    service: "logncrash" | "ncr" | "ncs",
    verify: (uak: UserAccessKey, appkey: string) => Promise<boolean>,
    usesOAuth: boolean,
  ): Promise<DoctorConnectionResult> => {
    const read = await readAppkey(service, profileName, deps);
    if ("skipped" in read) return read.skipped;
    if (uak === undefined) return { status: "skipped", reason: "uak-missing" };
    if (usesOAuth && userAccessKey.status !== "ok") return { status: "skipped", reason: "uak-failed" };
    return runVerify(() => verify(uak, read.appkey));
  };

  const logncrash = await checkAppkeyService("logncrash", deps.verifyLogncrash, true);
  const ncr = await checkAppkeyService("ncr", deps.verifyNcr, false);
  const ncs = await checkAppkeyService("ncs", deps.verifyNcs, true);

  return { userAccessKey, iaas: iaasResult, logncrash, ncr, ncs };
}

export async function buildDoctorReport(
  options: { profile?: string; checkConnection?: boolean },
  dependencies: DoctorDependencies,
): Promise<DoctorReport> {
  const credentials = await dependencies.inspectCredentials();
  const config = await dependencies.inspectConfig();
  const profileName = await resolveTargetProfile(options.profile, dependencies);
  const profileSummary =
    credentials.state === "ok" && profileName !== null
      ? credentials.profiles.find((summary) => summary.name === profileName)
      : undefined;
  const connection: DoctorConnection = options.checkConnection
    ? {
        checked: true,
        profile: profileName,
        targets: await checkConnection(profileName, credentials, profileSummary, dependencies.connection),
      }
    : { checked: false };
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

const SKIP_REASONS: Partial<Record<NonNullable<DoctorConnectionResult["reason"]>, string>> = {
  "not-configured": "설정 없음",
  "uak-missing": "공통 userAccessKey 없음",
  "uak-failed": "userAccessKey 확인이 성공하지 않아 건너뜀",
  "gov-unsupported": "공공망 profile 은 연결 확인을 지원하지 않음",
  "profile-unavailable": "대상 profile 을 읽을 수 없음",
};

function printConnectionSection(connection: DoctorConnection): void {
  if (!connection.checked) return;
  line(chalk.bold("\n연결 확인"));
  for (const target of CONNECTION_TARGETS) {
    const result = connection.targets[target];
    const label = `  ${target}:`;
    if (result.status === "ok") {
      const region = target === "ncr" || target === "ncs" ? " (kr1)" : "";
      line(`${label} ${chalk.green(`✓ 성공${region}`)}`);
    } else if (result.status === "failed" && result.reason === "auth") {
      line(`${label} ${chalk.red("❌ 인증 실패")} — 키나 appkey 를 확인하세요.`);
    } else if (result.status === "failed") {
      line(`${label} ${chalk.red(`❌ 오류 (종료 코드 ${result.exitCode ?? EXIT_API_ERROR})`)}`);
    } else {
      const reason = result.reason ? (SKIP_REASONS[result.reason] ?? result.reason) : "";
      line(`${label} ${chalk.gray(`건너뜀 — ${reason}`)}`);
    }
  }
}

function printText(report: DoctorReport): void {
  line(chalk.bold("\n🔍 nhncloud-cli 진단\n"));
  printCredentialsSection(report.credentials);
  printConfigSection(report.config);
  printProfileSection(report.profile);
  printConnectionSection(report.connection);
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
    .description("자격증명·설정·스킬 상태를 진단한다(기본 오프라인, --check-connection 으로 연결 확인)")
    .option("--profile <name>", "진단할 profile 이름")
    .option("--check-connection", "대상 profile 의 자격증명으로 실제 연결을 확인한다 (외부 API 호출)")
    .action(async (_opts: unknown, cmd: Command) => {
      const opts = cmd.optsWithGlobals<DoctorCommandOptions>();
      const report = await buildDoctorReport(
        { profile: opts.profile, checkConnection: opts.checkConnection },
        dependencies,
      );

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
