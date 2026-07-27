import { Command } from "commander";
import { output, type OutputOptions } from "../../formatters/table.js";
import type { IpAclGroup } from "../../services/loadbalancer/types.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import {
  optionalTrimmed,
  parseIpAclAction,
  requireResourceInput,
  requireYes,
  resolveIpAclGroupId,
  resolveLoadBalancerClient,
} from "./helpers.js";
import { targetCommand } from "./target.js";

interface IpAclGlobalOpts extends OutputOptions {
  region?: string;
  profile?: string;
  name?: string;
  action?: string;
  description?: string;
  yes?: boolean;
}

const listCommand = new Command("list")
  .description("IP ACL 그룹 목록을 조회한다 (전체 필드는 --json)")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<IpAclGlobalOpts>();
    const { client } = await resolveLoadBalancerClient(opts);

    startSpinner("IP ACL 그룹 목록 조회 중...");
    let groups: IpAclGroup[];
    let success = false;
    try {
      groups = await client.listIpAclGroups();
      success = true;
    } catch (error) {
      stopSpinner(false);
      throw error;
    } finally {
      if (success) stopSpinner(true);
    }

    output(opts, {
      headers: ["id", "name", "action", "ipacl_target_count", "loadbalancer_count"],
      rows: groups.map((group) => [
        group.id,
        group.name,
        group.action,
        group.ipacl_target_count,
        String(group.loadbalancers.length),
      ]),
      raw: groups,
      ids: groups.map((group) => group.id),
    });
  });

const getCommand = new Command("get")
  .description("IP ACL 그룹을 이름 또는 UUID로 조회한다")
  .argument("<group>", "IP ACL 그룹 이름 또는 UUID")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (groupInput: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<IpAclGlobalOpts>();
    const input = requireResourceInput(groupInput, "IP ACL 그룹");
    const { client } = await resolveLoadBalancerClient(opts);

    startSpinner("IP ACL 그룹 조회 중...");
    let group: IpAclGroup;
    let success = false;
    try {
      const id = await resolveIpAclGroupId(client, input);
      group = await client.getIpAclGroup(id);
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
        ["id", group.id],
        ["name", group.name],
        ["action", group.action],
        ["ipacl_target_count", group.ipacl_target_count],
        [
          "loadbalancer_ids",
          group.loadbalancers.map((loadBalancer) => loadBalancer.loadbalancer_id).join(", "),
        ],
      ],
      raw: group,
      ids: [group.id],
    });
  });

const createCommand = new Command("create")
  .description("IP ACL 그룹을 생성한다")
  .requiredOption("--name <name>", "IP ACL 그룹 이름")
  .requiredOption("--action <ALLOW|DENY>", "IP 접근 제어 동작")
  .option("--description <text>", "IP ACL 그룹 설명")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<IpAclGlobalOpts>();
    const parsedName = requireResourceInput(opts.name ?? "", "IP ACL 그룹");
    const parsedAction = parseIpAclAction(opts.action ?? "");
    const parsedDescription = optionalTrimmed(opts.description);
    const { client } = await resolveLoadBalancerClient(opts);

    startSpinner("IP ACL 그룹 생성 중...");
    let group: IpAclGroup;
    try {
      group = await client.createIpAclGroup({
        name: parsedName,
        action: parsedAction,
        ...(parsedDescription === undefined ? {} : { description: parsedDescription }),
      });
    } catch (error) {
      stopSpinner(false);
      throw error;
    }
    stopSpinner(true);

    const result = {
      operation: "ipacl-group-create",
      status: "succeeded",
      ipacl_group_id: group.id,
    };
    output(opts, {
      headers: ["field", "value"],
      rows: Object.entries(result).map(([key, value]) => [key, value]),
      raw: result,
      ids: [group.id],
    });
  });

const deleteCommand = new Command("delete")
  .description("IP ACL 그룹과 하위 대상을 삭제한다")
  .argument("<group>", "IP ACL 그룹 이름 또는 UUID")
  .option("--yes", "삭제와 연결 규칙 제거 확인")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (groupInput: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<IpAclGlobalOpts>();
    const confirmedYes = requireYes(opts.yes, "IP ACL 그룹 삭제");
    const parsedGroup = requireResourceInput(groupInput, "IP ACL 그룹");
    if (confirmedYes) {
      process.stderr.write(
        "경고: 그룹의 모든 대상과 Load Balancer 연결 규칙이 함께 제거됩니다.\n",
      );
    }
    const { client } = await resolveLoadBalancerClient(opts);

    startSpinner("IP ACL 그룹 삭제 중...");
    let groupId: string;
    try {
      groupId = await resolveIpAclGroupId(client, parsedGroup);
      await client.deleteIpAclGroup(groupId);
    } catch (error) {
      stopSpinner(false);
      throw error;
    }
    stopSpinner(true);

    const result = {
      operation: "ipacl-group-delete",
      status: "succeeded",
      ipacl_group_id: groupId,
    };
    output(opts, {
      headers: ["field", "value"],
      rows: Object.entries(result).map(([key, value]) => [key, value]),
      raw: result,
      ids: [groupId],
    });
  });

export const ipaclCommand = new Command("ipacl").description("IP ACL 그룹·대상 조회");
ipaclCommand.addCommand(listCommand);
ipaclCommand.addCommand(getCommand);
ipaclCommand.addCommand(createCommand);
ipaclCommand.addCommand(deleteCommand);
ipaclCommand.addCommand(targetCommand);
