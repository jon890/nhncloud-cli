import { Command } from "commander";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { resolveInstanceClient } from "./helpers.js";
import type { Keypair } from "../../services/instance/types.js";

interface KeypairsGlobalOpts extends OutputOptions {
  region?: string;
  profile?: string;
}

export const keypairsCommand = new Command("keypairs")
  .description("키페어 목록을 조회한다 (name·fingerprint, 전체 필드는 --json)")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<KeypairsGlobalOpts>();
    const { client } = await resolveInstanceClient(opts);

    startSpinner("키페어 목록 조회 중...");
    let keypairs: Keypair[];
    try {
      keypairs = await client.listKeypairs();
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    output(opts, {
      headers: ["name", "fingerprint"],
      rows: keypairs.map((k) => [k.name, k.fingerprint]),
      raw: keypairs,
      ids: keypairs.map((k) => k.name),
    });
  });
