import { Command } from "commander";
import { output, type OutputOptions } from "../../formatters/table.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import {
  collectOption,
  requireResourceInput,
  requireResourceInputs,
  requireYes,
  resolveIpAclGroups,
  resolveLoadBalancerClient,
  resolveLoadBalancerId,
} from "./helpers.js";

interface BindingGlobalOpts extends OutputOptions {
  group?: string[];
  yes?: boolean;
  region?: string;
  profile?: string;
}

function bindingResult(
  operation: "loadbalancer-set-ipacl" | "loadbalancer-clear-ipacl",
  loadBalancerId: string,
  groupIds: string[],
) {
  return {
    operation,
    status: "succeeded",
    loadbalancer_id: loadBalancerId,
    ipacl_group_ids: groupIds,
  };
}

function outputBindingResult(
  opts: OutputOptions,
  result: ReturnType<typeof bindingResult>,
): void {
  output(opts, {
    headers: ["field", "value"],
    rows: [
      ["operation", result.operation],
      ["status", result.status],
      ["loadbalancer_id", result.loadbalancer_id],
      ["ipacl_group_ids", result.ipacl_group_ids.join(", ")],
    ],
    raw: result,
    ids: [result.loadbalancer_id],
  });
}

export const setIpAclCommand = new Command("set-ipacl")
  .description("Load Balancer의 IP ACL 그룹 연결을 전체 교체한다")
  .argument("<loadbalancer>", "Load Balancer 이름 또는 UUID")
  .requiredOption(
    "--group <group>",
    "적용할 IP ACL 그룹 이름 또는 UUID (반복 가능)",
    collectOption,
  )
  .option("--yes", "기존 연결 전체 교체 확인")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (loadBalancerInput: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<BindingGlobalOpts>();
    const confirmedYes = requireYes(opts.yes, "Load Balancer IP ACL 연결 교체");
    const parsedLoadBalancer = requireResourceInput(loadBalancerInput, "Load Balancer");
    const parsedGroups = requireResourceInputs(opts.group ?? [], "IP ACL 그룹");
    const { client } = await resolveLoadBalancerClient(opts);

    startSpinner("Load Balancer IP ACL 연결 교체 중...");
    let loadBalancerId: string;
    let groupIds: string[];
    try {
      loadBalancerId = await resolveLoadBalancerId(client, parsedLoadBalancer);
      const groups = await resolveIpAclGroups(client, parsedGroups);
      groupIds = groups.map((group) => group.id);
      if (new Set(groupIds).size !== groupIds.length) {
        throw new NhnCloudCliError(
          "같은 IP ACL 그룹을 중복 지정할 수 없습니다.",
          EXIT_PARAM_ERROR,
        );
      }
      if (new Set(groups.map((group) => group.action)).size > 1) {
        throw new NhnCloudCliError(
          "함께 적용할 IP ACL 그룹의 action은 모두 같아야 합니다.",
          EXIT_PARAM_ERROR,
        );
      }
      if (confirmedYes) await client.bindIpAclGroups(loadBalancerId, groupIds);
    } catch (error) {
      stopSpinner(false);
      throw error;
    }
    stopSpinner(true);

    outputBindingResult(
      opts,
      bindingResult("loadbalancer-set-ipacl", loadBalancerId, groupIds),
    );
  });

export const clearIpAclCommand = new Command("clear-ipacl")
  .description("Load Balancer의 모든 IP ACL 그룹 연결을 해제한다")
  .argument("<loadbalancer>", "Load Balancer 이름 또는 UUID")
  .option("--yes", "모든 IP ACL 연결 해제 확인")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (loadBalancerInput: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<BindingGlobalOpts>();
    const confirmedYes = requireYes(opts.yes, "Load Balancer IP ACL 연결 해제");
    const parsedLoadBalancer = requireResourceInput(loadBalancerInput, "Load Balancer");
    const { client } = await resolveLoadBalancerClient(opts);

    startSpinner("Load Balancer IP ACL 연결 해제 중...");
    let loadBalancerId: string;
    try {
      loadBalancerId = await resolveLoadBalancerId(client, parsedLoadBalancer);
      if (confirmedYes) await client.bindIpAclGroups(loadBalancerId, []);
    } catch (error) {
      stopSpinner(false);
      throw error;
    }
    stopSpinner(true);

    outputBindingResult(
      opts,
      bindingResult("loadbalancer-clear-ipacl", loadBalancerId, []),
    );
  });
