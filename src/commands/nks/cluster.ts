import { writeFile } from "node:fs/promises";
import { Command } from "commander";
import chalk from "chalk";
import { output, type OutputOptions } from "../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { resolveNksClient } from "./helpers.js";
import type { NksAddon, NksClusterSummary, NksNamedResource } from "../../services/nks/types.js";

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

interface ClusterGlobalOpts extends OutputOptions {
  region?: string;
  profile?: string;
  output?: string;
  force?: boolean;
}

function resourceId(resource: NksNamedResource): string {
  return resource.uuid ?? resource.id ?? resource.name ?? "";
}

function resourceRow(resource: NksNamedResource): string[] {
  return [
    resourceId(resource),
    resource.name ?? "",
    resource.status ?? "",
  ];
}

function addonRow(addon: NksAddon): string[] {
  return [
    addon.uuid ?? addon.id ?? addon.name,
    addon.name,
    addon.version ?? "",
    addon.status ?? "",
  ];
}

const getCommand = new Command("get")
  .description("NKS 클러스터를 조회한다")
  .argument("<cluster>", "클러스터 UUID 또는 이름")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (cluster: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<ClusterGlobalOpts>();
    const { client } = await resolveNksClient(opts);

    startSpinner("NKS 클러스터 조회 중...");
    let result: NksNamedResource;
    try {
      result = await client.getCluster(cluster);
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

const eventsCommand = new Command("events")
  .description("NKS 클러스터 작업 이력을 조회한다")
  .argument("<cluster>", "클러스터 UUID 또는 이름")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (cluster: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<ClusterGlobalOpts>();
    const { client } = await resolveNksClient(opts);

    startSpinner("NKS 클러스터 작업 이력 조회 중...");
    let events: NksNamedResource[];
    try {
      events = await client.listClusterEvents(cluster);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    output(opts, {
      headers: ["id", "name", "status"],
      rows: events.map(resourceRow),
      raw: events,
      ids: events.map(resourceId),
    });
  });

const eventCommand = new Command("event")
  .description("NKS 클러스터 작업 이력 단건을 조회한다")
  .argument("<cluster>", "클러스터 UUID 또는 이름")
  .argument("<event>", "작업 이력 UUID 또는 ID")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (cluster: string, event: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<ClusterGlobalOpts>();
    const { client } = await resolveNksClient(opts);

    startSpinner("NKS 클러스터 작업 이력 조회 중...");
    let result: NksNamedResource;
    try {
      result = await client.getClusterEvent(cluster, event);
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

const kubeconfigCommand = new Command("kubeconfig")
  .description("NKS 클러스터 kubeconfig 를 출력하거나 저장한다")
  .argument("<cluster>", "클러스터 UUID 또는 이름")
  .option("--output <file>", "kubeconfig 저장 경로")
  .option("--force", "기존 파일 덮어쓰기")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (cluster: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<ClusterGlobalOpts>();
    const { client } = await resolveNksClient(opts);

    startSpinner("NKS kubeconfig 조회 중...");
    let kubeconfig: string;
    try {
      kubeconfig = await client.getClusterKubeconfig(cluster);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    if (opts.output) {
      try {
        await writeFile(opts.output, kubeconfig, {
          encoding: "utf-8",
          mode: 0o600,
          flag: opts.force ? "w" : "wx",
        });
      } catch (err) {
        if (err instanceof Error && "code" in err && err.code === "EEXIST") {
          throw new NhnCloudCliError(
            `파일이 이미 존재합니다: ${opts.output}. 덮어쓰려면 --force 를 지정하세요.`,
            EXIT_PARAM_ERROR,
          );
        }
        throw err;
      }
      process.stderr.write(chalk.green(`✓ kubeconfig 를 저장했습니다: ${opts.output}\n`));
      return;
    }

    process.stdout.write(kubeconfig.endsWith("\n") ? kubeconfig : kubeconfig + "\n");
  });

const ipAclCommand = new Command("ipacl")
  .description("NKS 클러스터 API endpoint IP ACL 을 조회한다")
  .argument("<cluster>", "클러스터 UUID 또는 이름")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (cluster: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<ClusterGlobalOpts>();
    const { client } = await resolveNksClient(opts);

    startSpinner("NKS IP ACL 조회 중...");
    let result: NksNamedResource;
    try {
      result = await client.getClusterIpAcl(cluster);
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

const clusterAddonListCommand = new Command("list")
  .description("NKS 클러스터에 설치된 애드온 목록을 조회한다")
  .argument("<cluster>", "클러스터 UUID 또는 이름")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (cluster: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<ClusterGlobalOpts>();
    const { client } = await resolveNksClient(opts);

    startSpinner("NKS 클러스터 애드온 목록 조회 중...");
    let addons: NksAddon[];
    try {
      addons = await client.listClusterAddons(cluster);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    output(opts, {
      headers: ["id", "name", "version", "status"],
      rows: addons.map(addonRow),
      raw: addons,
      ids: addons.map((addon) => addon.uuid ?? addon.id ?? addon.name),
    });
  });

const clusterAddonGetCommand = new Command("get")
  .description("NKS 클러스터에 설치된 애드온을 조회한다")
  .argument("<cluster>", "클러스터 UUID 또는 이름")
  .argument("<addon>", "애드온 UUID 또는 이름")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (cluster: string, addon: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<ClusterGlobalOpts>();
    const { client } = await resolveNksClient(opts);

    startSpinner("NKS 클러스터 애드온 조회 중...");
    let result: NksAddon;
    try {
      result = await client.getClusterAddon(cluster, addon);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    output(opts, {
      headers: ["id", "name", "version", "status"],
      rows: [addonRow(result)],
      raw: result,
      ids: [result.uuid ?? result.id ?? result.name],
    });
  });

const clusterAddonCommand = new Command("addon")
  .description("NKS 클러스터 애드온 관련 명령")
  .addCommand(clusterAddonListCommand)
  .addCommand(clusterAddonGetCommand);

export const clusterCommand = new Command("cluster")
  .description("NKS 클러스터 관련 명령")
  .addCommand(listCommand)
  .addCommand(getCommand)
  .addCommand(eventsCommand)
  .addCommand(eventCommand)
  .addCommand(kubeconfigCommand)
  .addCommand(ipAclCommand)
  .addCommand(clusterAddonCommand);
