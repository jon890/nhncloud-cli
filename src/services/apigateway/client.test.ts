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

function resource(id: string) {
  return {
    resourceId: id,
    apigwServiceId: "service-1",
    parentPath: null,
    path: "/pets",
    methodType: null,
    methodName: null,
    methodDescription: null,
    createdAt: "2026-08-01T00:00:00+09:00",
    updatedAt: "2026-08-02T00:00:00+09:00",
    resourcePluginList: [],
  };
}

function stage(id: string, stageName: string | null = null) {
  return {
    stageId: id,
    apigwServiceId: "service-1",
    regionCode: "kr1",
    stageName,
    stageDescription: `description-${id}`,
    stageUrl: `https://${id}.example.com`,
    backendEndpointUrl: "https://backend.example.com",
    resourceUpdatedAt: "2026-08-03T00:00:00+09:00",
    createdAt: "2026-08-01T00:00:00+09:00",
    updatedAt: "2026-08-02T00:00:00+09:00",
    stageCustomUrl: `https://custom-${id}.example.com`,
    stageCustomDomainList: [
      { customDomain: `custom-${id}.example.com`, createdAt: "2026-08-01T00:00:00+09:00" },
    ],
    stageAliasDomainList: [
      { aliasDomain: `alias-${id}.example.com`, createdAt: "2026-08-01T00:00:00+09:00" },
    ],
  };
}

function stageResource(id: string) {
  return {
    stageResourceId: id,
    path: "/pets",
    methodType: null,
    methodName: null,
    methodDescription: null,
    customBackendEndpointUrl: null,
    updatedAt: "2026-08-02T00:00:00+09:00",
    stageResourcePluginList: [{ pluginType: "CORS" }],
  };
}

function deployHistory(id: string) {
  return {
    deployId: id,
    stageId: "stage-1",
    deployedAt: "2026-08-03T00:00:00+09:00",
    rollbackAt: null,
    deployDescription: `deploy-${id}`,
    isBase: false,
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

describe("ApiGatewayClient.listResources", () => {
  beforeEach(() => vi.resetAllMocks());

  it("paging 없이 한 번만 조회하고 nullable resource 필드를 허용한다", async () => {
    vi.mocked(ky.get).mockReturnValue(
      mockKyResponse({ header: successfulHeader, resourceList: [resource("resource-1")] }),
    );

    const client = new ApiGatewayClient("token", "kr1", "appkey");
    const result = await client.listResources("service/id");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      parentPath: null,
      methodType: null,
      methodName: null,
      methodDescription: null,
    });
    expect(ky.get).toHaveBeenCalledTimes(1);
    expect(ky.get).toHaveBeenCalledWith(
      expect.stringContaining("/services/service%2Fid/resources"),
      expect.objectContaining({
        headers: { "X-NHN-Authorization": "Bearer token" },
        retry: 0,
        timeout: expect.any(Number),
      }),
    );
    expect(vi.mocked(ky.get).mock.calls[0]?.[1]).not.toHaveProperty("searchParams");
  });

  it("isSuccessful=false면 EXIT_API_ERROR", async () => {
    vi.mocked(ky.get).mockReturnValue(
      mockKyResponse({
        header: { isSuccessful: false, resultCode: 403100000, resultMessage: "Permission denied" },
      }),
    );

    const client = new ApiGatewayClient("token", "kr1", "appkey");
    await expect(client.listResources("service-1")).rejects.toMatchObject({
      exitCode: EXIT_API_ERROR,
    });
  });
});

describe("ApiGatewayClient 봉투 leak 방지", () => {
  beforeEach(() => vi.resetAllMocks());

  it("getResourceParameters 는 header 를 반환값에 담지 않는다", async () => {
    vi.mocked(ky.get).mockReturnValue(
      mockKyResponse({
        header: successfulHeader,
        queryStringList: [],
        headerList: [],
        formDataList: [],
        requestBody: { name: null, description: null, modelId: null },
        contentTypeList: [],
      }),
    );

    const client = new ApiGatewayClient("token", "kr1", "appkey");
    const result = await client.getResourceParameters("service-1", "resource-1");

    // objectContaining 은 잉여 키를 통과시키므로 키 집합을 정확히 단언한다.
    expect(Object.keys(result).sort()).toEqual(
      ["contentTypeList", "formDataList", "headerList", "queryStringList", "requestBody"].sort(),
    );
    expect(result).not.toHaveProperty("header");
  });

  it("getResourceResponses 는 header 를 반환값에 담지 않는다", async () => {
    vi.mocked(ky.get).mockReturnValue(
      mockKyResponse({
        header: successfulHeader,
        responseList: [],
        contentTypeList: [],
      }),
    );

    const client = new ApiGatewayClient("token", "kr1", "appkey");
    const result = await client.getResourceResponses("service-1", "resource-1");

    expect(Object.keys(result).sort()).toEqual(["contentTypeList", "responseList"].sort());
    expect(result).not.toHaveProperty("header");
  });
});

describe("ApiGatewayClient.getResourceParameters", () => {
  beforeEach(() => vi.resetAllMocks());

  it("빈 배열과 nullable requestBody를 정상 응답으로 반환한다", async () => {
    vi.mocked(ky.get).mockReturnValue(
      mockKyResponse({
        header: successfulHeader,
        queryStringList: [],
        headerList: [],
        formDataList: [],
        requestBody: { name: null, description: null, modelId: null },
        contentTypeList: [],
      }),
    );

    const client = new ApiGatewayClient("token", "kr1", "appkey");
    await expect(client.getResourceParameters("service/id", "resource/id")).resolves.toEqual(
      expect.objectContaining({
        queryStringList: [],
        requestBody: { name: null, description: null, modelId: null },
      }),
    );
    expect(ky.get).toHaveBeenCalledWith(
      expect.stringContaining("/services/service%2Fid/resources/resource%2Fid/parameters"),
      expect.objectContaining({
        headers: { "X-NHN-Authorization": "Bearer token" },
        retry: 0,
        timeout: expect.any(Number),
      }),
    );
  });

  it("isSuccessful=false면 EXIT_API_ERROR", async () => {
    vi.mocked(ky.get).mockReturnValue(
      mockKyResponse({
        header: { isSuccessful: false, resultCode: 4041007, resultMessage: "URL Not Found" },
      }),
    );

    const client = new ApiGatewayClient("token", "kr1", "appkey");
    await expect(client.getResourceParameters("service-1", "resource-1")).rejects.toMatchObject({
      exitCode: EXIT_API_ERROR,
    });
  });
});

describe("ApiGatewayClient.getResourceResponses", () => {
  beforeEach(() => vi.resetAllMocks());

  it("빈 responseList와 contentTypeList를 정상 응답으로 반환한다", async () => {
    vi.mocked(ky.get).mockReturnValue(
      mockKyResponse({
        header: successfulHeader,
        responseList: [],
        contentTypeList: [],
      }),
    );

    const client = new ApiGatewayClient("token", "kr1", "appkey");
    await expect(client.getResourceResponses("service/id", "resource/id")).resolves.toEqual(
      expect.objectContaining({ responseList: [], contentTypeList: [] }),
    );
    expect(ky.get).toHaveBeenCalledWith(
      expect.stringContaining("/services/service%2Fid/resources/resource%2Fid/responses"),
      expect.objectContaining({
        headers: { "X-NHN-Authorization": "Bearer token" },
        retry: 0,
        timeout: expect.any(Number),
      }),
    );
  });

  it("isSuccessful=false면 EXIT_API_ERROR", async () => {
    vi.mocked(ky.get).mockReturnValue(
      mockKyResponse({
        header: { isSuccessful: false, resultCode: 4041007, resultMessage: "URL Not Found" },
      }),
    );

    const client = new ApiGatewayClient("token", "kr1", "appkey");
    await expect(client.getResourceResponses("service-1", "resource-1")).rejects.toMatchObject({
      exitCode: EXIT_API_ERROR,
    });
  });
});

describe("ApiGatewayClient.listStages", () => {
  beforeEach(() => vi.resetAllMocks());

  it("두 페이지를 전수 수집하고 stageName null과 중첩 도메인을 허용한다", async () => {
    vi.mocked(ky.get)
      .mockReturnValueOnce(
        mockKyResponse({
          header: successfulHeader,
          stageList: [stage("stage-1")],
          paging: { limit: 1, page: 1, totalCount: 2 },
        }),
      )
      .mockReturnValueOnce(
        mockKyResponse({
          header: successfulHeader,
          stageList: [stage("stage-2", "production")],
          paging: { limit: 1, page: 2, totalCount: 2 },
        }),
      );

    const client = new ApiGatewayClient("token", "kr1", "appkey");
    const result = await client.listStages("service/id");

    expect(result.map((item) => item.stageId)).toEqual(["stage-1", "stage-2"]);
    expect(result[0]?.stageName).toBeNull();
    expect(ky.get).toHaveBeenCalledTimes(2);
    expect(ky.get).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("/services/service%2Fid/stages"),
      expect.objectContaining({
        headers: { "X-NHN-Authorization": "Bearer token" },
        searchParams: { page: 1, limit: 1000 },
      }),
    );
    expect(ky.get).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({ searchParams: { page: 2, limit: 1000 } }),
    );
  });

  it("isSuccessful=false면 EXIT_API_ERROR", async () => {
    vi.mocked(ky.get).mockReturnValue(
      mockKyResponse({
        header: { isSuccessful: false, resultCode: 403100000, resultMessage: "Permission denied" },
      }),
    );

    const client = new ApiGatewayClient("token", "kr1", "appkey");
    await expect(client.listStages("service-1")).rejects.toMatchObject({
      exitCode: EXIT_API_ERROR,
    });
  });
});

describe("ApiGatewayClient.getStageSwagger", () => {
  beforeEach(() => vi.resetAllMocks());

  it("사용자 정의 객체를 내부 필드 검증 없이 반환한다", async () => {
    const swaggerData = { arbitrary: { nested: true }, list: [1, "two"] };
    vi.mocked(ky.get).mockReturnValue(
      mockKyResponse({ header: successfulHeader, swaggerData }),
    );

    const client = new ApiGatewayClient("token", "kr1", "appkey");
    await expect(client.getStageSwagger("service/id", "stage/id")).resolves.toEqual(swaggerData);
    expect(ky.get).toHaveBeenCalledWith(
      expect.stringContaining("/services/service%2Fid/stages/stage%2Fid/swagger"),
      expect.objectContaining({ headers: { "X-NHN-Authorization": "Bearer token" } }),
    );
  });

  it("isSuccessful=false면 EXIT_API_ERROR", async () => {
    vi.mocked(ky.get).mockReturnValue(
      mockKyResponse({
        header: { isSuccessful: false, resultCode: 4041007, resultMessage: "URL Not Found" },
      }),
    );

    const client = new ApiGatewayClient("token", "kr1", "appkey");
    await expect(client.getStageSwagger("service-1", "stage-1")).rejects.toMatchObject({
      exitCode: EXIT_API_ERROR,
    });
  });
});

describe("ApiGatewayClient.listStageResources", () => {
  beforeEach(() => vi.resetAllMocks());

  it("paging 없이 한 번만 조회하고 nullable stage resource 필드를 허용한다", async () => {
    vi.mocked(ky.get).mockReturnValue(
      mockKyResponse({
        header: successfulHeader,
        stageResourceList: [stageResource("stage-resource-1")],
      }),
    );

    const client = new ApiGatewayClient("token", "kr1", "appkey");
    const result = await client.listStageResources("service/id", "stage/id");

    expect(result[0]).toMatchObject({
      methodType: null,
      methodName: null,
      methodDescription: null,
      customBackendEndpointUrl: null,
    });
    expect(ky.get).toHaveBeenCalledTimes(1);
    expect(ky.get).toHaveBeenCalledWith(
      expect.stringContaining("/services/service%2Fid/stages/stage%2Fid/resources"),
      expect.objectContaining({ headers: { "X-NHN-Authorization": "Bearer token" } }),
    );
    expect(vi.mocked(ky.get).mock.calls[0]?.[1]).not.toHaveProperty("searchParams");
  });

  it("isSuccessful=false면 EXIT_API_ERROR", async () => {
    vi.mocked(ky.get).mockReturnValue(
      mockKyResponse({
        header: { isSuccessful: false, resultCode: 403100000, resultMessage: "Permission denied" },
      }),
    );

    const client = new ApiGatewayClient("token", "kr1", "appkey");
    await expect(client.listStageResources("service-1", "stage-1")).rejects.toMatchObject({
      exitCode: EXIT_API_ERROR,
    });
  });
});

describe("ApiGatewayClient.listDeploys", () => {
  beforeEach(() => vi.resetAllMocks());

  it("두 페이지를 전수 수집하고 rollbackAt null을 허용한다", async () => {
    vi.mocked(ky.get)
      .mockReturnValueOnce(
        mockKyResponse({
          header: successfulHeader,
          stageDeployHistoryList: [deployHistory("deploy-1")],
          paging: { limit: 1, page: 1, totalCount: 2 },
        }),
      )
      .mockReturnValueOnce(
        mockKyResponse({
          header: successfulHeader,
          stageDeployHistoryList: [deployHistory("deploy-2")],
          paging: { limit: 1, page: 2, totalCount: 2 },
        }),
      );

    const client = new ApiGatewayClient("token", "kr1", "appkey");
    const result = await client.listDeploys("service/id", "stage/id");

    expect(result.map((item) => item.deployId)).toEqual(["deploy-1", "deploy-2"]);
    expect(result[0]?.rollbackAt).toBeNull();
    expect(ky.get).toHaveBeenCalledTimes(2);
    expect(ky.get).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/services/service%2Fid/stages/stage%2Fid/deploys"),
      expect.objectContaining({ searchParams: { page: 2, limit: 1000 } }),
    );
  });

  it("isSuccessful=false면 EXIT_API_ERROR", async () => {
    vi.mocked(ky.get).mockReturnValue(
      mockKyResponse({
        header: { isSuccessful: false, resultCode: 403100000, resultMessage: "Permission denied" },
      }),
    );

    const client = new ApiGatewayClient("token", "kr1", "appkey");
    await expect(client.listDeploys("service-1", "stage-1")).rejects.toMatchObject({
      exitCode: EXIT_API_ERROR,
    });
  });
});

describe("ApiGatewayClient.getLatestDeploy", () => {
  beforeEach(() => vi.resetAllMocks());

  it("최신 배포와 중첩 stage resource를 반환한다", async () => {
    const latestStageDeployResult = {
      ...deployHistory("deploy-latest"),
      deployStatus: "SUCCESS",
      stageResourceList: [stageResource("stage-resource-1")],
    };
    vi.mocked(ky.get).mockReturnValue(
      mockKyResponse({ header: successfulHeader, latestStageDeployResult }),
    );

    const client = new ApiGatewayClient("token", "kr1", "appkey");
    await expect(client.getLatestDeploy("service/id", "stage/id")).resolves.toEqual(
      latestStageDeployResult,
    );
    expect(ky.get).toHaveBeenCalledWith(
      expect.stringContaining("/services/service%2Fid/stages/stage%2Fid/deploys/latest"),
      expect.objectContaining({ headers: { "X-NHN-Authorization": "Bearer token" } }),
    );
  });

  it("isSuccessful=false면 EXIT_API_ERROR", async () => {
    vi.mocked(ky.get).mockReturnValue(
      mockKyResponse({
        header: { isSuccessful: false, resultCode: 4041007, resultMessage: "URL Not Found" },
      }),
    );

    const client = new ApiGatewayClient("token", "kr1", "appkey");
    await expect(client.getLatestDeploy("service-1", "stage-1")).rejects.toMatchObject({
      exitCode: EXIT_API_ERROR,
    });
  });
});
