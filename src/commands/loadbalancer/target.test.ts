import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { output } from "../../formatters/table.js";
import { LoadBalancerClient } from "../../services/loadbalancer/client.js";
import type {
  IpAclGroup,
  IpAclTarget,
  LoadBalancer,
} from "../../services/loadbalancer/types.js";
import { EXIT_API_ERROR } from "../../utils/exit-codes.js";
import { startSpinner } from "../../utils/spinner.js";
import {
  resolveIpAclGroupId,
  resolveLoadBalancerClient,
} from "./helpers.js";
import { configureLoadBalancerHelp } from "./help.js";
import { targetCommand } from "./target.js";

vi.mock("./helpers.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./helpers.js")>();
  return {
    ...actual,
    resolveIpAclGroupId: vi.fn(),
    resolveLoadBalancerClient: vi.fn(),
  };
});

vi.mock("../../formatters/table.js", () => ({ output: vi.fn() }));
vi.mock("../../utils/spinner.js", () => ({
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
}));

const target: IpAclTarget = {
  id: "target-1",
  cidr_address: "10.0.0.0/24",
  description: "internal",
  ipacl_group_id: "group-1",
};

const group: IpAclGroup = {
  id: "group-1",
  name: "office",
  action: "ALLOW",
  ipacl_target_count: "1",
  loadbalancers: [
    { loadbalancer_id: "lb-b" },
    { loadbalancer_id: "lb-a" },
  ],
};

function loadBalancer(id: string, groupIds = ["group-1"]): LoadBalancer {
  return {
    id,
    name: id,
    vip_address: "192.0.2.10",
    provisioning_status: "ACTIVE",
    operating_status: "ONLINE",
    ipacl_group_action: "ALLOW",
    ipacl_groups: groupIds.map((ipacl_group_id) => ({ ipacl_group_id })),
  };
}

const client = new LoadBalancerClient("token-id", "https://example.com/v2.0");
const getGroupMock = vi.spyOn(client, "getIpAclGroup");
const getTargetMock = vi.spyOn(client, "getIpAclTarget");
const getLoadBalancerMock = vi.spyOn(client, "getLoadBalancer");
const createTargetMock = vi.spyOn(client, "createIpAclTarget");
const deleteTargetMock = vi.spyOn(client, "deleteIpAclTarget");
const bindGroupsMock = vi.spyOn(client, "bindIpAclGroups");

function programWithTarget(): Command {
  const root = new Command("nhncloud")
    .exitOverride()
    .option("--json")
    .option("--quiet");
  const loadbalancer = new Command("loadbalancer");
  const ipacl = new Command("ipacl");
  ipacl.addCommand(targetCommand);
  loadbalancer.addCommand(ipacl);
  root.addCommand(loadbalancer);
  return root;
}

describe("loadbalancer IP ACL 대상 쓰기 명령", () => {
  let stderr: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.mocked(resolveLoadBalancerClient).mockResolvedValue({
      client,
      profileName: "default",
    });
    vi.mocked(resolveIpAclGroupId).mockResolvedValue("group-1");
    getGroupMock.mockResolvedValue(group);
    getTargetMock.mockResolvedValue(target);
    getLoadBalancerMock.mockImplementation(async (id) => loadBalancer(id));
    createTargetMock.mockResolvedValue(target);
    deleteTargetMock.mockResolvedValue();
    bindGroupsMock.mockResolvedValue([]);
  });

  afterEach(() => {
    stderr.mockRestore();
    process.exitCode = undefined;
  });

  it("--yes와 CIDR을 credential·spinner·client보다 먼저 검증한다", async () => {
    await expect(
      programWithTarget().parseAsync([
        "node",
        "nhncloud",
        "loadbalancer",
        "ipacl",
        "target",
        "add",
        "office",
        "--cidr",
        "10.0.0.0/24",
      ]),
    ).rejects.toThrow("--yes");

    await expect(
      programWithTarget().parseAsync([
        "node",
        "nhncloud",
        "loadbalancer",
        "ipacl",
        "target",
        "add",
        "office",
        "--cidr",
        "10.0.0.0/99",
        "--yes",
      ]),
    ).rejects.toThrow("prefix");

    expect(resolveLoadBalancerClient).not.toHaveBeenCalled();
    expect(resolveIpAclGroupId).not.toHaveBeenCalled();
    expect(startSpinner).not.toHaveBeenCalled();
    expect(createTargetMock).not.toHaveBeenCalled();
  });

  it("remove의 --yes와 빈 target ID도 credential 전에 거부한다", async () => {
    await expect(
      programWithTarget().parseAsync([
        "node",
        "nhncloud",
        "loadbalancer",
        "ipacl",
        "target",
        "remove",
        "target-1",
      ]),
    ).rejects.toThrow("--yes");
    await expect(
      programWithTarget().parseAsync([
        "node",
        "nhncloud",
        "loadbalancer",
        "ipacl",
        "target",
        "remove",
        " ",
        "--yes",
      ]),
    ).rejects.toThrow("이름 또는 UUID");

    expect(resolveLoadBalancerClient).not.toHaveBeenCalled();
    expect(startSpinner).not.toHaveBeenCalled();
    expect(getTargetMock).not.toHaveBeenCalled();
    expect(deleteTargetMock).not.toHaveBeenCalled();
  });

  it("모든 snapshot을 완료한 뒤 대상을 한 번 추가하고 순차 재바인딩한다", async () => {
    await programWithTarget().parseAsync([
      "node",
      "nhncloud",
      "--json",
      "loadbalancer",
      "ipacl",
      "target",
      "add",
      "office",
      "--cidr",
      "10.0.0.0/24",
      "--description",
      " internal ",
      "--yes",
    ]);

    expect(getLoadBalancerMock.mock.calls.map(([id]) => id)).toEqual(["lb-a", "lb-b"]);
    expect(createTargetMock).toHaveBeenCalledTimes(1);
    expect(createTargetMock).toHaveBeenCalledWith({
      ipacl_group_id: "group-1",
      cidr_address: "10.0.0.0/24",
      description: "internal",
    });
    const lastSnapshotOrder = Math.max(
      ...getLoadBalancerMock.mock.invocationCallOrder,
    );
    expect(lastSnapshotOrder).toBeLessThan(
      createTargetMock.mock.invocationCallOrder[0] ?? 0,
    );
    expect(createTargetMock.mock.invocationCallOrder[0]).toBeLessThan(
      bindGroupsMock.mock.invocationCallOrder[0] ?? 0,
    );
    expect(bindGroupsMock.mock.calls.map(([id]) => id)).toEqual(["lb-a", "lb-b"]);
    expect(output).toHaveBeenCalledWith(
      expect.objectContaining({ json: true }),
      expect.objectContaining({
        raw: expect.objectContaining({
          operation: "ipacl-target-add",
          status: "succeeded",
          target: { id: "target-1", ipacl_group_id: "group-1" },
        }),
        ids: ["target-1"],
      }),
    );
  });

  it("snapshot이 실패하면 대상을 변경하지 않는다", async () => {
    getLoadBalancerMock.mockRejectedValueOnce(new Error("snapshot failed"));

    await expect(
      programWithTarget().parseAsync([
        "node",
        "nhncloud",
        "loadbalancer",
        "ipacl",
        "target",
        "add",
        "office",
        "--cidr",
        "10.0.0.1",
        "--yes",
      ]),
    ).rejects.toThrow("snapshot failed");

    expect(createTargetMock).not.toHaveBeenCalled();
    expect(bindGroupsMock).not.toHaveBeenCalled();
  });

  it("remove는 target ID로 소속 그룹을 조회한 뒤 삭제한다", async () => {
    await programWithTarget().parseAsync([
      "node",
      "nhncloud",
      "loadbalancer",
      "ipacl",
      "target",
      "remove",
      "target-1",
      "--yes",
    ]);

    expect(getTargetMock).toHaveBeenCalledWith("target-1");
    expect(resolveIpAclGroupId).not.toHaveBeenCalled();
    expect(getGroupMock).toHaveBeenCalledWith("group-1");
    expect(deleteTargetMock).toHaveBeenCalledTimes(1);
    expect(deleteTargetMock).toHaveBeenCalledWith("target-1");
    expect(Math.max(...getLoadBalancerMock.mock.invocationCallOrder)).toBeLessThan(
      deleteTargetMock.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("재바인딩 부분 실패 결과를 먼저 출력하고 후속 대상을 계속 처리한다", async () => {
    bindGroupsMock.mockImplementation(async (id) => {
      if (id === "lb-a") throw new Error("bad\n\u001b[31m");
      return [];
    });

    await programWithTarget().parseAsync([
      "node",
      "nhncloud",
      "--json",
      "loadbalancer",
      "ipacl",
      "target",
      "remove",
      "target-1",
      "--yes",
    ]);

    expect(deleteTargetMock).toHaveBeenCalledTimes(1);
    expect(bindGroupsMock.mock.calls.map(([id]) => id)).toEqual(["lb-a", "lb-b"]);
    expect(output).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        raw: {
          operation: "ipacl-target-remove",
          status: "partial",
          target: { id: "target-1", ipacl_group_id: "group-1" },
          rebind: expect.objectContaining({
            skipped: false,
            failed: [
              expect.objectContaining({
                loadbalancer_id: "lb-a",
                retry_argv: [
                  "nhncloud",
                  "loadbalancer",
                  "set-ipacl",
                  "lb-a",
                  "--group",
                  "group-1",
                  "--yes",
                  "--json",
                ],
              }),
            ],
          }),
        },
      }),
    );
    expect(vi.mocked(output).mock.invocationCallOrder[0]).toBeLessThan(
      stderr.mock.invocationCallOrder[0] ?? 0,
    );
    expect(stderr).not.toHaveBeenCalledWith(expect.stringContaining("\n\u001b"));
    expect(stderr.mock.calls.flat().join("")).toContain("bad??[31m");
    expect(process.exitCode).toBe(EXIT_API_ERROR);
  });

  it("--no-rebind는 재바인딩을 생략하고 quiet target ID 계약을 유지한다", async () => {
    await programWithTarget().parseAsync([
      "node",
      "nhncloud",
      "--quiet",
      "loadbalancer",
      "ipacl",
      "target",
      "add",
      "office",
      "--cidr",
      "10.0.0.8",
      "--no-rebind",
      "--yes",
    ]);

    expect(getLoadBalancerMock).not.toHaveBeenCalled();
    expect(bindGroupsMock).not.toHaveBeenCalled();
    expect(output).toHaveBeenCalledWith(
      expect.objectContaining({ quiet: true }),
      expect.objectContaining({
        raw: expect.objectContaining({
          rebind: { skipped: true, succeeded: [], failed: [] },
        }),
        ids: ["target-1"],
      }),
    );
    const warning = stderr.mock.calls.flat().join("");
    expect(warning).toContain("--no-rebind");
    expect(warning).toContain("private CIDR");
    expect(process.exitCode).toBeUndefined();
  });

  it("add/remove leaf help가 전역·지역·쓰기 안전 옵션을 노출한다", () => {
    const root = new Command("nhncloud").option("--json").option("--quiet");
    const loadbalancer = new Command("loadbalancer");
    const ipacl = new Command("ipacl");
    ipacl.addCommand(targetCommand);
    loadbalancer.addCommand(ipacl);
    root.addCommand(loadbalancer);
    configureLoadBalancerHelp(loadbalancer);

    const cases: Array<[string, string[]]> = [
      [
        "add",
        [
          "--json",
          "--quiet",
          "--region",
          "--profile",
          "--cidr",
          "--description",
          "--yes",
          "--no-rebind",
        ],
      ],
      [
        "remove",
        ["--json", "--quiet", "--region", "--profile", "--yes", "--no-rebind"],
      ],
    ];
    for (const [name, flags] of cases) {
      const command = targetCommand.commands.find(
        (candidate) => candidate.name() === name,
      );
      if (!command) throw new Error(`명령을 찾을 수 없습니다: ${name}`);
      const help = command.helpInformation();
      for (const flag of flags) expect(help, name).toContain(flag);
    }
  });
});
