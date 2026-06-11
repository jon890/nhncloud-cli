import { Command } from "commander";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { resolveNetworkClient } from "./helpers.js";
import type { VpcSubnet } from "../../services/network/types.js";

interface SubnetListGlobalOpts extends OutputOptions {
  region?: string;
  profile?: string;
}

const subnetListCommand = new Command("list")
  .description("서브넷 목록을 조회한다 (전체 필드는 --json)")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<SubnetListGlobalOpts>();

    const { client } = await resolveNetworkClient(opts);

    startSpinner("서브넷 목록 조회 중...");

    let subnets: VpcSubnet[];
    try {
      subnets = await client.listSubnets();
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    output(opts, {
      headers: ["id", "cidr", "vpc_id", "gateway", "available_ip"],
      rows: subnets.map((s) => [
        s.id,
        s.cidr,
        s.vpc_id,
        s.gateway,
        String(s.available_ip_count),
      ]),
      raw: subnets,
      ids: subnets.map((s) => s.id),
    });
  });

/** `network subnet` 부모 — 현재 하위는 list 하나(추후 get 등 확장 여지). */
export const subnetCommand = new Command("subnet")
  .description("서브넷 관련 명령")
  .addCommand(subnetListCommand);
