import { beforeEach, describe, expect, it, vi } from "vitest";
import ky from "ky";
import { ApiGatewayClient } from "./client.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_API_ERROR, EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

vi.mock("ky");

const successfulHeader = {
  isSuccessful: true,
  resultCode: 0,
  resultMessage: "SUCCESS",
};

function service(id: string, dedicatedId: string | null = null) {
  return {
    apigwServiceId: id,
    apigwServiceAlias: `alias-${id}`,
    apigwServiceName: `service-${id}`,
    apigwServiceDescription: `description-${id}`,
    apigwDomain: `${id}.example.com`,
    appKey: "test-appkey",
    regionCode: "kr1",
    serverGroupId: "server-group-id",
    dedicatedId,
    createdAt: "2026-08-01T00:00:00+09:00",
    updatedAt: "2026-08-02T00:00:00+09:00",
    apigwServiceTypeCode: "BASIC",
  };
}

function mockKyResponse(body: unknown) {
  return { json: async () => body } as never;
}

describe("ApiGatewayClient.listServices", () => {
  beforeEach(() => vi.resetAllMocks());

  it("paging.totalCount까지 전수 수집하고 X-NHN-Authorization을 사용한다", async () => {
    vi.mocked(ky.get)
      .mockReturnValueOnce(
        mockKyResponse({
          header: successfulHeader,
          apigwServiceList: [service("service-1")],
          paging: { limit: 1, page: 1, totalCount: 2 },
        }),
      )
      .mockReturnValueOnce(
        mockKyResponse({
          header: successfulHeader,
          apigwServiceList: [service("service-2", "dedicated-id")],
          paging: { limit: 1, page: 2, totalCount: 2 },
        }),
      );

    const client = new ApiGatewayClient("access-token", "kr1", "test-appkey");
    const result = await client.listServices({ limit: 1 });

    expect(result.map((item) => item.apigwServiceId)).toEqual(["service-1", "service-2"]);
    expect(result[0]?.dedicatedId).toBeNull();
    expect(ky.get).toHaveBeenCalledTimes(2);
    expect(ky.get).toHaveBeenNthCalledWith(
      1,
      "https://kr1-apigateway.api.nhncloudservice.com/v2.0/appkeys/test-appkey/services",
      expect.objectContaining({
        headers: { "X-NHN-Authorization": "Bearer access-token" },
        searchParams: { page: 1, limit: 1 },
        retry: 0,
        timeout: expect.any(Number),
      }),
    );
    expect(ky.get).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({ searchParams: { page: 2, limit: 1 } }),
    );
  });

  it("dedicatedId가 null인 service 응답을 거르지 않는다", async () => {
    vi.mocked(ky.get).mockReturnValue(
      mockKyResponse({
        header: successfulHeader,
        apigwServiceList: [service("service-1", null)],
        paging: { limit: 1000, page: 1, totalCount: 1 },
      }),
    );

    const client = new ApiGatewayClient("token", "kr1", "appkey");
    await expect(client.listServices()).resolves.toHaveLength(1);
  });

  it("service 항목 형식이 올바르지 않으면 EXIT_API_ERROR", async () => {
    vi.mocked(ky.get).mockReturnValue(
      mockKyResponse({
        header: successfulHeader,
        apigwServiceList: [{ ...service("service-1"), dedicatedId: 123 }],
        paging: { limit: 1000, page: 1, totalCount: 1 },
      }),
    );

    const client = new ApiGatewayClient("token", "kr1", "appkey");
    await expect(client.listServices()).rejects.toMatchObject({ exitCode: EXIT_API_ERROR });
  });

  it("isSuccessful=false면 EXIT_API_ERROR", async () => {
    vi.mocked(ky.get).mockReturnValue(
      mockKyResponse({
        header: { isSuccessful: false, resultCode: 403100000, resultMessage: "Permission denied" },
      }),
    );

    const client = new ApiGatewayClient("token", "kr1", "appkey");
    await expect(client.listServices()).rejects.toMatchObject({ exitCode: EXIT_API_ERROR });
  });

  it("미등록 region이면 client 생성 시 EXIT_PARAM_ERROR", () => {
    expect(() => new ApiGatewayClient("token", "xx", "appkey")).toThrow(
      expect.objectContaining({ exitCode: EXIT_PARAM_ERROR }),
    );
  });
});

describe("ApiGatewayClient.getService", () => {
  beforeEach(() => vi.resetAllMocks());

  it("apigwService 단건을 반환하고 ID를 URL 인코딩한다", async () => {
    vi.mocked(ky.get).mockReturnValue(
      mockKyResponse({ header: successfulHeader, apigwService: service("service-1") }),
    );

    const client = new ApiGatewayClient("token", "kr1", "appkey");
    await expect(client.getService("service/id")).resolves.toMatchObject({
      apigwServiceId: "service-1",
      dedicatedId: null,
    });
    expect(ky.get).toHaveBeenCalledWith(
      expect.stringContaining("/services/service%2Fid"),
      expect.objectContaining({
        headers: { "X-NHN-Authorization": "Bearer token" },
        retry: 0,
        timeout: expect.any(Number),
      }),
    );
  });

  it("apigwService 필드가 없으면 EXIT_API_ERROR", async () => {
    vi.mocked(ky.get).mockReturnValue(mockKyResponse({ header: successfulHeader }));

    const client = new ApiGatewayClient("token", "kr1", "appkey");
    await expect(client.getService("service-1")).rejects.toMatchObject({
      exitCode: EXIT_API_ERROR,
    });
  });

  it("isSuccessful=false면 EXIT_API_ERROR", async () => {
    vi.mocked(ky.get).mockReturnValue(
      mockKyResponse({
        header: { isSuccessful: false, resultCode: 4041007, resultMessage: "URL Not Found" },
      }),
    );

    const client = new ApiGatewayClient("token", "kr1", "appkey");
    await expect(client.getService("service-1")).rejects.toMatchObject({
      exitCode: EXIT_API_ERROR,
    });
  });

  it("이미 변환된 NhnCloudCliError를 그대로 보존한다", async () => {
    const error = new NhnCloudCliError("API 호출 실패 (404)", EXIT_API_ERROR);
    vi.mocked(ky.get).mockReturnValue({ json: async () => { throw error; } } as never);

    const client = new ApiGatewayClient("token", "kr1", "appkey");
    await expect(client.getService("service-1")).rejects.toBe(error);
  });
});
