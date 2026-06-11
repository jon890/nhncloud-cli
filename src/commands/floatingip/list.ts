import { Command } from "commander";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { resolveNetworkClient } from "../network/helpers.js";
import type { FloatingIp } from "../../services/network/types.js";

interface ListGlobalOpts extends OutputOptions {
  region?: string;
  profile?: string;
}

export const listCommand = new Command("list")
  .description("Floating IP 목록을 조회한다")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<ListGlobalOpts>();

    // ── 1. 자격증명 + token 획득 (spinner 시작 전) ──
    const { client } = await resolveNetworkClient(opts);

    // ── 2. API 호출 (spinner 내부) ──
    startSpinner("Floating IP 목록 조회 중...");

    let fips: FloatingIp[];
    try {
      fips = await client.listFloatingIps();
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    // ── 3. 출력 ──
    output(opts, {
      headers: ["id", "floating_ip_address", "status", "port_id", "fixed_ip_address"],
      rows: fips.map((f) => [
        f.id,
        f.floating_ip_address,
        f.status,
        f.port_id ?? "-",
        f.fixed_ip_address ?? "-",
      ]),
      raw: fips,
      ids: fips.map((f) => f.id),
    });
  });
