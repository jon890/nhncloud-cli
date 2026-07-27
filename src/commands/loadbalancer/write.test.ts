import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { output } from "../../formatters/table.js";
import { LoadBalancerClient } from "../../services/loadbalancer/client.js";
import type { IpAclGroup } from "../../services/loadbalancer/types.js";
import { startSpinner } from "../../utils/spinner.js";
import {
  resolveIpAclGroupId,
  resolveIpAclGroups,
  resolveLoadBalancerClient,
  resolveLoadBalancerId,
} from "./helpers.js";
import { clearIpAclCommand, setIpAclCommand } from "./binding.js";
import { configureLoadBalancerHelp } from "./help.js";
import { ipaclCommand } from "./ipacl.js";

vi.mock("./helpers.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./helpers.js")>();
  return {
    ...actual,
    resolveIpAclGroupId: vi.fn(),
    resolveIpAclGroups: vi.fn(),
    resolveLoadBalancerClient: vi.fn(),
    resolveLoadBalancerId: vi.fn(),
  };
});

vi.mock("../../formatters/table.js", () => ({ output: vi.fn() }));
vi.mock("../../utils/spinner.js", () => ({
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
}));

const group: IpAclGroup = {
  id: "group-1",
  name: "office",
  action: "ALLOW",
  ipacl_target_count: "0",
  loadbalancers: [],
};

const otherGroup: IpAclGroup = {
  ...group,
  id: "group-2",
  name: "partners",
};

const client = new LoadBalancerClient("token-id", "https://example.com/v2.0");
const createGroupMock = vi.spyOn(client, "createIpAclGroup");
const deleteGroupMock = vi.spyOn(client, "deleteIpAclGroup");
const bindGroupsMock = vi.spyOn(client, "bindIpAclGroups");

function programWith(...commands: Command[]): Command {
  const program = new Command("nhncloud")
    .exitOverride()
    .option("--json")
    .option("--quiet");
  for (const command of commands) program.addCommand(command);
  return program;
}

describe("loadbalancer IP ACL 쓰기 명령", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveLoadBalancerClient).mockResolvedValue({
      client,
      profileName: "default",
    });
    vi.mocked(resolveIpAclGroupId).mockResolvedValue("group-1");
    vi.mocked(resolveLoadBalancerId).mockResolvedValue("lb-1");
    vi.mocked(resolveIpAclGroups).mockResolvedValue([group, otherGroup]);
    createGroupMock.mockResolvedValue(group);
    deleteGroupMock.mockResolvedValue();
    bindGroupsMock.mockResolvedValue([]);
  });

  it("그룹 create 입력을 side effect 전에 검증하고 구조화 결과를 출력한다", async () => {
    await expect(
      programWith(ipaclCommand).parseAsync([
        "node",
        "nhncloud",
        "ipacl",
        "create",
        "--name",
        "office",
        "--action",
        "allow",
      ]),
    ).rejects.toThrow("ALLOW 또는 DENY");
    expect(resolveLoadBalancerClient).not.toHaveBeenCalled();
    expect(startSpinner).not.toHaveBeenCalled();

    await programWith(ipaclCommand).parseAsync([
      "node",
      "nhncloud",
      "--json",
      "ipacl",
      "create",
      "--name",
      " office ",
      "--action",
      "ALLOW",
      "--description",
      " internal ",
    ]);

    expect(createGroupMock).toHaveBeenCalledWith({
      name: "office",
      action: "ALLOW",
      description: "internal",
    });
    expect(output).toHaveBeenCalledWith(
      expect.objectContaining({ json: true }),
      expect.objectContaining({
        raw: {
          operation: "ipacl-group-create",
          status: "succeeded",
          ipacl_group_id: "group-1",
        },
        ids: ["group-1"],
      }),
    );
  });

  it("그룹 delete는 --yes를 인증 전에 요구하고 연쇄 삭제를 경고한다", async () => {
    await expect(
      programWith(ipaclCommand).parseAsync([
        "node",
        "nhncloud",
        "ipacl",
        "delete",
        "office",
      ]),
    ).rejects.toThrow("--yes");
    expect(resolveLoadBalancerClient).not.toHaveBeenCalled();
    expect(resolveIpAclGroupId).not.toHaveBeenCalled();
    expect(startSpinner).not.toHaveBeenCalled();

    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await programWith(ipaclCommand).parseAsync([
      "node",
      "nhncloud",
      "ipacl",
      "delete",
      "office",
      "--yes",
    ]);

    expect(deleteGroupMock).toHaveBeenCalledWith("group-1");
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("함께 제거"));
    expect(output).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ ids: ["group-1"] }),
    );
    stderr.mockRestore();
  });

  it("set-ipacl은 --yes와 group 입력을 인증 전에 검증한다", async () => {
    await expect(
      programWith(setIpAclCommand).parseAsync([
        "node",
        "nhncloud",
        "set-ipacl",
        "lb-1",
        "--group",
        "group-1",
      ]),
    ).rejects.toThrow("--yes");
    expect(resolveLoadBalancerClient).not.toHaveBeenCalled();
    expect(startSpinner).not.toHaveBeenCalled();
  });

  it("set-ipacl은 해석된 그룹을 전체 교체 payload로 전달한다", async () => {
    await programWith(setIpAclCommand).parseAsync([
      "node",
      "nhncloud",
      "--quiet",
      "set-ipacl",
      "public-lb",
      "--group",
      "office",
      "--group",
      "partners",
      "--yes",
    ]);

    expect(resolveLoadBalancerId).toHaveBeenCalledWith(client, "public-lb");
    expect(resolveIpAclGroups).toHaveBeenCalledWith(client, ["office", "partners"]);
    expect(bindGroupsMock).toHaveBeenCalledWith("lb-1", ["group-1", "group-2"]);
    expect(output).toHaveBeenCalledWith(
      expect.objectContaining({ quiet: true }),
      expect.objectContaining({
        raw: expect.objectContaining({
          operation: "loadbalancer-set-ipacl",
          ipacl_group_ids: ["group-1", "group-2"],
        }),
        ids: ["lb-1"],
      }),
    );
  });

  it("set-ipacl은 중복 ID와 action 불일치를 bind 전에 거부한다", async () => {
    vi.mocked(resolveIpAclGroups).mockResolvedValue([group, group]);
    await expect(
      programWith(setIpAclCommand).parseAsync([
        "node",
        "nhncloud",
        "set-ipacl",
        "lb-1",
        "--group",
        "office",
        "--group",
        "group-1",
        "--yes",
      ]),
    ).rejects.toThrow("중복");
    expect(bindGroupsMock).not.toHaveBeenCalled();

    vi.mocked(resolveIpAclGroups).mockResolvedValue([
      group,
      { ...otherGroup, action: "DENY" },
    ]);
    await expect(
      programWith(setIpAclCommand).parseAsync([
        "node",
        "nhncloud",
        "set-ipacl",
        "lb-1",
        "--group",
        "office",
        "--group",
        "partners",
        "--yes",
      ]),
    ).rejects.toThrow("action");
    expect(bindGroupsMock).not.toHaveBeenCalled();
  });

  it("clear-ipacl만 빈 배열을 전송하고 Load Balancer ID를 출력한다", async () => {
    await expect(
      programWith(clearIpAclCommand).parseAsync([
        "node",
        "nhncloud",
        "clear-ipacl",
        "lb-1",
      ]),
    ).rejects.toThrow("--yes");
    expect(resolveLoadBalancerClient).not.toHaveBeenCalled();

    await programWith(clearIpAclCommand).parseAsync([
      "node",
      "nhncloud",
      "clear-ipacl",
      "public-lb",
      "--yes",
    ]);
    expect(bindGroupsMock).toHaveBeenCalledWith("lb-1", []);
    expect(output).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ ids: ["lb-1"] }),
    );
  });

  it("Phase 2 신규 leaf help가 전역·지역·쓰기 옵션을 노출한다", () => {
    const root = new Command("nhncloud").option("--json").option("--quiet");
    const loadbalancer = new Command("loadbalancer")
      .addCommand(ipaclCommand)
      .addCommand(setIpAclCommand)
      .addCommand(clearIpAclCommand);
    root.addCommand(loadbalancer);
    configureLoadBalancerHelp(loadbalancer);

    const cases: Array<[string[], string[]]> = [
      [["ipacl", "create"], ["--json", "--quiet", "--region", "--profile", "--action"]],
      [["ipacl", "delete"], ["--json", "--quiet", "--region", "--profile", "--yes"]],
      [["set-ipacl"], ["--json", "--quiet", "--region", "--profile", "--yes", "--group"]],
      [["clear-ipacl"], ["--json", "--quiet", "--region", "--profile", "--yes"]],
    ];

    for (const [path, flags] of cases) {
      let command = loadbalancer;
      for (const segment of path) {
        const child = command.commands.find((candidate) => candidate.name() === segment);
        if (!child) throw new Error(`명령을 찾을 수 없습니다: ${path.join(" ")}`);
        command = child;
      }
      const help = command.helpInformation();
      for (const flag of flags) expect(help, path.join(" ")).toContain(flag);
    }
  });
});
