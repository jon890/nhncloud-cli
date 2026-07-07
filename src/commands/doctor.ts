import { Command } from "commander";
import chalk from "chalk";
import { readFile, access } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { SKILL_NAME, claudeDir, skillDestPath, getSkillStatus } from "../utils/skill-install.js";

const CREDENTIALS_PATH = path.join(homedir(), ".nhncloud", "credentials.json");
const CONFIG_PATH = path.join(homedir(), ".nhncloud", "config.json");

interface CredentialsSummary {
  profiles: string[];
  parseError: boolean;
  missing: boolean;
}

/** credentials.json 을 읽어 profile 이름 목록만 뽑는다(비밀값은 읽되 노출하지 않는다). */
async function readProfiles(): Promise<CredentialsSummary> {
  let raw: string;
  try {
    raw = await readFile(CREDENTIALS_PATH, "utf-8");
  } catch {
    return { profiles: [], parseError: false, missing: true };
  }
  try {
    const parsed = JSON.parse(raw) as { profiles?: Record<string, unknown> };
    return { profiles: Object.keys(parsed.profiles ?? {}), parseError: false, missing: false };
  } catch {
    return { profiles: [], parseError: true, missing: false };
  }
}

/** config.json 의 defaultProfile 을 읽는다(없거나 오류면 null). */
async function readDefaultProfile(): Promise<string | null> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as { defaultProfile?: string };
    return parsed.defaultProfile ?? null;
  } catch {
    return null;
  }
}

export const doctorCommand = new Command("doctor")
  .description("자격증명·스킬 설치 상태를 진단한다(오프라인 — 연결 테스트는 configure 로)")
  .action(async () => {
    console.log(chalk.bold("\n🔍 nhncloud-cli 진단\n"));

    // 자격증명
    const creds = await readProfiles();
    const defaultProfile = await readDefaultProfile();

    console.log(chalk.bold("자격증명"));
    if (creds.missing) {
      console.log(`  ${chalk.red("❌ 미설정")} — ${CREDENTIALS_PATH} 없음. nhncloud configure 로 설정하세요.`);
    } else if (creds.parseError) {
      console.log(`  ${chalk.red("❌ 파싱 오류")} — ${CREDENTIALS_PATH} 가 올바른 JSON 인지 확인하세요.`);
    } else if (creds.profiles.length === 0) {
      console.log(`  ${chalk.yellow("⚠ profile 없음")} — nhncloud configure 로 설정하세요.`);
    } else {
      console.log(`  ${chalk.green("✓ 설정됨")} — profile: ${creds.profiles.join(", ")}`);
      console.log(`  기본 profile: ${defaultProfile ? chalk.green(defaultProfile) : chalk.gray("미지정 (default 사용)")}`);
    }

    // Claude Code 스킬
    console.log(chalk.bold("\nClaude Code 스킬"));
    const hasClaude = await access(claudeDir()).then(() => true).catch(() => false);
    if (!hasClaude) {
      console.log(`  ${chalk.gray("Claude Code 미설치")} — ${claudeDir()} 없음`);
    } else {
      const status = await getSkillStatus(skillDestPath());
      switch (status.state) {
        case "installed-link":
          console.log(`  ${SKILL_NAME}: ${chalk.green("✓ 설치됨 (심볼릭 링크)")}`);
          break;
        case "broken-link":
          console.log(`  ${SKILL_NAME}: ${chalk.yellow("⚠ 링크 깨짐 — nhncloud skills install 로 재설치")}`);
          break;
        case "installed-copy":
          console.log(`  ${SKILL_NAME}: ${chalk.green("✓ 설치됨 (실제 복사본)")}`);
          break;
        case "not-installed":
          console.log(`  ${SKILL_NAME}: ${chalk.gray("미설치 — nhncloud skills install 로 설치")}`);
          break;
      }
    }

    // 요약
    console.log();
    if (!creds.missing && !creds.parseError && creds.profiles.length > 0) {
      console.log(chalk.green("✓ 기본 설정이 완료되었습니다."));
    } else {
      console.log(chalk.yellow("⚠ 설정이 필요합니다: nhncloud configure"));
    }
    console.log();
  });
