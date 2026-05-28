import { Command } from "commander";
import chalk from "chalk";
import {
  resolveProfileName,
  setUserAccessKey,
  setServiceCredential,
} from "../config/credentials.js";
import { verifyUserAccessKey, verifyLogncrash } from "./configure-verify.js";
import { NhnCloudCliError } from "../utils/errors.js";
import { EXIT_AUTH_ERROR } from "../utils/exit-codes.js";
import type { UserAccessKey, ServiceCredential } from "../config/types.js";

interface ConfigureOptions {
  profile?: string;
  uakId?: string;
  uakSecret?: string;
  logncrashAppkey?: string;
  logncrashSecret?: string;
  verify: boolean;
}

/**
 * 공통 저장·검증 로직. 대화형/비대화형 양쪽에서 호출.
 */
async function saveAndVerify(
  profileName: string,
  uak: UserAccessKey | undefined,
  logncrash: ServiceCredential | undefined,
  doVerify: boolean,
): Promise<void> {
  // 연결 테스트
  if (doVerify) {
    if (uak) {
      const ok = await verifyUserAccessKey(uak);
      if (ok) {
        process.stderr.write(chalk.green("  ✓ UAK 연결 성공\n"));
      } else {
        throw new NhnCloudCliError(
          "UAK 인증 실패 — uak-id / uak-secret 을 확인하세요.",
          EXIT_AUTH_ERROR,
        );
      }
    }

    if (logncrash) {
      const ok = await verifyLogncrash(logncrash);
      if (ok) {
        process.stderr.write(chalk.green("  ✓ logncrash 연결 성공\n"));
      } else {
        throw new NhnCloudCliError(
          "logncrash 인증 실패 — appkey / secret 을 확인하세요.",
          EXIT_AUTH_ERROR,
        );
      }
    }
  }

  // 머지 저장
  if (uak) {
    await setUserAccessKey(profileName, uak);
  }
  if (logncrash) {
    await setServiceCredential(profileName, "logncrash", logncrash);
  }

  process.stderr.write(chalk.green(`\n✓ profile "${profileName}" 설정이 저장되었습니다.\n`));
}

async function runInteractive(opts: ConfigureOptions): Promise<void> {
  const { input, password, confirm } = await import("@inquirer/prompts");

  // 1. profile 이름
  const defaultProfile = await resolveProfileName(opts.profile);
  const profileName = await input({
    message: "profile 이름을 입력하세요",
    default: defaultProfile,
  });

  // 2. UAK
  process.stderr.write(chalk.gray("\n— 개인 UAK (User Access Key) —\n"));
  const uakId = await input({
    message: "UAK ID",
  });
  const uakSecret = await password({
    message: "UAK Secret",
    mask: "*",
  });
  const uak: UserAccessKey = { id: uakId, secret: uakSecret };

  // 3. logncrash 설정 여부
  let logncrash: ServiceCredential | undefined;
  const setupLogncrash = await confirm({
    message: "logncrash 자격증명도 설정하시겠습니까?",
    default: false,
  });

  if (setupLogncrash) {
    process.stderr.write(chalk.gray("\n— logncrash 자격증명 —\n"));
    const appkey = await input({ message: "logncrash appkey" });
    const secret = await password({ message: "logncrash secret", mask: "*" });
    logncrash = { appkey, secret };
  }

  // 4. 연결 테스트 + 저장
  if (opts.verify) {
    process.stderr.write(chalk.gray("\n— 연결 테스트 중… —\n"));
  }

  if (opts.verify) {
    // 대화형: 실패 시 저장 여부 재확인
    try {
      await saveAndVerify(profileName, uak, logncrash, true);
    } catch (err) {
      if (err instanceof NhnCloudCliError && err.exitCode === EXIT_AUTH_ERROR) {
        process.stderr.write(chalk.red(`  ✗ ${err.message}\n`));
        const saveDespite = await confirm({
          message: "검증 실패에도 저장하시겠습니까?",
          default: false,
        });
        if (!saveDespite) {
          process.stderr.write(chalk.yellow("저장이 취소되었습니다.\n"));
          return;
        }
        await saveAndVerify(profileName, uak, logncrash, false);
      } else {
        throw err;
      }
    }
  } else {
    await saveAndVerify(profileName, uak, logncrash, false);
  }
}

async function runNonInteractive(opts: ConfigureOptions): Promise<void> {
  const profileName = await resolveProfileName(opts.profile);

  const uak: UserAccessKey | undefined =
    opts.uakId && opts.uakSecret ? { id: opts.uakId, secret: opts.uakSecret } : undefined;

  const logncrash: ServiceCredential | undefined =
    opts.logncrashAppkey && opts.logncrashSecret
      ? { appkey: opts.logncrashAppkey, secret: opts.logncrashSecret }
      : undefined;

  if (!uak && !logncrash) {
    throw new NhnCloudCliError(
      "비대화형 모드: --uak-id/--uak-secret 또는 --logncrash-appkey/--logncrash-secret 가 필요합니다.",
      3, // EXIT_PARAM_ERROR
    );
  }

  if (opts.verify) {
    process.stderr.write(chalk.gray("연결 테스트 중…\n"));
  }

  await saveAndVerify(profileName, uak, logncrash, opts.verify);
}

export const configureCommand = new Command("configure")
  .description("자격증명 설정 마법사 (대화형 + flag)")
  .option("--profile <name>", "대상 profile 이름 (기본: default)")
  .option("--uak-id <id>", "개인 UAK ID (비대화형)")
  .option("--uak-secret <secret>", "개인 UAK Secret (비대화형)")
  .option("--logncrash-appkey <key>", "logncrash appkey (비대화형)")
  .option("--logncrash-secret <secret>", "logncrash secret (비대화형)")
  .option("--no-verify", "연결 테스트 생략")
  .action(async (opts: ConfigureOptions) => {
    const hasFlag = opts.uakId || opts.uakSecret || opts.logncrashAppkey || opts.logncrashSecret;

    try {
      if (hasFlag) {
        await runNonInteractive(opts);
      } else {
        await runInteractive(opts);
      }
    } catch (err) {
      // ExitPromptError: Ctrl-C 취소 처리
      if (
        err instanceof Error &&
        (err.constructor.name === "ExitPromptError" || err.message.includes("User force closed"))
      ) {
        process.stderr.write(chalk.yellow("\n취소되었습니다.\n"));
        return;
      }
      throw err;
    }
  });
