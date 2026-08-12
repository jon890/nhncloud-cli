import { describe, expect, it, vi } from "vitest";
import { sanitizeForTerminal } from "../../utils/terminal.js";
import {
  rebindIpAclSnapshots,
  retryArgv,
  retryCommand,
  snapshotIpAclBindings,
  type IpAclBindingSnapshot,
} from "./rebind.js";

describe("IP ACL 재바인딩 복구 계약", () => {
  it("중복을 제거한 Load Balancer ID 순서로 snapshot한다", async () => {
    const getLoadBalancer = vi.fn(async (id: string) => ({
      id,
      name: id,
      vip_address: "192.0.2.10",
      provisioning_status: "ACTIVE",
      operating_status: "ONLINE",
      ipacl_group_action: "ALLOW" as const,
      ipacl_groups: [
        { ipacl_group_id: `${id}-group-2` },
        { ipacl_group_id: `${id}-group-1` },
      ],
    }));

    await expect(
      snapshotIpAclBindings({ getLoadBalancer }, ["lb-b", "lb-a", "lb-b"]),
    ).resolves.toEqual([
      {
        loadbalancer_id: "lb-a",
        ipacl_group_ids: ["lb-a-group-2", "lb-a-group-1"],
      },
      {
        loadbalancer_id: "lb-b",
        ipacl_group_ids: ["lb-b-group-2", "lb-b-group-1"],
      },
    ]);
    expect(getLoadBalancer.mock.calls.map(([id]) => id)).toEqual(["lb-a", "lb-b"]);
  });

  it("중간 실패를 보존하고 뒤의 Load Balancer까지 순차 재바인딩한다", async () => {
    const snapshots: IpAclBindingSnapshot[] = [
      { loadbalancer_id: "lb-a", ipacl_group_ids: ["group-1"] },
      { loadbalancer_id: "lb-b", ipacl_group_ids: ["group-1", "group-2"] },
      { loadbalancer_id: "lb-c", ipacl_group_ids: [] },
    ];
    const bindIpAclGroups = vi.fn(async (id: string) => {
      if (id === "lb-b") throw new Error("temporary\nfailure");
      return [];
    });

    const result = await rebindIpAclSnapshots({ bindIpAclGroups }, snapshots);

    expect(bindIpAclGroups.mock.calls.map(([id]) => id)).toEqual([
      "lb-a",
      "lb-b",
      "lb-c",
    ]);
    expect(result.succeeded).toEqual([snapshots[0], snapshots[2]]);
    expect(result.failed).toEqual([
      {
        ...snapshots[1],
        error: "temporary\nfailure",
        retry_argv: [
          "nhncloud",
          "loadbalancer",
          "set-ipacl",
          "lb-b",
          "--group",
          "group-1",
          "--group",
          "group-2",
          "--yes",
          "--json",
        ],
        retry_command:
          "'nhncloud' 'loadbalancer' 'set-ipacl' 'lb-b' '--group' 'group-1' '--group' 'group-2' '--yes' '--json'",
      },
    ]);
  });

  it("canonical argv를 보존하고 표시용 명령만 POSIX 단일 인용한다", () => {
    const snapshot = {
      loadbalancer_id: "lb ' odd",
      ipacl_group_ids: ["group one", "group'2"],
    };
    const argv = retryArgv(snapshot);

    expect(argv).toEqual([
      "nhncloud",
      "loadbalancer",
      "set-ipacl",
      "lb ' odd",
      "--group",
      "group one",
      "--group",
      "group'2",
      "--yes",
      "--json",
    ]);
    expect(retryCommand(argv)).toBe(
      "'nhncloud' 'loadbalancer' 'set-ipacl' 'lb '\"'\"' odd' '--group' 'group one' '--group' 'group'\"'\"'2' '--yes' '--json'",
    );
  });

  it("그룹이 없는 snapshot은 clear-ipacl 복구 argv를 만든다", () => {
    expect(
      retryArgv(
        { loadbalancer_id: "lb-1", ipacl_group_ids: [] },
        { profile: "prod profile", region: "kr2" },
      ),
    ).toEqual([
      "nhncloud",
      "loadbalancer",
      "clear-ipacl",
      "lb-1",
      "--profile",
      "prod profile",
      "--region",
      "kr2",
      "--yes",
      "--json",
    ]);
  });

  it("터미널 출력에서 제어 문자를 제거한다", () => {
    expect(sanitizeForTerminal("bad\nerror\u001b[31m\u0000")).toBe(
      "bad?error?[31m?",
    );
  });
});
