import { Command } from "commander";
import { output, type OutputOptions } from "../../formatters/table.js";
import type { LoadBalancer } from "../../services/loadbalancer/types.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import {
  requireResourceInput,
  resolveLoadBalancerClient,
  resolveLoadBalancerId,
} from "./helpers.js";

interface GetGlobalOpts extends OutputOptions {
  region?: string;
  profile?: string;
}

export const getCommand = new Command("get")
  .description("Load Balancer를 이름 또는 UUID로 조회한다")
  .argument("<loadbalancer>", "Load Balancer 이름 또는 UUID")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (loadBalancerInput: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<GetGlobalOpts>();
    const input = requireResourceInput(loadBalancerInput, "Load Balancer");
    const { client } = await resolveLoadBalancerClient(opts);

    startSpinner("Load Balancer 조회 중...");
    let loadBalancer: LoadBalancer;
    let success = false;
    try {
      const id = await resolveLoadBalancerId(client, input);
      loadBalancer = await client.getLoadBalancer(id);
      success = true;
    } catch (error) {
      stopSpinner(false);
      throw error;
    } finally {
      if (success) stopSpinner(true);
    }

    output(opts, {
      headers: ["field", "value"],
      rows: [
        ["id", loadBalancer.id],
        ["name", loadBalancer.name],
        ["vip_address", loadBalancer.vip_address],
        ["provisioning_status", loadBalancer.provisioning_status],
        ["operating_status", loadBalancer.operating_status],
        ["ipacl_group_action", loadBalancer.ipacl_group_action ?? ""],
        [
          "ipacl_group_ids",
          loadBalancer.ipacl_groups.map((group) => group.ipacl_group_id).join(", "),
        ],
      ],
      raw: loadBalancer,
      ids: [loadBalancer.id],
    });
  });
