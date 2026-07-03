import { beforeEach, describe, expect, it, vi } from "vitest";
import ky from "ky";
import { NksClient } from "./client.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_API_ERROR, EXIT_AUTH_ERROR } from "../../utils/exit-codes.js";

vi.mock("ky");

describe("NksClient", () => {
  beforeEach(() => vi.resetAllMocks());

  it("supports() 는 평면 JSON 응답을 반환한다", async () => {
    vi.mocked(ky.get).mockReturnValue({
      json: async () => ({
        supported_k8s: { "v1.29.3": true, "v1.30.1": false },
        supported_event_type: { CLUSTER_CREATE: "Cluster create" },
      }),
    } as never);

    const client = new NksClient("token-id", "https://kr1-api-kubernetes-infrastructure.nhncloudservice.com/v1");
    const result = await client.supports();

    expect(result.supported_k8s["v1.29.3"]).toBe(true);
    expect(result.supported_event_type["CLUSTER_CREATE"]).toBe("Cluster create");
  });

  it("listClusters() 는 평면 JSON clusters 배열을 반환한다", async () => {
    vi.mocked(ky.get).mockReturnValue({
      json: async () => ({
        clusters: [
          {
            uuid: "cluster-uuid",
            name: "cluster-a",
            status: "CREATE_COMPLETE",
            health_status: "HEALTHY",
            node_count: 3,
            kube_tag: "v1.29.3",
          },
        ],
      }),
    } as never);

    const client = new NksClient("token-id", "https://kr1-api-kubernetes-infrastructure.nhncloudservice.com/v1");
    const result = await client.listClusters();

    expect(result).toHaveLength(1);
    expect(result[0].uuid).toBe("cluster-uuid");
    expect(result[0].node_count).toBe(3);
  });

  it("모든 요청에 OpenStack-API-Version header 를 포함한다", async () => {
    vi.mocked(ky.get).mockReturnValue({
      json: async () => ({
        supported_k8s: {},
        supported_event_type: {},
      }),
    } as never);

    const client = new NksClient("token-id", "https://kr1-api-kubernetes-infrastructure.nhncloudservice.com/v1");
    await client.supports();

    expect(ky.get).toHaveBeenCalledWith(
      "https://kr1-api-kubernetes-infrastructure.nhncloudservice.com/v1/supports",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Auth-Token": "token-id",
          "OpenStack-API-Version": "container-infra latest",
        }),
      }),
    );
  });

  it("봉투 응답만 들어오면 형식 오류를 던진다", async () => {
    vi.mocked(ky.get).mockReturnValue({
      json: async () => ({
        header: { isSuccessful: true, resultCode: 0, resultMessage: "OK" },
        body: {
          supported_k8s: {},
          supported_event_type: {},
        },
      }),
    } as never);

    const client = new NksClient("token-id", "https://kr1-api-kubernetes-infrastructure.nhncloudservice.com/v1");
    await expect(client.supports()).rejects.toMatchObject({
      exitCode: EXIT_API_ERROR,
    });
  });

  it("clusters 가 배열이 아니면 EXIT_API_ERROR 형식 오류를 던진다", async () => {
    vi.mocked(ky.get).mockReturnValue({
      json: async () => ({
        clusters: { unexpected: "object" },
      }),
    } as never);

    const client = new NksClient("token-id", "https://kr1-api-kubernetes-infrastructure.nhncloudservice.com/v1");
    await expect(client.listClusters()).rejects.toMatchObject({
      exitCode: EXIT_API_ERROR,
    });
  });

  it("HTTP 401 → EXIT_AUTH_ERROR (toNhnCloudCliError 매핑 유지)", async () => {
    vi.mocked(ky.get).mockReturnValue({
      json: async () => {
        throw new NhnCloudCliError("API 호출 실패 (401)", EXIT_AUTH_ERROR);
      },
    } as never);

    const client = new NksClient("token-id", "https://kr1-api-kubernetes-infrastructure.nhncloudservice.com/v1");
    await expect(client.supports()).rejects.toMatchObject({
      exitCode: EXIT_AUTH_ERROR,
    });
  });

  it("getCluster() 는 /clusters/{cluster} 평면 cluster 객체를 반환한다", async () => {
    vi.mocked(ky.get).mockReturnValue({
      json: async () => ({
        cluster: { uuid: "cluster-uuid", name: "cluster-a", status: "CREATE_COMPLETE" },
      }),
    } as never);

    const client = new NksClient("token-id", "https://kr1-api-kubernetes-infrastructure.nhncloudservice.com/v1");
    const result = await client.getCluster("cluster-a");

    expect(result.uuid).toBe("cluster-uuid");
    expect(ky.get).toHaveBeenCalledWith(
      "https://kr1-api-kubernetes-infrastructure.nhncloudservice.com/v1/clusters/cluster-a",
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it("getClusterKubeconfig() 는 text body 를 반환한다", async () => {
    vi.mocked(ky.get).mockReturnValue({
      text: async () => "apiVersion: v1\nkind: Config\n",
    } as never);

    const client = new NksClient("token-id", "https://kr1-api-kubernetes-infrastructure.nhncloudservice.com/v1");
    const result = await client.getClusterKubeconfig("cluster-a");

    expect(result).toContain("apiVersion");
    expect(ky.get).toHaveBeenCalledWith(
      "https://kr1-api-kubernetes-infrastructure.nhncloudservice.com/v1/clusters/cluster-a/config",
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it("listNodeGroups() 는 nodegroups 배열을 반환한다", async () => {
    vi.mocked(ky.get).mockReturnValue({
      json: async () => ({
        nodegroups: [{ uuid: "nodegroup-uuid", name: "worker", status: "CREATE_COMPLETE" }],
      }),
    } as never);

    const client = new NksClient("token-id", "https://kr1-api-kubernetes-infrastructure.nhncloudservice.com/v1");
    const result = await client.listNodeGroups("cluster-a");

    expect(result[0].name).toBe("worker");
  });

  it("listAddons() 는 query option 을 snake_case 로 전달한다", async () => {
    vi.mocked(ky.get).mockReturnValue({
      json: async () => ({
        addons: [{ uuid: "addon-uuid", name: "coredns", version: "1.0.0" }],
      }),
    } as never);

    const client = new NksClient("token-id", "https://kr1-api-kubernetes-infrastructure.nhncloudservice.com/v1");
    const result = await client.listAddons({
      k8sVersion: "v1.29.3",
      image: "ubuntu",
      platformVersion: "1.0",
    });

    expect(result[0].name).toBe("coredns");
    expect(ky.get).toHaveBeenCalledWith(
      "https://kr1-api-kubernetes-infrastructure.nhncloudservice.com/v1/addons",
      expect.objectContaining({
        searchParams: {
          k8s_version: "v1.29.3",
          image: "ubuntu",
          platform_version: "1.0",
        },
      }),
    );
  });

  it("cluster addon get 응답이 addon 객체가 아니면 EXIT_API_ERROR", async () => {
    vi.mocked(ky.get).mockReturnValue({
      json: async () => ({ addon: null }),
    } as never);

    const client = new NksClient("token-id", "https://kr1-api-kubernetes-infrastructure.nhncloudservice.com/v1");
    await expect(client.getClusterAddon("cluster-a", "addon-a")).rejects.toMatchObject({
      exitCode: EXIT_API_ERROR,
    });
  });

  it("createCluster() 는 POST /clusters 에 raw payload 를 전달하고 uuid 를 반환한다", async () => {
    vi.mocked(ky.post).mockReturnValue({
      json: async () => ({ uuid: "cluster-uuid" }),
    } as never);

    const client = new NksClient("token-id", "https://kr1-api-kubernetes-infrastructure.nhncloudservice.com/v1");
    const result = await client.createCluster({ name: "cluster-a" });

    expect(result.uuid).toBe("cluster-uuid");
    expect(ky.post).toHaveBeenCalledWith(
      "https://kr1-api-kubernetes-infrastructure.nhncloudservice.com/v1/clusters",
      expect.objectContaining({
        json: { name: "cluster-a" },
        headers: expect.objectContaining({
          "OpenStack-API-Version": "container-infra latest",
        }),
      }),
    );
  });

  it("deleteCluster() 는 DELETE /clusters/{cluster} 를 호출한다", async () => {
    vi.mocked(ky.delete).mockReturnValue({} as never);

    const client = new NksClient("token-id", "https://kr1-api-kubernetes-infrastructure.nhncloudservice.com/v1");
    await client.deleteCluster("cluster-a");

    expect(ky.delete).toHaveBeenCalledWith(
      "https://kr1-api-kubernetes-infrastructure.nhncloudservice.com/v1/clusters/cluster-a",
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it("resizeCluster() 는 node_count 와 nodes_to_remove 를 POST 한다", async () => {
    vi.mocked(ky.post).mockReturnValue({} as never);

    const client = new NksClient("token-id", "https://kr1-api-kubernetes-infrastructure.nhncloudservice.com/v1");
    await client.resizeCluster({
      cluster: "cluster-a",
      nodegroup: "worker",
      nodeCount: 2,
      nodesToRemove: ["node-1", "node-2"],
    });

    expect(ky.post).toHaveBeenCalledWith(
      "https://kr1-api-kubernetes-infrastructure.nhncloudservice.com/v1/clusters/cluster-a/actions/resize",
      expect.objectContaining({
        json: {
          nodegroup: "worker",
          node_count: 2,
          nodes_to_remove: ["node-1", "node-2"],
        },
      }),
    );
  });

  it("renewClusterCertificate() 는 PATCH /certificates/{cluster} 를 호출한다", async () => {
    vi.mocked(ky.patch).mockReturnValue({
      json: async () => ({ uuid: "request-uuid" }),
    } as never);

    const client = new NksClient("token-id", "https://kr1-api-kubernetes-infrastructure.nhncloudservice.com/v1");
    await client.renewClusterCertificate("cluster-a", 3);

    expect(ky.patch).toHaveBeenCalledWith(
      "https://kr1-api-kubernetes-infrastructure.nhncloudservice.com/v1/certificates/cluster-a",
      expect.objectContaining({ json: { term_of_validity: 3 } }),
    );
  });

  it("setControlPlaneLog() 는 type discriminator 와 control_plane_log 객체를 PATCH 한다", async () => {
    vi.mocked(ky.patch).mockReturnValue({
      json: async () => ({ uuid: "request-uuid" }),
    } as never);

    const client = new NksClient("token-id", "https://kr1-api-kubernetes-infrastructure.nhncloudservice.com/v1");
    await client.setControlPlaneLog("cluster-a", { enabled: true });

    expect(ky.patch).toHaveBeenCalledWith(
      "https://kr1-api-kubernetes-infrastructure.nhncloudservice.com/v1/clusters/cluster-a",
      expect.objectContaining({
        json: {
          type: "control_plane_log",
          control_plane_log: { enabled: true },
        },
      }),
    );
  });

  it("createNodeGroup() 은 POST /clusters/{cluster}/nodegroups 에 raw payload 를 전달한다", async () => {
    vi.mocked(ky.post).mockReturnValue({
      json: async () => ({ uuid: "nodegroup-uuid" }),
    } as never);

    const client = new NksClient("token-id", "https://kr1-api-kubernetes-infrastructure.nhncloudservice.com/v1");
    await client.createNodeGroup("cluster-a", { name: "worker" });

    expect(ky.post).toHaveBeenCalledWith(
      "https://kr1-api-kubernetes-infrastructure.nhncloudservice.com/v1/clusters/cluster-a/nodegroups",
      expect.objectContaining({ json: { name: "worker" } }),
    );
  });

  it("stopNodeGroupNodes() 는 node_list 를 colon 구분 문자열로 보낸다", async () => {
    vi.mocked(ky.post).mockReturnValue({
      json: async () => ({ uuid: "request-uuid" }),
    } as never);

    const client = new NksClient("token-id", "https://kr1-api-kubernetes-infrastructure.nhncloudservice.com/v1");
    await client.stopNodeGroupNodes("cluster-a", "worker", ["node-1", "node-2"]);

    expect(ky.post).toHaveBeenCalledWith(
      "https://kr1-api-kubernetes-infrastructure.nhncloudservice.com/v1/clusters/cluster-a/nodegroups/worker/stop_node",
      expect.objectContaining({ json: { node_list: "node-1:node-2" } }),
    );
  });

  it("setNodeGroupMetricAutoscale() 는 PATCH discriminator 를 넣는다", async () => {
    vi.mocked(ky.patch).mockReturnValue({
      json: async () => ({ uuid: "request-uuid" }),
    } as never);

    const client = new NksClient("token-id", "https://kr1-api-kubernetes-infrastructure.nhncloudservice.com/v1");
    await client.setNodeGroupMetricAutoscale("cluster-a", "worker", { enabled: true });

    expect(ky.patch).toHaveBeenCalledWith(
      "https://kr1-api-kubernetes-infrastructure.nhncloudservice.com/v1/clusters/cluster-a/nodegroups/worker",
      expect.objectContaining({ json: { enabled: true, type: "metric_base_autoscale" } }),
    );
  });

  it("upgradeNodeGroup() 은 optional buffer 값을 snake_case 로 보낸다", async () => {
    vi.mocked(ky.post).mockReturnValue({
      json: async () => ({ uuid: "request-uuid" }),
    } as never);

    const client = new NksClient("token-id", "https://kr1-api-kubernetes-infrastructure.nhncloudservice.com/v1");
    await client.upgradeNodeGroup("cluster-a", "default-master", {
      version: "v1.30.1",
      numBufferNodes: 1,
      numMaxUnavailableNodes: 2,
    });

    expect(ky.post).toHaveBeenCalledWith(
      "https://kr1-api-kubernetes-infrastructure.nhncloudservice.com/v1/clusters/cluster-a/nodegroups/default-master/upgrade",
      expect.objectContaining({
        json: {
          version: "v1.30.1",
          num_buffer_nodes: 1,
          num_max_unavailable_nodes: 2,
        },
      }),
    );
  });

  it("updateNodeGroupFlavor() 는 flavor_id discriminator 를 PATCH 한다", async () => {
    vi.mocked(ky.patch).mockReturnValue({
      json: async () => ({ uuid: "request-uuid" }),
    } as never);

    const client = new NksClient("token-id", "https://kr1-api-kubernetes-infrastructure.nhncloudservice.com/v1");
    await client.updateNodeGroupFlavor("cluster-a", "worker", { flavorId: "flavor-uuid" });

    expect(ky.patch).toHaveBeenCalledWith(
      "https://kr1-api-kubernetes-infrastructure.nhncloudservice.com/v1/clusters/cluster-a/nodegroups/worker",
      expect.objectContaining({ json: { flavor_id: "flavor-uuid", type: "flavor_id" } }),
    );
  });
});
