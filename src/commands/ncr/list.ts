import { Command } from "commander";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { createNcrClient, resolveAppKey } from "./helpers.js";
import type { Registry } from "../../services/ncr/types.js";

interface ListOpts extends OutputOptions {
  region?: string;
  profile?: string;
}

export const listCommand = new Command("list")
  .description("NCR 레지스트리 목록을 조회한다")
  .option("--region <region>", "NCR region (기본: kr1)", "kr1")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<ListOpts>();

    // ── 1. 자격증명 + client 생성 (spinner 시작 전) ──
    const { client, profileName } = await createNcrClient(opts);
    const appKey = await resolveAppKey(profileName);

    // ── 2. API 호출 (spinner 내부) ──
    startSpinner("레지스트리 목록 조회 중...");

    let registries: Registry[];
    try {
      registries = await client.listRegistries(appKey);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }

    stopSpinner(true);

    // ── 3. 출력 ──
    output(opts, {
      headers: ["name", "repo_count", "uri"],
      rows: registries.map((r) => [
        r.name,
        String(r.repo_count ?? ""),
        r.uri ?? "",
      ]),
      raw: registries,
      ids: registries.map((r) => r.name),
    });
  });
