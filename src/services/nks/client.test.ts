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
});
