import { Command } from "commander";
import { output, type OutputOptions } from "../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { resolveNksClient } from "./helpers.js";
import type { NksClusterSummary } from "../../services/nks/types.js";

interface ClusterListGlobalOpts extends OutputOptions {
  region?: string;
  profile?: string;
}

const listCommand = new Command("list")
  .description("NKS 클러스터 목록을 조회한다")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<ClusterListGlobalOpts>();

    const { client } = await resolveNksClient(opts);

    startSpinner("NKS 클러스터 목록 조회 중...");

    let clusters: NksClusterSummary[];
    try {
      clusters = await client.listClusters();
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    output(opts, {
      headers: ["uuid", "name", "status", "health_status", "node_count", "kube_tag"],
      rows: clusters.map((cluster) => [
        cluster.uuid,
        cluster.name,
        cluster.status,
        cluster.health_status,
        String(cluster.node_count),
        cluster.kube_tag,
      ]),
      raw: clusters,
      ids: clusters.map((cluster) => cluster.uuid),
    });
  });

export const clusterCommand = new Command("cluster")
  .description("NKS 클러스터 관련 명령")
  .addCommand(listCommand);
