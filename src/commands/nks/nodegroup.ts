import { Command } from "commander";
import { output, type OutputOptions } from "../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { resolveNksClient } from "./helpers.js";
import type { NksNamedResource, NksNodeGroupSummary } from "../../services/nks/types.js";

interface NodeGroupGlobalOpts extends OutputOptions {
  region?: string;
  profile?: string;
}

function nodeGroupRow(nodegroup: NksNodeGroupSummary): string[] {
  return [
    nodegroup.uuid,
    nodegroup.name,
    nodegroup.status,
    String(nodegroup["node_count"] ?? ""),
    String(nodegroup["flavor_id"] ?? ""),
  ];
}

function resourceId(resource: NksNamedResource): string {
  return resource.uuid ?? resource.id ?? resource.name ?? "";
}

function resourceRow(resource: NksNamedResource): string[] {
  return [resourceId(resource), resource.name ?? "", resource.status ?? ""];
}

const listCommand = new Command("list")
  .description("NKS 노드 그룹 목록을 조회한다")
  .argument("<cluster>", "클러스터 UUID 또는 이름")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (cluster: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<NodeGroupGlobalOpts>();
    const { client } = await resolveNksClient(opts);

    startSpinner("NKS 노드 그룹 목록 조회 중...");
    let nodegroups: NksNodeGroupSummary[];
    try {
      nodegroups = await client.listNodeGroups(cluster);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    output(opts, {
      headers: ["uuid", "name", "status", "node_count", "flavor_id"],
      rows: nodegroups.map(nodeGroupRow),
      raw: nodegroups,
      ids: nodegroups.map((nodegroup) => nodegroup.uuid),
    });
  });

const getCommand = new Command("get")
  .description("NKS 노드 그룹을 조회한다")
  .argument("<cluster>", "클러스터 UUID 또는 이름")
  .argument("<nodegroup>", "노드 그룹 UUID 또는 이름")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (cluster: string, nodegroup: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<NodeGroupGlobalOpts>();
    const { client } = await resolveNksClient(opts);

    startSpinner("NKS 노드 그룹 조회 중...");
    let result: NksNodeGroupSummary;
    try {
      result = await client.getNodeGroup(cluster, nodegroup);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    output(opts, {
      headers: ["uuid", "name", "status", "node_count", "flavor_id"],
      rows: [nodeGroupRow(result)],
      raw: result,
      ids: [result.uuid],
    });
  });

const autoscaleCommand = new Command("autoscale")
  .description("NKS 노드 그룹 autoscale 설정을 조회한다")
  .argument("<cluster>", "클러스터 UUID 또는 이름")
  .argument("<nodegroup>", "노드 그룹 UUID 또는 이름")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (cluster: string, nodegroup: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<NodeGroupGlobalOpts>();
    const { client } = await resolveNksClient(opts);

    startSpinner("NKS 노드 그룹 autoscale 조회 중...");
    let result: NksNamedResource;
    try {
      result = await client.getNodeGroupAutoscale(cluster, nodegroup);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    output(opts, {
      headers: ["id", "name", "status"],
      rows: [resourceRow(result)],
      raw: result,
      ids: [resourceId(result)],
    });
  });

export const nodegroupCommand = new Command("nodegroup")
  .description("NKS 노드 그룹 관련 명령")
  .addCommand(listCommand)
  .addCommand(getCommand)
  .addCommand(autoscaleCommand);
