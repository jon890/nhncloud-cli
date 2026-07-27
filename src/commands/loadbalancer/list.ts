import { Command } from "commander";
import { output, type OutputOptions } from "../../formatters/table.js";
import type { LoadBalancer } from "../../services/loadbalancer/types.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { resolveLoadBalancerClient } from "./helpers.js";

interface ListGlobalOpts extends OutputOptions {
  region?: string;
  profile?: string;
}

export const listCommand = new Command("list")
  .description("Load Balancer 목록을 조회한다 (전체 필드는 --json)")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<ListGlobalOpts>();
    const { client } = await resolveLoadBalancerClient(opts);

    startSpinner("Load Balancer 목록 조회 중...");
    let loadBalancers: LoadBalancer[];
    let success = false;
    try {
      loadBalancers = await client.listLoadBalancers();
      success = true;
    } catch (error) {
      stopSpinner(false);
      throw error;
    } finally {
      if (success) stopSpinner(true);
    }

    output(opts, {
      headers: [
        "id",
        "name",
        "vip_address",
        "provisioning_status",
        "operating_status",
        "ipacl_group_action",
      ],
      rows: loadBalancers.map((loadBalancer) => [
        loadBalancer.id,
        loadBalancer.name,
        loadBalancer.vip_address,
        loadBalancer.provisioning_status,
        loadBalancer.operating_status,
        loadBalancer.ipacl_group_action ?? "",
      ]),
      raw: loadBalancers,
      ids: loadBalancers.map((loadBalancer) => loadBalancer.id),
    });
  });
