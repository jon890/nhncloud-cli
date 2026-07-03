import { writeFile } from "node:fs/promises";
import { Command } from "commander";
import chalk from "chalk";
import { output, type OutputOptions } from "../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { parsePositiveInteger, readJsonFile, resolveNksClient } from "./helpers.js";
import type { NksAddon, NksClusterSummary, NksNamedResource, NksUuidResponse } from "../../services/nks/types.js";

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
  file?: string;
  yes?: boolean;
  nodegroup?: string;
  nodeCount?: string;
  nodesToRemove?: string;
  termOfValidity?: string;
  ncrSgw?: string;
  obsSgw?: string;
  name?: string;
  version?: string;
  resolveConflicts?: string;
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

function uuidOutput(opts: OutputOptions, result: NksUuidResponse, label: string): void {
  process.stderr.write(chalk.green(`✓ ${label} 요청 완료 (uuid: ${result.uuid})\n`));
  output(opts, {
    headers: ["field", "value"],
    rows: [["uuid", result.uuid]],
    raw: result,
    ids: [result.uuid],
  });
}

async function confirmDangerousAction(message: string, yes?: boolean): Promise<boolean> {
  const isTTY = process.stdin.isTTY;
  if (!isTTY && !yes) {
    throw new NhnCloudCliError(
      "비대화형 환경에서 위험 작업은 --yes 플래그가 필요합니다.",
      EXIT_PARAM_ERROR,
    );
  }
  if (!isTTY || yes) return true;

  const { confirm } = await import("@inquirer/prompts");
  const ok = await confirm({ message, default: false });
  if (!ok) {
    process.stderr.write(chalk.yellow("작업이 취소되었습니다.\n"));
  }
  return ok;
}

const createCommand = new Command("create")
  .description("NKS 클러스터를 생성한다")
  .requiredOption("--file <json>", "공식 API payload JSON 파일")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<ClusterGlobalOpts>();
    const payload = await readJsonFile(opts.file as string);
    const { client } = await resolveNksClient(opts);

    startSpinner("NKS 클러스터 생성 요청 중...");
    let result: NksUuidResponse;
    try {
      result = await client.createCluster(payload);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    uuidOutput(opts, result, "클러스터 생성");
  });

const deleteCommand = new Command("delete")
  .description("NKS 클러스터를 삭제한다")
  .argument("<cluster>", "클러스터 UUID 또는 이름")
  .option("--yes", "확인 프롬프트 생략 (CI/비대화형 필수)")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (cluster: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<ClusterGlobalOpts>();
    const ok = await confirmDangerousAction(`NKS 클러스터 "${cluster}" 를 삭제하시겠습니까?`, opts.yes);
    if (!ok) return;

    const { client } = await resolveNksClient(opts);
    startSpinner("NKS 클러스터 삭제 요청 중...");
    try {
      await client.deleteCluster(cluster);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    process.stderr.write(chalk.green(`✓ NKS 클러스터 "${cluster}" 삭제 요청 완료\n`));
  });

const resizeCommand = new Command("resize")
  .description("NKS 클러스터 노드 그룹 크기를 변경한다")
  .argument("<cluster>", "클러스터 UUID 또는 이름")
  .requiredOption("--nodegroup <name-or-uuid>", "노드 그룹 UUID 또는 이름")
  .requiredOption("--node-count <n>", "변경할 노드 수")
  .option("--nodes-to-remove <csv>", "삭제할 노드 이름/ID CSV")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (cluster: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<ClusterGlobalOpts>();
    const nodeCount = parsePositiveInteger(opts.nodeCount as string, "--node-count");
    const nodesToRemove = opts.nodesToRemove
      ?.split(",")
      .map((node) => node.trim())
      .filter(Boolean);

    if (!nodesToRemove || nodesToRemove.length === 0) {
      process.stderr.write(chalk.yellow("주의: --nodes-to-remove 가 없으면 감축 시 API가 삭제 노드를 선택할 수 있습니다.\n"));
    }

    const { client } = await resolveNksClient(opts);
    startSpinner("NKS 클러스터 resize 요청 중...");
    try {
      await client.resizeCluster({
        cluster,
        nodegroup: opts.nodegroup as string,
        nodeCount,
        nodesToRemove,
      });
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    process.stderr.write(chalk.green(`✓ NKS 클러스터 "${cluster}" resize 요청 완료\n`));
  });

const setIpAclCommand = new Command("set-ipacl")
  .description("NKS 클러스터 API endpoint IP ACL 을 설정한다")
  .argument("<cluster>", "클러스터 UUID 또는 이름")
  .requiredOption("--file <json>", "공식 API payload JSON 파일")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (cluster: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<ClusterGlobalOpts>();
    const payload = await readJsonFile(opts.file as string);
    const { client } = await resolveNksClient(opts);

    startSpinner("NKS IP ACL 설정 요청 중...");
    let result: NksUuidResponse | null;
    try {
      result = await client.setClusterIpAcl(cluster, payload);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    if (result) {
      uuidOutput(opts, result, "IP ACL 설정");
    } else {
      process.stderr.write(chalk.green(`✓ NKS 클러스터 "${cluster}" IP ACL 설정 요청 완료\n`));
    }
  });

const renewCertificateCommand = new Command("renew-certificate")
  .description("NKS 클러스터 인증서를 갱신한다")
  .argument("<cluster>", "클러스터 UUID 또는 이름")
  .requiredOption("--term-of-validity <1-5>", "인증서 유효 기간(년)")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (cluster: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<ClusterGlobalOpts>();
    const term = parsePositiveInteger(opts.termOfValidity as string, "--term-of-validity");
    if (term < 1 || term > 5) {
      throw new NhnCloudCliError("--term-of-validity 는 1~5 사이여야 합니다.", EXIT_PARAM_ERROR);
    }
    const { client } = await resolveNksClient(opts);

    startSpinner("NKS 인증서 갱신 요청 중...");
    let result: NksUuidResponse;
    try {
      result = await client.renewClusterCertificate(cluster, term);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    uuidOutput(opts, result, "인증서 갱신");
  });

const updateSgwCommand = new Command("update-sgw")
  .description("NKS 클러스터 서비스 게이트웨이를 변경한다")
  .argument("<cluster>", "클러스터 UUID 또는 이름")
  .requiredOption("--ncr-sgw <uuid>", "NCR service gateway UUID")
  .requiredOption("--obs-sgw <uuid>", "Object Storage service gateway UUID")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (cluster: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<ClusterGlobalOpts>();
    const { client } = await resolveNksClient(opts);

    startSpinner("NKS 서비스 게이트웨이 변경 요청 중...");
    let result: NksUuidResponse;
    try {
      result = await client.updateClusterServiceGateway(cluster, opts.ncrSgw as string, opts.obsSgw as string);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    uuidOutput(opts, result, "서비스 게이트웨이 변경");
  });

const setControlPlaneLogCommand = new Command("set-control-plane-log")
  .description("NKS 클러스터 control plane log 설정을 변경한다")
  .argument("<cluster>", "클러스터 UUID 또는 이름")
  .requiredOption("--file <json>", "control_plane_log 객체 JSON 파일")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (cluster: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<ClusterGlobalOpts>();
    const controlPlaneLog = await readJsonFile(opts.file as string);
    const { client } = await resolveNksClient(opts);

    startSpinner("NKS control plane log 설정 요청 중...");
    let result: NksUuidResponse;
    try {
      result = await client.setControlPlaneLog(cluster, controlPlaneLog);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    uuidOutput(opts, result, "control plane log 설정");
  });

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

function parseResolveConflicts(value: string | undefined): string {
  if (value === "none" || value === "overwrite" || value === "preserve") {
    return value;
  }
  throw new NhnCloudCliError(
    `--resolve-conflicts 는 none, overwrite, preserve 중 하나여야 합니다: ${JSON.stringify(value)}`,
    EXIT_PARAM_ERROR,
  );
}

const clusterAddonInstallCommand = new Command("install")
  .description("NKS 클러스터 애드온을 설치한다")
  .argument("<cluster>", "클러스터 UUID 또는 이름")
  .requiredOption("--name <name>", "애드온 이름")
  .requiredOption("--version <version>", "애드온 버전")
  .requiredOption("--resolve-conflicts <none|overwrite|preserve>", "충돌 해결 정책")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (cluster: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<ClusterGlobalOpts>();
    const resolveConflicts = parseResolveConflicts(opts.resolveConflicts);
    const { client } = await resolveNksClient(opts);

    startSpinner("NKS 클러스터 애드온 설치 요청 중...");
    let result: NksUuidResponse;
    try {
      result = await client.installClusterAddon(cluster, {
        name: opts.name as string,
        version: opts.version as string,
        resolveConflicts,
      });
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    uuidOutput(opts, result, "클러스터 애드온 설치");
  });

const clusterAddonUpdateCommand = new Command("update")
  .description("NKS 클러스터 애드온을 업데이트한다")
  .argument("<cluster>", "클러스터 UUID 또는 이름")
  .argument("<addon>", "애드온 UUID 또는 이름")
  .requiredOption("--version <version>", "애드온 버전")
  .requiredOption("--resolve-conflicts <none|overwrite|preserve>", "충돌 해결 정책")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (cluster: string, addon: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<ClusterGlobalOpts>();
    const resolveConflicts = parseResolveConflicts(opts.resolveConflicts);
    const { client } = await resolveNksClient(opts);

    startSpinner("NKS 클러스터 애드온 업데이트 요청 중...");
    let result: NksUuidResponse;
    try {
      result = await client.updateClusterAddon(cluster, addon, {
        version: opts.version as string,
        resolveConflicts,
      });
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    uuidOutput(opts, result, "클러스터 애드온 업데이트");
  });

const clusterAddonRemoveCommand = new Command("remove")
  .description("NKS 클러스터 애드온을 제거한다")
  .argument("<cluster>", "클러스터 UUID 또는 이름")
  .argument("<addon>", "애드온 UUID 또는 이름")
  .option("--yes", "확인 프롬프트 생략 (CI/비대화형 필수)")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (cluster: string, addon: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<ClusterGlobalOpts>();
    const ok = await confirmDangerousAction(`NKS 클러스터 애드온 "${addon}" 을 제거하시겠습니까?`, opts.yes);
    if (!ok) return;

    const { client } = await resolveNksClient(opts);
    startSpinner("NKS 클러스터 애드온 제거 요청 중...");
    let result: NksUuidResponse;
    try {
      result = await client.removeClusterAddon(cluster, addon);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    uuidOutput(opts, result, "클러스터 애드온 제거");
  });

const clusterAddonCommand = new Command("addon")
  .description("NKS 클러스터 애드온 관련 명령")
  .addCommand(clusterAddonListCommand)
  .addCommand(clusterAddonGetCommand)
  .addCommand(clusterAddonInstallCommand)
  .addCommand(clusterAddonUpdateCommand)
  .addCommand(clusterAddonRemoveCommand);

export const clusterCommand = new Command("cluster")
  .description("NKS 클러스터 관련 명령")
  .addCommand(listCommand)
  .addCommand(getCommand)
  .addCommand(createCommand)
  .addCommand(deleteCommand)
  .addCommand(resizeCommand)
  .addCommand(eventsCommand)
  .addCommand(eventCommand)
  .addCommand(kubeconfigCommand)
  .addCommand(ipAclCommand)
  .addCommand(setIpAclCommand)
  .addCommand(renewCertificateCommand)
  .addCommand(updateSgwCommand)
  .addCommand(setControlPlaneLogCommand)
  .addCommand(clusterAddonCommand);
