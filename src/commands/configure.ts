import { Command } from "commander";
import chalk from "chalk";
import { ExitPromptError } from "@inquirer/core";
import {
  resolveProfileName,
  setUserAccessKey,
  setServiceCredential,
  setIaasCredential,
} from "../config/credentials.js";
import { verifyUserAccessKey, verifyLogncrash, verifyIaas } from "./configure-verify.js";
import { NhnCloudCliError } from "../utils/errors.js";
import { EXIT_AUTH_ERROR, EXIT_PARAM_ERROR } from "../utils/exit-codes.js";
import type { UserAccessKey, ServiceCredential, IaasCredential } from "../config/types.js";

interface ConfigureOptions {
  profile?: string;
  uakId?: string;
  uakSecret?: string;
  logncrashAppkey?: string;
  logncrashSecret?: string;
  iaasTenantId?: string;
  iaasUsername?: string;
  iaasPassword?: string;
  iaasRegion?: string;
  verify: boolean;
}

/**
 * 공통 저장·검증 로직. 대화형/비대화형 양쪽에서 호출.
 */
async function saveAndVerify(
  profileName: string,
  uak: UserAccessKey | undefined,
  logncrash: ServiceCredential | undefined,
  iaas: IaasCredential | undefined,
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

    if (iaas) {
      const ok = await verifyIaas(iaas);
      if (ok) {
        process.stderr.write(chalk.green("  ✓ iaas 연결 성공\n"));
      } else {
        throw new NhnCloudCliError(
          "iaas 인증 실패 — tenantId / username / API 비밀번호를 확인하세요.",
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
  if (iaas) {
    await setIaasCredential(profileName, iaas);
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

  // 4. iaas 설정 여부
  let iaas: IaasCredential | undefined;
  const setupIaas = await confirm({
    message: "iaas (Compute) 자격증명도 설정하시겠습니까?",
    default: false,
  });

  if (setupIaas) {
    process.stderr.write(chalk.gray("\n— iaas (Compute) 자격증명 —\n"));
    process.stderr.write(
      chalk.yellow(
        "  ※ password 는 NHN Cloud 콘솔 IAM 의 API 비밀번호입니다 (로그인 비밀번호가 아닙니다).\n",
      ),
    );
    const { select } = await import("@inquirer/prompts");
    const tenantId = await input({ message: "tenantId (프로젝트 ID)" });
    const iaasUsername = await input({ message: "IAM username" });
    const iaasPassword = await password({ message: "API 비밀번호", mask: "*" });
    const region = await select({
      message: "region",
      choices: [
        { value: "kr1", name: "kr1 (한국 판교)" },
        { value: "kr2", name: "kr2 (한국 평촌)" },
        { value: "kr3", name: "kr3 (한국 광주)" },
        { value: "jp1", name: "jp1 (일본 도쿄)" },
      ],
      default: "kr1",
    });
    iaas = { tenantId, username: iaasUsername, password: iaasPassword, region };
  }

  // 5. 연결 테스트 + 저장
  if (opts.verify) {
    process.stderr.write(chalk.gray("\n— 연결 테스트 중… —\n"));
  }

  if (opts.verify) {
    // 대화형: 실패 시 저장 여부 재확인
    try {
      await saveAndVerify(profileName, uak, logncrash, iaas, true);
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
        await saveAndVerify(profileName, uak, logncrash, iaas, false);
      } else {
        throw err;
      }
    }
  } else {
    await saveAndVerify(profileName, uak, logncrash, iaas, false);
  }
}

async function runNonInteractive(opts: ConfigureOptions): Promise<void> {
  const profileName = await resolveProfileName(opts.profile);

  // secret 은 환경변수로도 받는다 — cmdline 인수는 `ps aux` 로 평문 노출되므로 권장.
  const uakSecret = opts.uakSecret ?? process.env["NHNCLOUD_UAK_SECRET"];
  const logncrashSecret = opts.logncrashSecret ?? process.env["NHNCLOUD_LOGNCRASH_SECRET"];
  const iaasPassword = opts.iaasPassword ?? process.env["NHNCLOUD_IAAS_PASSWORD"];

  const uak: UserAccessKey | undefined =
    opts.uakId && uakSecret ? { id: opts.uakId, secret: uakSecret } : undefined;

  const logncrash: ServiceCredential | undefined =
    opts.logncrashAppkey && logncrashSecret
      ? { appkey: opts.logncrashAppkey, secret: logncrashSecret }
      : undefined;

  const iaas: IaasCredential | undefined =
    opts.iaasTenantId && opts.iaasUsername && iaasPassword
      ? {
          tenantId: opts.iaasTenantId,
          username: opts.iaasUsername,
          password: iaasPassword,
          region: opts.iaasRegion ?? "kr1",
        }
      : undefined;

  if (!uak && !logncrash && !iaas) {
    throw new NhnCloudCliError(
      "비대화형 모드: --uak-id + UAK secret, --logncrash-appkey + logncrash secret,\n" +
        "또는 --iaas-tenant-id + --iaas-username + iaas password 중 하나가 필요합니다.\n" +
        "secret/password 는 노출 방지를 위해 환경변수 권장:\n" +
        "NHNCLOUD_UAK_SECRET / NHNCLOUD_LOGNCRASH_SECRET / NHNCLOUD_IAAS_PASSWORD.",
      EXIT_PARAM_ERROR,
    );
  }

  if (opts.verify) {
    process.stderr.write(chalk.gray("연결 테스트 중…\n"));
  }

  await saveAndVerify(profileName, uak, logncrash, iaas, opts.verify);
}

export const configureCommand = new Command("configure")
  .description("자격증명 설정 마법사 (대화형 + flag)")
  .option("--profile <name>", "대상 profile 이름 (기본: default)")
  .option("--uak-id <id>", "개인 UAK ID (비대화형)")
  .option("--uak-secret <secret>", "개인 UAK Secret (비대화형, 노출 방지로 env NHNCLOUD_UAK_SECRET 권장)")
  .option("--logncrash-appkey <key>", "logncrash appkey (비대화형)")
  .option("--logncrash-secret <secret>", "logncrash secret (비대화형, env NHNCLOUD_LOGNCRASH_SECRET 권장)")
  .option("--iaas-tenant-id <id>", "iaas tenantId / 프로젝트 ID (비대화형)")
  .option("--iaas-username <user>", "iaas IAM username (비대화형)")
  .option(
    "--iaas-password <pass>",
    "iaas API 비밀번호 (비대화형, 노출 방지로 env NHNCLOUD_IAAS_PASSWORD 권장)",
  )
  .option("--iaas-region <region>", "iaas region (기본: kr1)", "kr1")
  .option("--no-verify", "연결 테스트 생략")
  .action(async (opts: ConfigureOptions) => {
    const hasFlag =
      opts.uakId ||
      opts.uakSecret ||
      opts.logncrashAppkey ||
      opts.logncrashSecret ||
      opts.iaasTenantId ||
      opts.iaasUsername ||
      opts.iaasPassword;

    try {
      if (hasFlag) {
        await runNonInteractive(opts);
      } else {
        await runInteractive(opts);
      }
    } catch (err) {
      // ExitPromptError: Ctrl-C 취소 처리
      if (err instanceof ExitPromptError) {
        process.stderr.write(chalk.yellow("\n취소되었습니다.\n"));
        return;
      }
      throw err;
    }
  });
