import { Command } from "commander";
import chalk from "chalk";
import { access } from "node:fs/promises";
import { NhnCloudCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";
import {
  SKILL_NAME,
  claudeDir,
  skillDestPath,
  skillSourceFrom,
  isNpxRuntime,
  getSkillStatus,
  installSkillSymlink,
  uninstallSkill,
} from "../utils/skill-install.js";

/** getSkillStatus 결과를 사람이 읽는 한 줄로 변환한다(stdout 출력 전용). */
function describeStatus(status: Awaited<ReturnType<typeof getSkillStatus>>): string {
  switch (status.state) {
    case "installed-link":
      return chalk.green(`✓ 설치됨 (심볼릭 링크 → ${status.target})`);
    case "broken-link":
      return chalk.yellow(`⚠ 링크 깨짐 (${status.target} 없음) — skills install 로 재설치`);
    case "installed-copy":
      return chalk.green("✓ 설치됨 (실제 복사본)");
    case "not-installed":
      return chalk.gray("미설치 — nhncloud skills install 로 설치");
  }
}

const installCommand = new Command("install")
  .description("Claude Code 스킬을 ~/.claude/skills 에 심볼릭 링크로 설치한다")
  .option("--force", "심볼릭 링크가 아닌 기존 항목도 덮어쓴다")
  .action(async (opts: { force?: boolean }) => {
    const hasClaude = await access(claudeDir()).then(() => true).catch(() => false);
    if (!hasClaude) {
      throw new NhnCloudCliError(
        `Claude Code 설정 디렉터리(${claudeDir()})가 없습니다. Claude Code 설치 후 다시 시도하세요.`,
        EXIT_PARAM_ERROR,
      );
    }

    if (isNpxRuntime(__dirname)) {
      throw new NhnCloudCliError(
        "npx 환경에서는 스킬 설치가 불가합니다(임시 경로). npm i -g @bifos/nhncloud-cli 후 다시 시도하세요.",
        EXIT_PARAM_ERROR,
      );
    }

    const src = skillSourceFrom(__dirname);
    const dst = skillDestPath();
    const result = await installSkillSymlink(src, dst, opts.force ?? false);
    if (result === "replaced-copy") {
      console.error(chalk.yellow(`기존 실제 디렉터리를 제거하고 심볼릭 링크로 교체했습니다: ${dst}`));
    }
    console.log(chalk.green(`✓ 스킬 ${result === "linked" ? "설치" : "재설치"} 완료: ${dst}`));
  });

const uninstallCommand = new Command("uninstall")
  .description("설치된 Claude Code 스킬 심볼릭 링크를 제거한다")
  .action(async () => {
    const dst = skillDestPath();
    const result = await uninstallSkill(dst);
    if (result === "absent") {
      console.log(chalk.gray("설치된 스킬이 없습니다."));
      return;
    }
    console.log(chalk.green(`✓ 스킬 제거 완료: ${dst}`));
  });

export const skillsCommand = new Command("skills")
  .description(`Claude Code 스킬(${SKILL_NAME}) 설치 관리`)
  .addCommand(installCommand)
  .addCommand(uninstallCommand)
  .action(async () => {
    // 서브커맨드 없이 호출 시 현재 설치 상태를 출력한다.
    const status = await getSkillStatus(skillDestPath());
    console.log(`Claude Code 스킬 (${SKILL_NAME}): ${describeStatus(status)}`);
  });
