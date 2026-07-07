import { Command } from "commander";
import chalk from "chalk";
import { access } from "node:fs/promises";
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
      console.error(chalk.yellow(`Claude Code 설정 디렉터리(${claudeDir()})가 없습니다. Claude Code 설치 후 다시 시도하세요.`));
      return;
    }

    if (isNpxRuntime(__dirname)) {
      console.error(
        chalk.yellow("npx 환경에서는 스킬 설치가 불가합니다(임시 경로). npm i -g @bifos/nhncloud-cli 후 다시 시도하세요."),
      );
      return;
    }

    const src = skillSourceFrom(__dirname);
    const dst = skillDestPath();
    const result = await installSkillSymlink(src, dst, opts.force ?? false);
    console.log(chalk.green(`✓ 스킬 ${result === "relinked" ? "재설치" : "설치"} 완료: ${dst}`));
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
