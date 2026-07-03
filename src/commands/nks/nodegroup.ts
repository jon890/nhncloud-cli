import { Command } from "commander";
import chalk from "chalk";
import { output, type OutputOptions } from "../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { parseNonNegativeInteger, parsePositiveInteger, readJsonFile, readTextFile, resolveNksClient } from "./helpers.js";
import type { NksNamedResource, NksNodeGroupAutoscale, NksNodeGroupSummary, NksUuidResponse } from "../../services/nks/types.js";

interface NodeGroupGlobalOpts extends OutputOptions {
  region?: string;
  profile?: string;
  file?: string;
  yes?: boolean;
  nodes?: string;
  version?: string;
  numBufferNodes?: string;
  numMaxUnavailableNodes?: string;
  flavor?: string;
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

function rawObjectRows(resource: Record<string, unknown>): string[][] {
  return Object.entries(resource).map(([key, value]) => [
    key,
    typeof value === "object" && value !== null ? JSON.stringify(value) : String(value),
  ]);
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

function parseCsv(value: string, optionName: string): string[] {
  const values = value.split(",").map((item) => item.trim()).filter(Boolean);
  if (values.length === 0) {
    throw new NhnCloudCliError(`${optionName} 는 비어 있을 수 없습니다.`, EXIT_PARAM_ERROR);
  }
  return values;
}

function optionalPositiveInteger(value: string | undefined, optionName: string): number | undefined {
  return value === undefined ? undefined : parsePositiveInteger(value, optionName);
}

function optionalNonNegativeInteger(value: string | undefined, optionName: string): number | undefined {
  return value === undefined ? undefined : parseNonNegativeInteger(value, optionName);
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
  if (!ok) process.stderr.write(chalk.yellow("작업이 취소되었습니다.\n"));
  return ok;
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

const createCommand = new Command("create")
  .description("NKS 노드 그룹을 생성한다")
  .argument("<cluster>", "클러스터 UUID 또는 이름")
  .requiredOption("--file <json>", "공식 API payload JSON 파일")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (cluster: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<NodeGroupGlobalOpts>();
    const payload = await readJsonFile(opts.file as string);
    const { client } = await resolveNksClient(opts);

    startSpinner("NKS 노드 그룹 생성 요청 중...");
    let result: NksUuidResponse;
    try {
      result = await client.createNodeGroup(cluster, payload);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    uuidOutput(opts, result, "노드 그룹 생성");
  });

const deleteCommand = new Command("delete")
  .description("NKS 노드 그룹을 삭제한다")
  .argument("<cluster>", "클러스터 UUID 또는 이름")
  .argument("<nodegroup>", "노드 그룹 UUID 또는 이름")
  .option("--yes", "확인 프롬프트 생략 (CI/비대화형 필수)")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (cluster: string, nodegroup: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<NodeGroupGlobalOpts>();
    const ok = await confirmDangerousAction(`NKS 노드 그룹 "${nodegroup}" 를 삭제하시겠습니까?`, opts.yes);
    if (!ok) return;

    const { client } = await resolveNksClient(opts);
    startSpinner("NKS 노드 그룹 삭제 요청 중...");
    try {
      await client.deleteNodeGroup(cluster, nodegroup);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    process.stderr.write(chalk.green(`✓ NKS 노드 그룹 "${nodegroup}" 삭제 요청 완료\n`));
  });

function nodeActionCommand(name: "stop-node" | "start-node"): Command {
  return new Command(name)
    .description(`NKS 노드 그룹 노드를 ${name === "stop-node" ? "중지" : "시작"}한다`)
    .argument("<cluster>", "클러스터 UUID 또는 이름")
    .argument("<nodegroup>", "노드 그룹 UUID 또는 이름")
    .requiredOption("--nodes <csv>", "대상 노드 CSV")
    .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
    .option("--profile <name>", "사용할 profile 이름")
    .action(async (cluster: string, nodegroup: string, _opts: unknown, cmd: Command) => {
      const opts = cmd.optsWithGlobals<NodeGroupGlobalOpts>();
      const nodes = parseCsv(opts.nodes as string, "--nodes");
      const { client } = await resolveNksClient(opts);

      startSpinner(`NKS 노드 ${name === "stop-node" ? "중지" : "시작"} 요청 중...`);
      let result: NksUuidResponse;
      try {
        result = name === "stop-node"
          ? await client.stopNodeGroupNodes(cluster, nodegroup, nodes)
          : await client.startNodeGroupNodes(cluster, nodegroup, nodes);
      } catch (err) {
        stopSpinner(false);
        throw err;
      }
      stopSpinner(true);

      uuidOutput(opts, result, `노드 ${name === "stop-node" ? "중지" : "시작"}`);
    });
}

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
    let result: NksNodeGroupAutoscale;
    try {
      result = await client.getNodeGroupAutoscale(cluster, nodegroup);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    output(opts, {
      headers: ["field", "value"],
      rows: rawObjectRows(result),
      raw: result,
      ids: [],
    });
  });

const setAutoscaleCommand = new Command("set-autoscale")
  .description("NKS 노드 그룹 autoscale 설정을 변경한다")
  .argument("<cluster>", "클러스터 UUID 또는 이름")
  .argument("<nodegroup>", "노드 그룹 UUID 또는 이름")
  .requiredOption("--file <json>", "공식 API payload JSON 파일")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (cluster: string, nodegroup: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<NodeGroupGlobalOpts>();
    const payload = await readJsonFile(opts.file as string);
    const { client } = await resolveNksClient(opts);

    startSpinner("NKS 노드 그룹 autoscale 변경 요청 중...");
    let result: NksUuidResponse;
    try {
      result = await client.setNodeGroupAutoscale(cluster, nodegroup, payload);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    uuidOutput(opts, result, "autoscale 변경");
  });

const setMetricAutoscaleCommand = new Command("set-metric-autoscale")
  .description("NKS 노드 그룹 metric autoscale 설정을 변경한다")
  .argument("<cluster>", "클러스터 UUID 또는 이름")
  .argument("<nodegroup>", "노드 그룹 UUID 또는 이름")
  .requiredOption("--file <json>", "공식 API payload JSON 파일")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (cluster: string, nodegroup: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<NodeGroupGlobalOpts>();
    const payload = await readJsonFile(opts.file as string);
    const { client } = await resolveNksClient(opts);

    startSpinner("NKS metric autoscale 변경 요청 중...");
    let result: NksUuidResponse;
    try {
      result = await client.setNodeGroupMetricAutoscale(cluster, nodegroup, payload);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    uuidOutput(opts, result, "metric autoscale 변경");
  });

const upgradeCommand = new Command("upgrade")
  .description("NKS 노드 그룹 Kubernetes version 을 업그레이드한다")
  .argument("<cluster>", "클러스터 UUID 또는 이름")
  .argument("<nodegroup>", "노드 그룹 UUID 또는 이름")
  .requiredOption("--version <v>", "대상 Kubernetes version")
  .option("--num-buffer-nodes <n>", "buffer node 수")
  .option("--num-max-unavailable-nodes <n>", "최대 unavailable node 수")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (cluster: string, nodegroup: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<NodeGroupGlobalOpts>();
    const { client } = await resolveNksClient(opts);

    startSpinner("NKS 노드 그룹 upgrade 요청 중...");
    let result: NksUuidResponse;
    try {
      result = await client.upgradeNodeGroup(cluster, nodegroup, {
        version: opts.version as string,
        numBufferNodes: optionalNonNegativeInteger(opts.numBufferNodes, "--num-buffer-nodes"),
        numMaxUnavailableNodes: optionalPositiveInteger(opts.numMaxUnavailableNodes, "--num-max-unavailable-nodes"),
      });
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    uuidOutput(opts, result, "노드 그룹 upgrade");
  });

const setUserscriptCommand = new Command("set-userscript")
  .description("NKS 노드 그룹 user script 를 변경한다")
  .argument("<cluster>", "클러스터 UUID 또는 이름")
  .argument("<nodegroup>", "노드 그룹 UUID 또는 이름")
  .requiredOption("--file <script>", "script 파일")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (cluster: string, nodegroup: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<NodeGroupGlobalOpts>();
    const contents = await readTextFile(opts.file as string);
    const { client } = await resolveNksClient(opts);

    startSpinner("NKS node user script 변경 요청 중...");
    let result: NksUuidResponse;
    try {
      result = await client.setNodeGroupUserscript(cluster, nodegroup, contents);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    uuidOutput(opts, result, "user script 변경");
  });

const updateFlavorCommand = new Command("update-flavor")
  .description("NKS 노드 그룹 flavor 를 변경한다")
  .argument("<cluster>", "클러스터 UUID 또는 이름")
  .argument("<nodegroup>", "노드 그룹 UUID 또는 이름")
  .requiredOption("--flavor <uuid>", "변경할 flavor UUID")
  .option("--num-buffer-nodes <n>", "buffer node 수")
  .option("--num-max-unavailable-nodes <n>", "최대 unavailable node 수")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (cluster: string, nodegroup: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<NodeGroupGlobalOpts>();
    const { client } = await resolveNksClient(opts);

    startSpinner("NKS 노드 그룹 flavor 변경 요청 중...");
    let result: NksUuidResponse;
    try {
      result = await client.updateNodeGroupFlavor(cluster, nodegroup, {
        flavorId: opts.flavor as string,
        numBufferNodes: optionalNonNegativeInteger(opts.numBufferNodes, "--num-buffer-nodes"),
        numMaxUnavailableNodes: optionalPositiveInteger(opts.numMaxUnavailableNodes, "--num-max-unavailable-nodes"),
      });
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    uuidOutput(opts, result, "flavor 변경");
  });

function patchPayloadCommand(name: "set-fip-auto-bind" | "set-labels"): Command {
  return new Command(name)
    .description(`NKS 노드 그룹 ${name === "set-fip-auto-bind" ? "Floating IP 자동 연결" : "Kubernetes labels"} 설정을 변경한다`)
    .argument("<cluster>", "클러스터 UUID 또는 이름")
    .argument("<nodegroup>", "노드 그룹 UUID 또는 이름")
    .requiredOption("--file <json>", "공식 API payload JSON 파일")
    .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
    .option("--profile <name>", "사용할 profile 이름")
    .action(async (cluster: string, nodegroup: string, _opts: unknown, cmd: Command) => {
      const opts = cmd.optsWithGlobals<NodeGroupGlobalOpts>();
      const payload = await readJsonFile(opts.file as string);
      const { client } = await resolveNksClient(opts);

      startSpinner(`NKS 노드 그룹 ${name} 요청 중...`);
      let result: NksUuidResponse;
      try {
        result = name === "set-fip-auto-bind"
          ? await client.setNodeGroupFipAutoBind(cluster, nodegroup, payload)
          : await client.setNodeGroupLabels(cluster, nodegroup, payload);
      } catch (err) {
        stopSpinner(false);
        throw err;
      }
      stopSpinner(true);

      uuidOutput(opts, result, name);
    });
}

export const nodegroupCommand = new Command("nodegroup")
  .description("NKS 노드 그룹 관련 명령")
  .addCommand(listCommand)
  .addCommand(getCommand)
  .addCommand(createCommand)
  .addCommand(deleteCommand)
  .addCommand(nodeActionCommand("stop-node"))
  .addCommand(nodeActionCommand("start-node"))
  .addCommand(autoscaleCommand)
  .addCommand(setAutoscaleCommand)
  .addCommand(setMetricAutoscaleCommand)
  .addCommand(upgradeCommand)
  .addCommand(setUserscriptCommand)
  .addCommand(updateFlavorCommand)
  .addCommand(patchPayloadCommand("set-fip-auto-bind"))
  .addCommand(patchPayloadCommand("set-labels"));
