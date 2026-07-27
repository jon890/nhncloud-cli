import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoadBalancerClient } from "../../services/loadbalancer/client.js";
import type {
  IpAclGroup,
  IpAclTarget,
  LoadBalancer,
} from "../../services/loadbalancer/types.js";
import { output } from "../../formatters/table.js";
import {
  resolveIpAclGroupId,
  resolveLoadBalancerClient,
  resolveLoadBalancerId,
} from "./helpers.js";
import { listCommand } from "./list.js";
import { getCommand } from "./get.js";
import { ipaclCommand } from "./ipacl.js";

vi.mock("./helpers.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./helpers.js")>();
  return {
    ...actual,
    resolveLoadBalancerClient: vi.fn(),
    resolveLoadBalancerId: vi.fn(),
    resolveIpAclGroupId: vi.fn(),
  };
});

vi.mock("../../formatters/table.js", () => ({
  output: vi.fn(),
}));

vi.mock("../../utils/spinner.js", () => ({
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
}));

const loadBalancer: LoadBalancer = {
  id: "lb-1",
  name: "public-lb",
  vip_address: "192.0.2.10",
  provisioning_status: "ACTIVE",
  operating_status: "ONLINE",
  ipacl_group_action: "ALLOW",
  ipacl_groups: [{ ipacl_group_id: "group-1" }],
};

const group: IpAclGroup = {
  id: "group-1",
  name: "office",
  action: "ALLOW",
  ipacl_target_count: "1",
  loadbalancers: [{ loadbalancer_id: "lb-1" }],
};

const target: IpAclTarget = {
  id: "target-1",
  cidr_address: "192.0.2.0/24",
  description: "office",
  ipacl_group_id: "group-1",
};

const client = new LoadBalancerClient("test-token", "https://network.example.com/v2.0");
const listLoadBalancersMock = vi.spyOn(client, "listLoadBalancers");
const getLoadBalancerMock = vi.spyOn(client, "getLoadBalancer");
const listIpAclGroupsMock = vi.spyOn(client, "listIpAclGroups");
const listIpAclTargetsMock = vi.spyOn(client, "listIpAclTargets");

function programWith(command: Command): Command {
  return new Command("nhncloud")
    .exitOverride()
    .option("--json")
    .option("--quiet")
    .addCommand(command);
}

describe("loadbalancer 조회 commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveLoadBalancerClient).mockResolvedValue({
      client,
      profileName: "default",
    });
  });

  it("list의 --json 옵션과 고정 열·raw·ID 출력을 formatter에 전달한다", async () => {
    listLoadBalancersMock.mockResolvedValue([loadBalancer]);

    await programWith(listCommand).parseAsync([
      "node",
      "nhncloud",
      "--json",
      "list",
      "--profile",
      "profile-a",
      "--region",
      "kr1",
    ]);

    expect(resolveLoadBalancerClient).toHaveBeenCalledWith(
      expect.objectContaining({ json: true, profile: "profile-a", region: "kr1" }),
    );
    expect(output).toHaveBeenCalledWith(
      expect.objectContaining({ json: true }),
      expect.objectContaining({
        headers: [
          "id",
          "name",
          "vip_address",
          "provisioning_status",
          "operating_status",
          "ipacl_group_action",
        ],
        raw: [loadBalancer],
        ids: ["lb-1"],
      }),
    );
  });

  it("get은 이름 해석 후 상세 조회하고 quiet 식별자를 전달한다", async () => {
    vi.mocked(resolveLoadBalancerId).mockResolvedValue("lb-1");
    getLoadBalancerMock.mockResolvedValue(loadBalancer);

    await programWith(getCommand).parseAsync([
      "node",
      "nhncloud",
      "--quiet",
      "get",
      " public-lb ",
    ]);

    expect(resolveLoadBalancerId).toHaveBeenCalledWith(client, "public-lb");
    expect(getLoadBalancerMock).toHaveBeenCalledWith("lb-1");
    expect(output).toHaveBeenCalledWith(
      expect.objectContaining({ quiet: true }),
      expect.objectContaining({ raw: loadBalancer, ids: ["lb-1"] }),
    );
  });

  it("ipacl list는 연결 목록 길이를 loadbalancer_count로 출력한다", async () => {
    listIpAclGroupsMock.mockResolvedValue([group]);

    await programWith(ipaclCommand).parseAsync([
      "node",
      "nhncloud",
      "ipacl",
      "list",
    ]);

    expect(output).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        headers: ["id", "name", "action", "ipacl_target_count", "loadbalancer_count"],
        rows: [["group-1", "office", "ALLOW", "1", "1"]],
      }),
    );
  });

  it("target list는 그룹 해석 후 그룹 UUID로 대상을 조회한다", async () => {
    vi.mocked(resolveIpAclGroupId).mockResolvedValue("group-1");
    listIpAclTargetsMock.mockResolvedValue([target]);

    await programWith(ipaclCommand).parseAsync([
      "node",
      "nhncloud",
      "ipacl",
      "target",
      "list",
      "office",
    ]);

    expect(resolveIpAclGroupId).toHaveBeenCalledWith(client, "office");
    expect(listIpAclTargetsMock).toHaveBeenCalledWith({ ipacl_group_id: "group-1" });
    expect(output).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        headers: ["id", "cidr_address", "description", "ipacl_group_id"],
        raw: [target],
        ids: ["target-1"],
      }),
    );
  });
});
