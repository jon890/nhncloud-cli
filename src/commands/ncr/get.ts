import { Command } from "commander";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { createNcrClient, resolveAppKey } from "./helpers.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import type { Registry } from "../../services/ncr/types.js";

interface GetOpts extends OutputOptions {
  region?: string;
  appKey?: string;
  profile?: string;
}

export const getCommand = new Command("get")
  .description("단일 NCR 레지스트리를 조회한다")
  .argument("<registry>", "레지스트리 이름 또는 ID")
  .option("--region <region>", "NCR region (기본: kr1)", "kr1")
  .option("--app-key <key>", "NCR appKey (profile 의 ncr.appkey 보다 우선)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (registry: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<GetOpts>();

    // ── 1. 파라미터 검증 (spinner 시작 전) — 빈값/공백 거절 ──
    if (!registry.trim()) {
      throw new NhnCloudCliError(
        "registry 인수가 비어있습니다. 레지스트리 이름 또는 ID 를 지정하세요.",
        EXIT_PARAM_ERROR,
      );
    }

    // ── 2. 자격증명 + client 생성 (spinner 시작 전) ──
    const { client, profileName } = await createNcrClient(opts);
    const appKey = await resolveAppKey(profileName, opts.appKey);

    // ── 3. API 호출 (spinner 내부) ──
    startSpinner(`레지스트리 "${registry}" 조회 중...`);

    let reg: Registry;
    try {
      reg = await client.getRegistry(appKey, registry);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }

    stopSpinner(true);

    // ── 4. 출력 ──
    output(opts, {
      headers: ["name", "repo_count", "uri", "private_uri"],
      rows: [[reg.name, String(reg.repo_count ?? ""), reg.uri ?? "", reg.private_uri ?? ""]],
      raw: reg,
      ids: [reg.name],
    });
  });
