import { beforeEach, describe, expect, it, vi } from "vitest";
import ky, { HTTPError } from "ky";
import { LoadBalancerClient } from "./client.js";
import { EXIT_API_ERROR, EXIT_AUTH_ERROR } from "../../utils/exit-codes.js";

vi.mock("ky", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ky")>();
  return {
    ...actual,
    default: {
      ...actual.default,
      get: vi.fn(),
    },
  };
});

const loadBalancer = {
  id: "lb-1",
  name: "public-lb",
  vip_address: "192.0.2.10",
  provisioning_status: "ACTIVE",
  operating_status: "ONLINE",
  ipacl_group_action: "DENY",
  ipacl_groups: [{ ipacl_group_id: "group-1" }],
};

const ipAclGroup = {
  id: "group-1",
  name: "blocked-networks",
  action: "DENY",
  ipacl_target_count: "1",
  loadbalancers: [{ loadbalancer_id: "lb-1" }],
};

const ipAclTarget = {
  id: "target-1",
  cidr_address: "198.51.100.0/24",
  description: "example network",
  ipacl_group_id: "group-1",
};

function mockJsonResponse(response: unknown): void {
  vi.mocked(ky.get).mockReturnValue({
    json: async () => response,
  } as never);
}

describe("LoadBalancerClient", () => {
  beforeEach(() => vi.resetAllMocks());

  it("Load Balancer 목록 URL과 query, 인증·재시도·timeout 정책을 적용한다", async () => {
    mockJsonResponse({ loadbalancers: [] });

    const client = new LoadBalancerClient("token-id", "https://example.com/v2.0");
    await client.listLoadBalancers({ name: "public-lb" });

    expect(ky.get).toHaveBeenCalledWith(
      "https://example.com/v2.0/lbaas/loadbalancers",
      {
        headers: { "X-Auth-Token": "token-id" },
        searchParams: { name: "public-lb" },
        retry: 0,
        timeout: 30_000,
      },
    );
  });

  it("Load Balancer 단건을 반환하고 경로 식별자를 인코딩한다", async () => {
    mockJsonResponse({ loadbalancer: loadBalancer });

    const client = new LoadBalancerClient("token-id", "https://example.com/v2.0");
    const result = await client.getLoadBalancer("lb/id with space");

    expect(result).toEqual(loadBalancer);
    expect(ky.get).toHaveBeenCalledWith(
      "https://example.com/v2.0/lbaas/loadbalancers/lb%2Fid%20with%20space",
      expect.objectContaining({
        headers: { "X-Auth-Token": "token-id" },
        retry: 0,
        timeout: 30_000,
      }),
    );
  });

  it("Load Balancer 목록과 nullable IP ACL action을 반환한다", async () => {
    const withoutIpAcl = {
      ...loadBalancer,
      ipacl_group_action: null,
      ipacl_groups: [],
    };
    mockJsonResponse({ loadbalancers: [withoutIpAcl] });

    const client = new LoadBalancerClient("token-id", "https://example.com/v2.0");
    const result = await client.listLoadBalancers();

    expect(result).toEqual([withoutIpAcl]);
    expect(result[0].ipacl_group_action).toBeNull();
  });

  it("IP ACL 그룹 목록을 반환하고 문자열 target count를 보존한다", async () => {
    mockJsonResponse({ ipacl_groups: [ipAclGroup] });

    const client = new LoadBalancerClient("token-id", "https://example.com/v2.0");
    const result = await client.listIpAclGroups({ name: "blocked-networks" });

    expect(result).toEqual([ipAclGroup]);
    expect(result[0].ipacl_target_count).toBe("1");
    expect(ky.get).toHaveBeenCalledWith(
      "https://example.com/v2.0/lbaas/ipacl-groups",
      expect.objectContaining({
        searchParams: { name: "blocked-networks" },
        headers: { "X-Auth-Token": "token-id" },
        retry: 0,
        timeout: 30_000,
      }),
    );
  });

  it("IP ACL 그룹 단건을 반환하고 경로 식별자를 인코딩한다", async () => {
    mockJsonResponse({ ipacl_group: ipAclGroup });

    const client = new LoadBalancerClient("token-id", "https://example.com/v2.0");
    const result = await client.getIpAclGroup("group/id");

    expect(result).toEqual(ipAclGroup);
    expect(ky.get).toHaveBeenCalledWith(
      "https://example.com/v2.0/lbaas/ipacl-groups/group%2Fid",
      expect.objectContaining({
        headers: { "X-Auth-Token": "token-id" },
        retry: 0,
        timeout: 30_000,
      }),
    );
  });

  it("IP ACL 대상 목록과 필수 group query를 반환한다", async () => {
    mockJsonResponse({ ipacl_targets: [ipAclTarget] });

    const client = new LoadBalancerClient("token-id", "https://example.com/v2.0");
    const result = await client.listIpAclTargets({ ipacl_group_id: "group-1" });

    expect(result).toEqual([ipAclTarget]);
    expect(ky.get).toHaveBeenCalledWith(
      "https://example.com/v2.0/lbaas/ipacl-targets",
      {
        headers: { "X-Auth-Token": "token-id" },
        searchParams: { ipacl_group_id: "group-1" },
        retry: 0,
        timeout: 30_000,
      },
    );
  });

  it.each([
    ["Load Balancer", { loadbalancers: [] }, (client: LoadBalancerClient) => client.listLoadBalancers()],
    ["IP ACL 그룹", { ipacl_groups: [] }, (client: LoadBalancerClient) => client.listIpAclGroups()],
    [
      "IP ACL 대상",
      { ipacl_targets: [] },
      (client: LoadBalancerClient) => client.listIpAclTargets({ ipacl_group_id: "group-1" }),
    ],
  ])("%s 빈 목록은 빈 배열을 반환한다", async (_label, response, request) => {
    mockJsonResponse(response);

    const client = new LoadBalancerClient("token-id", "https://example.com/v2.0");
    await expect(request(client)).resolves.toEqual([]);
  });

  it.each([
    ["loadbalancers", (client: LoadBalancerClient) => client.listLoadBalancers()],
    ["ipacl_groups", (client: LoadBalancerClient) => client.listIpAclGroups()],
    [
      "ipacl_targets",
      (client: LoadBalancerClient) => client.listIpAclTargets({ ipacl_group_id: "group-1" }),
    ],
  ])("%s 배열 키 누락과 항목 형식 오류를 구분한다", async (key, request) => {
    const client = new LoadBalancerClient("token-id", "https://example.com/v2.0");

    mockJsonResponse({ unexpected: [] });
    await expect(request(client)).rejects.toMatchObject({
      message: expect.stringContaining(`${key} 배열이 없습니다`),
      exitCode: EXIT_API_ERROR,
    });

    mockJsonResponse({ [key]: [null] });
    await expect(request(client)).rejects.toMatchObject({
      message: expect.stringContaining("항목 형식이 예상과 다릅니다"),
      exitCode: EXIT_API_ERROR,
    });
  });

  it("중첩 참조 배열의 null·비객체 항목과 빈 식별자를 거부한다", async () => {
    const client = new LoadBalancerClient("token-id", "https://example.com/v2.0");

    mockJsonResponse({
      loadbalancers: [{ ...loadBalancer, ipacl_groups: [null] }],
    });
    await expect(client.listLoadBalancers()).rejects.toMatchObject({
      exitCode: EXIT_API_ERROR,
    });

    mockJsonResponse({
      ipacl_groups: [{ ...ipAclGroup, loadbalancers: ["lb-1"] }],
    });
    await expect(client.listIpAclGroups()).rejects.toMatchObject({
      exitCode: EXIT_API_ERROR,
    });

    mockJsonResponse({
      ipacl_targets: [{ ...ipAclTarget, id: "" }],
    });
    await expect(
      client.listIpAclTargets({ ipacl_group_id: "group-1" }),
    ).rejects.toMatchObject({
      exitCode: EXIT_API_ERROR,
    });
  });

  it("HTTP 401 오류를 EXIT_AUTH_ERROR로 변환한다", async () => {
    const response = new Response(null, { status: 401, statusText: "Unauthorized" });
    const request = new Request("https://example.com/v2.0/lbaas/loadbalancers");
    const error = new HTTPError(response, request, {} as never);
    vi.mocked(ky.get).mockReturnValue({
      json: async () => {
        throw error;
      },
    } as never);

    const client = new LoadBalancerClient("token-id", "https://example.com/v2.0");
    await expect(client.listLoadBalancers()).rejects.toMatchObject({
      exitCode: EXIT_AUTH_ERROR,
    });
  });
});
