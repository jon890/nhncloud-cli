import { Command } from "commander";
import { output, type OutputOptions } from "../../formatters/table.js";
import type { IpAclTarget } from "../../services/loadbalancer/types.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import {
  requireResourceInput,
  resolveIpAclGroupId,
  resolveLoadBalancerClient,
} from "./helpers.js";

interface TargetGlobalOpts extends OutputOptions {
  region?: string;
  profile?: string;
}

const listCommand = new Command("list")
  .description("IP ACL 대상 목록을 조회한다")
  .argument("<group>", "IP ACL 그룹 이름 또는 UUID")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (groupInput: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<TargetGlobalOpts>();
    const input = requireResourceInput(groupInput, "IP ACL 그룹");
    const { client } = await resolveLoadBalancerClient(opts);

    startSpinner("IP ACL 대상 목록 조회 중...");
    let targets: IpAclTarget[];
    let success = false;
    try {
      const groupId = await resolveIpAclGroupId(client, input);
      targets = await client.listIpAclTargets({ ipacl_group_id: groupId });
      success = true;
    } catch (error) {
      stopSpinner(false);
      throw error;
    } finally {
      if (success) stopSpinner(true);
    }

    output(opts, {
      headers: ["id", "cidr_address", "description", "ipacl_group_id"],
      rows: targets.map((target) => [
        target.id,
        target.cidr_address,
        target.description,
        target.ipacl_group_id,
      ]),
      raw: targets,
      ids: targets.map((target) => target.id),
    });
  });

export const targetCommand = new Command("target").description("IP ACL 대상 조회");
targetCommand.addCommand(listCommand);
