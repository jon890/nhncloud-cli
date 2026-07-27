import { Command } from "commander";
import { output, type OutputOptions } from "../../formatters/table.js";
import type {
  IpAclGroup,
  IpAclTarget,
} from "../../services/loadbalancer/types.js";
import { EXIT_API_ERROR } from "../../utils/exit-codes.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import {
  optionalTrimmed,
  parseIpOrCidr,
  requireResourceInput,
  requireYes,
  resolveIpAclGroupId,
  resolveLoadBalancerClient,
} from "./helpers.js";
import {
  rebindIpAclSnapshots,
  sanitizeForTerminal,
  skippedRebindResult,
  snapshotIpAclBindings,
  type IpAclRebindResult,
} from "./rebind.js";

interface TargetGlobalOpts extends OutputOptions {
  region?: string;
  profile?: string;
  cidr?: string;
  description?: string;
  rebind?: boolean;
  yes?: boolean;
}

interface TargetWriteResult {
  operation: "ipacl-target-add" | "ipacl-target-remove";
  status: "succeeded" | "partial";
  target: {
    id: string;
    ipacl_group_id: string;
  };
  rebind: IpAclRebindResult;
}

function outputTargetWriteResult(
  opts: OutputOptions,
  result: TargetWriteResult,
): void {
  output(opts, {
    headers: ["field", "value"],
    rows: [
      ["operation", result.operation],
      ["status", result.status],
      ["target_id", result.target.id],
      ["ipacl_group_id", result.target.ipacl_group_id],
      ["rebind_skipped", String(result.rebind.skipped)],
      ["rebind_succeeded", String(result.rebind.succeeded.length)],
      ["rebind_failed", String(result.rebind.failed.length)],
    ],
    raw: result,
    ids: [result.target.id],
  });
}

function writeTargetWarnings(
  group: IpAclGroup,
  result: TargetWriteResult,
): void {
  if (result.rebind.skipped) {
    process.stderr.write(
      "경고: --no-rebind로 재바인딩을 생략했습니다. 데이터 영역에 규칙이 즉시 반영되지 않을 수 있습니다.\n",
    );
  }
  process.stderr.write(
    "안내: IP ACL 대상 변경이 데이터 영역에 반영되기까지 약 10~20초가 걸릴 수 있습니다.\n",
  );
  if (group.action === "ALLOW") {
    process.stderr.write(
      "경고: ALLOW 그룹 대상에는 Load Balancer가 속한 VPC의 private CIDR을 사용해야 합니다.\n",
    );
  }
  if (result.rebind.failed.length > 0) {
    process.stderr.write(
      `경고: ${result.rebind.failed.length}개 Load Balancer 재바인딩이 실패했습니다. 아래 명령으로 복구하세요.\n`,
    );
    for (const failure of result.rebind.failed) {
      process.stderr.write(`${sanitizeForTerminal(failure.retry_command)}\n`);
      process.stderr.write(`  오류: ${sanitizeForTerminal(failure.error)}\n`);
    }
  }
}

function targetWriteResult(
  operation: TargetWriteResult["operation"],
  target: Pick<IpAclTarget, "id" | "ipacl_group_id">,
  rebind: IpAclRebindResult,
): TargetWriteResult {
  return {
    operation,
    status: rebind.failed.length === 0 ? "succeeded" : "partial",
    target: {
      id: target.id,
      ipacl_group_id: target.ipacl_group_id,
    },
    rebind,
  };
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

const addCommand = new Command("add")
  .description("IP ACL 대상을 추가하고 연결된 Load Balancer를 재바인딩한다")
  .argument("<group>", "IP ACL 그룹 이름 또는 UUID")
  .requiredOption("--cidr <ip-or-cidr>", "추가할 IP 주소 또는 CIDR")
  .option("--description <text>", "IP ACL 대상 설명")
  .option("--no-rebind", "대상 추가 후 Load Balancer 재바인딩 생략")
  .option("--yes", "대상 추가 확인")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (groupInput: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<TargetGlobalOpts>();
    requireYes(opts.yes, "IP ACL 대상 추가");
    const parsedGroup = requireResourceInput(groupInput, "IP ACL 그룹");
    const parsedCidr = parseIpOrCidr(opts.cidr ?? "");
    const parsedDescription = optionalTrimmed(opts.description);
    const { client } = await resolveLoadBalancerClient(opts);

    startSpinner("IP ACL 대상 추가와 Load Balancer 재바인딩 중...");
    let group: IpAclGroup;
    let target: IpAclTarget;
    let rebind: IpAclRebindResult;
    try {
      const groupId = await resolveIpAclGroupId(client, parsedGroup);
      group = await client.getIpAclGroup(groupId);
      const snapshots = opts.rebind === false
        ? []
        : await snapshotIpAclBindings(
            client,
            group.loadbalancers.map((item) => item.loadbalancer_id),
          );
      target = await client.createIpAclTarget({
        ipacl_group_id: group.id,
        cidr_address: parsedCidr,
        ...(parsedDescription === undefined ? {} : { description: parsedDescription }),
      });
      rebind = opts.rebind === false
        ? skippedRebindResult()
        : await rebindIpAclSnapshots(client, snapshots, {
            profile: opts.profile,
            region: opts.region,
          });
    } catch (error) {
      stopSpinner(false);
      throw error;
    }
    stopSpinner(true);

    const result = targetWriteResult("ipacl-target-add", target, rebind);
    outputTargetWriteResult(opts, result);
    writeTargetWarnings(group, result);
    if (result.status === "partial") process.exitCode = EXIT_API_ERROR;
  });

const removeCommand = new Command("remove")
  .description("IP ACL 대상을 삭제하고 연결된 Load Balancer를 재바인딩한다")
  .argument("<target-id>", "삭제할 IP ACL 대상 UUID")
  .option("--no-rebind", "대상 삭제 후 Load Balancer 재바인딩 생략")
  .option("--yes", "대상 삭제 확인")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (targetInput: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<TargetGlobalOpts>();
    requireYes(opts.yes, "IP ACL 대상 삭제");
    const parsedTargetId = requireResourceInput(targetInput, "IP ACL 대상");
    const { client } = await resolveLoadBalancerClient(opts);

    startSpinner("IP ACL 대상 삭제와 Load Balancer 재바인딩 중...");
    let group: IpAclGroup;
    let target: IpAclTarget;
    let rebind: IpAclRebindResult;
    try {
      target = await client.getIpAclTarget(parsedTargetId);
      group = await client.getIpAclGroup(target.ipacl_group_id);
      const snapshots = opts.rebind === false
        ? []
        : await snapshotIpAclBindings(
            client,
            group.loadbalancers.map((item) => item.loadbalancer_id),
          );
      await client.deleteIpAclTarget(target.id);
      rebind = opts.rebind === false
        ? skippedRebindResult()
        : await rebindIpAclSnapshots(client, snapshots, {
            profile: opts.profile,
            region: opts.region,
          });
    } catch (error) {
      stopSpinner(false);
      throw error;
    }
    stopSpinner(true);

    const result = targetWriteResult("ipacl-target-remove", target, rebind);
    outputTargetWriteResult(opts, result);
    writeTargetWarnings(group, result);
    if (result.status === "partial") process.exitCode = EXIT_API_ERROR;
  });

export const targetCommand = new Command("target").description("IP ACL 대상 조회·관리");
targetCommand.addCommand(listCommand);
targetCommand.addCommand(addCommand);
targetCommand.addCommand(removeCommand);
