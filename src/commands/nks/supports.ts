import { Command } from "commander";
import { output, type OutputOptions } from "../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { resolveNksClient } from "./helpers.js";
import type { NksSupports } from "../../services/nks/types.js";

interface SupportsGlobalOpts extends OutputOptions {
  region?: string;
  profile?: string;
}

export const supportsCommand = new Command("supports")
  .description("NKS 지원 Kubernetes 버전과 event type 을 조회한다")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<SupportsGlobalOpts>();

    const { client } = await resolveNksClient(opts);

    startSpinner("NKS 지원 정보 조회 중...");

    let supports: NksSupports;
    try {
      supports = await client.supports();
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    output(opts, {
      headers: ["kubernetes_version", "supported"],
      rows: Object.entries(supports.supported_k8s).map(([version, supported]) => [
        version,
        String(supported),
      ]),
      raw: supports,
      ids: Object.keys(supports.supported_k8s),
    });
  });
