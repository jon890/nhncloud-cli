import ky from "ky";
import { apigatewayHost } from "../../api/endpoints.js";
import { unwrapHeader, type NhnEnvelope } from "../../api/envelope.js";
import { toNhnCloudCliError } from "../../api/httpError.js";
import { DEFAULT_TIMEOUT_MS } from "../../api/timeout.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_API_ERROR } from "../../utils/exit-codes.js";
import {
  isApiGatewayPaging,
  isApiGatewayService,
  isDeployHistory,
  isLatestDeployResult,
  isResource,
  isResourceParameters,
  isResourceResponses,
  isStage,
  isStageResource,
  isSwaggerData,
  type ApiGatewayService,
  type ApiGatewayServiceListParams,
  type DeployHistory,
  type LatestDeployResult,
  type Resource,
  type ResourceParameters,
  type ResourceResponses,
  type Stage,
  type StageResource,
  type SwaggerData,
} from "./types.js";

interface ApiGatewayServiceListResponse extends NhnEnvelope<unknown> {
  apigwServiceList?: unknown;
  paging?: unknown;
}

interface ApiGatewayServiceGetResponse extends NhnEnvelope<unknown> {
  apigwService?: unknown;
}

interface ResourceListResponse extends NhnEnvelope<unknown> {
  resourceList?: unknown;
}

interface ResourceParametersResponse extends NhnEnvelope<unknown> {
  queryStringList?: unknown;
  headerList?: unknown;
  formDataList?: unknown;
  requestBody?: unknown;
  contentTypeList?: unknown;
}

interface ResourceResponsesResponse extends NhnEnvelope<unknown> {
  responseList?: unknown;
  contentTypeList?: unknown;
}

interface StageListResponse extends NhnEnvelope<unknown> {
  stageList?: unknown;
  paging?: unknown;
}

interface StageSwaggerResponse extends NhnEnvelope<unknown> {
  swaggerData?: unknown;
}

interface StageResourceListResponse extends NhnEnvelope<unknown> {
  stageResourceList?: unknown;
}

interface DeployHistoryListResponse extends NhnEnvelope<unknown> {
  stageDeployHistoryList?: unknown;
  paging?: unknown;
}

interface LatestDeployResponse extends NhnEnvelope<unknown> {
  latestStageDeployResult?: unknown;
}

/** API Gateway 조회 API 클라이언트 (ADR-027). */
export class ApiGatewayClient {
  private readonly accessToken: string;
  private readonly baseUrl: string;

  constructor(accessToken: string, region: string, appKey: string) {
    this.accessToken = accessToken;
    this.baseUrl = `https://${apigatewayHost(region)}/v2.0/appkeys/${encodeURIComponent(appKey)}`;
  }

  private authHeaders(): Record<string, string> {
    return { "X-NHN-Authorization": `Bearer ${this.accessToken}` };
  }

  /** paging.totalCount 를 기준으로 API Gateway service 전체를 수집한다. */
  async listServices(
    params: ApiGatewayServiceListParams = {},
  ): Promise<ApiGatewayService[]> {
    const services: ApiGatewayService[] = [];
    const limit = params.limit ?? 1000;
    let page = params.page ?? 1;

    try {
      while (true) {
        const response = await ky
          .get(`${this.baseUrl}/services`, {
            headers: this.authHeaders(),
            searchParams: { page, limit },
            retry: 0,
            timeout: DEFAULT_TIMEOUT_MS,
          })
          .json<ApiGatewayServiceListResponse>();

        unwrapHeader(response);
        if (
          !Array.isArray(response.apigwServiceList) ||
          !response.apigwServiceList.every(isApiGatewayService)
        ) {
          throw new NhnCloudCliError(
            "API Gateway 응답 형식 오류: apigwServiceList 가 올바른 배열이 아닙니다.",
            EXIT_API_ERROR,
          );
        }
        if (!isApiGatewayPaging(response.paging)) {
          throw new NhnCloudCliError(
            "API Gateway 응답 형식 오류: paging 필드가 없거나 올바르지 않습니다.",
            EXIT_API_ERROR,
          );
        }

        services.push(...response.apigwServiceList);
        if (response.paging.page * response.paging.limit >= response.paging.totalCount) {
          break;
        }
        if (response.apigwServiceList.length === 0) {
          throw new NhnCloudCliError(
            "API Gateway 응답 형식 오류: paging.totalCount 전에 빈 service 페이지가 반환되었습니다.",
            EXIT_API_ERROR,
          );
        }
        page = response.paging.page + 1;
      }

      return services;
    } catch (err) {
      if (err instanceof NhnCloudCliError) throw err;
      throw toNhnCloudCliError(err);
    }
  }

  /** API Gateway service 한 건을 조회한다. */
  async getService(apigwServiceId: string): Promise<ApiGatewayService> {
    try {
      const response = await ky
        .get(`${this.baseUrl}/services/${encodeURIComponent(apigwServiceId)}`, {
          headers: this.authHeaders(),
          retry: 0,
          timeout: DEFAULT_TIMEOUT_MS,
        })
        .json<ApiGatewayServiceGetResponse>();

      unwrapHeader(response);
      if (!isApiGatewayService(response.apigwService)) {
        throw new NhnCloudCliError(
          "API Gateway 응답 형식 오류: apigwService 필드가 없거나 올바르지 않습니다.",
          EXIT_API_ERROR,
        );
      }
      return response.apigwService;
    } catch (err) {
      if (err instanceof NhnCloudCliError) throw err;
      throw toNhnCloudCliError(err);
    }
  }

  /** paging 없이 API Gateway resource 전체를 한 번에 조회한다. */
  async listResources(apigwServiceId: string): Promise<Resource[]> {
    try {
      const response = await ky
        .get(
          `${this.baseUrl}/services/${encodeURIComponent(apigwServiceId)}/resources`,
          {
            headers: this.authHeaders(),
            retry: 0,
            timeout: DEFAULT_TIMEOUT_MS,
          },
        )
        .json<ResourceListResponse>();

      unwrapHeader(response);
      if (!Array.isArray(response.resourceList) || !response.resourceList.every(isResource)) {
        throw new NhnCloudCliError(
          "API Gateway 응답 형식 오류: resourceList 가 올바른 배열이 아닙니다.",
          EXIT_API_ERROR,
        );
      }
      return response.resourceList;
    } catch (err) {
      if (err instanceof NhnCloudCliError) throw err;
      throw toNhnCloudCliError(err);
    }
  }

  /** API Gateway resource 요청 parameter를 조회한다. */
  async getResourceParameters(
    apigwServiceId: string,
    resourceId: string,
  ): Promise<ResourceParameters> {
    try {
      const response = await ky
        .get(
          `${this.baseUrl}/services/${encodeURIComponent(apigwServiceId)}/resources/${encodeURIComponent(resourceId)}/parameters`,
          {
            headers: this.authHeaders(),
            retry: 0,
            timeout: DEFAULT_TIMEOUT_MS,
          },
        )
        .json<ResourceParametersResponse>();

      unwrapHeader(response);
      if (!isResourceParameters(response)) {
        throw new NhnCloudCliError(
          "API Gateway 응답 형식 오류: resource parameter 필드가 없거나 올바르지 않습니다.",
          EXIT_API_ERROR,
        );
      }
      return response;
    } catch (err) {
      if (err instanceof NhnCloudCliError) throw err;
      throw toNhnCloudCliError(err);
    }
  }

  /** API Gateway resource 응답 정의를 조회한다. */
  async getResourceResponses(
    apigwServiceId: string,
    resourceId: string,
  ): Promise<ResourceResponses> {
    try {
      const response = await ky
        .get(
          `${this.baseUrl}/services/${encodeURIComponent(apigwServiceId)}/resources/${encodeURIComponent(resourceId)}/responses`,
          {
            headers: this.authHeaders(),
            retry: 0,
            timeout: DEFAULT_TIMEOUT_MS,
          },
        )
        .json<ResourceResponsesResponse>();

      unwrapHeader(response);
      if (!isResourceResponses(response)) {
        throw new NhnCloudCliError(
          "API Gateway 응답 형식 오류: resource response 필드가 없거나 올바르지 않습니다.",
          EXIT_API_ERROR,
        );
      }
      return response;
    } catch (err) {
      if (err instanceof NhnCloudCliError) throw err;
      throw toNhnCloudCliError(err);
    }
  }

  /** paging.totalCount 를 기준으로 API Gateway stage 전체를 수집한다. */
  async listStages(apigwServiceId: string): Promise<Stage[]> {
    // 응답 paging의 page·limit·totalCount를 따라 마지막 페이지까지 순회한다.
    const stages: Stage[] = [];
    const limit = 1000;
    let page = 1;

    try {
      while (true) {
        const response = await ky
          .get(
            `${this.baseUrl}/services/${encodeURIComponent(apigwServiceId)}/stages`,
            {
              headers: this.authHeaders(),
              searchParams: { page, limit },
              retry: 0,
              timeout: DEFAULT_TIMEOUT_MS,
            },
          )
          .json<StageListResponse>();

        unwrapHeader(response);
        if (!Array.isArray(response.stageList) || !response.stageList.every(isStage)) {
          throw new NhnCloudCliError(
            "API Gateway 응답 형식 오류: stageList 가 올바른 배열이 아닙니다.",
            EXIT_API_ERROR,
          );
        }
        if (!isApiGatewayPaging(response.paging)) {
          throw new NhnCloudCliError(
            "API Gateway 응답 형식 오류: paging 필드가 없거나 올바르지 않습니다.",
            EXIT_API_ERROR,
          );
        }

        stages.push(...response.stageList);
        if (response.paging.page * response.paging.limit >= response.paging.totalCount) {
          break;
        }
        if (response.stageList.length === 0) {
          throw new NhnCloudCliError(
            "API Gateway 응답 형식 오류: paging.totalCount 전에 빈 stage 페이지가 반환되었습니다.",
            EXIT_API_ERROR,
          );
        }
        page = response.paging.page + 1;
      }

      return stages;
    } catch (err) {
      if (err instanceof NhnCloudCliError) throw err;
      throw toNhnCloudCliError(err);
    }
  }

  /** 사용자 정의 Swagger 객체를 내부 해석 없이 반환한다. */
  async getStageSwagger(apigwServiceId: string, stageId: string): Promise<SwaggerData> {
    try {
      const response = await ky
        .get(
          `${this.baseUrl}/services/${encodeURIComponent(apigwServiceId)}/stages/${encodeURIComponent(stageId)}/swagger`,
          {
            headers: this.authHeaders(),
            retry: 0,
            timeout: DEFAULT_TIMEOUT_MS,
          },
        )
        .json<StageSwaggerResponse>();

      unwrapHeader(response);
      if (!isSwaggerData(response.swaggerData)) {
        throw new NhnCloudCliError(
          "API Gateway 응답 형식 오류: swaggerData 필드가 없거나 객체가 아닙니다.",
          EXIT_API_ERROR,
        );
      }
      return response.swaggerData;
    } catch (err) {
      if (err instanceof NhnCloudCliError) throw err;
      throw toNhnCloudCliError(err);
    }
  }

  /** paging 없이 배포된 API Gateway stage resource 전체를 한 번에 조회한다. */
  async listStageResources(
    apigwServiceId: string,
    stageId: string,
  ): Promise<StageResource[]> {
    try {
      const response = await ky
        .get(
          `${this.baseUrl}/services/${encodeURIComponent(apigwServiceId)}/stages/${encodeURIComponent(stageId)}/resources`,
          {
            headers: this.authHeaders(),
            retry: 0,
            timeout: DEFAULT_TIMEOUT_MS,
          },
        )
        .json<StageResourceListResponse>();

      unwrapHeader(response);
      if (
        !Array.isArray(response.stageResourceList) ||
        !response.stageResourceList.every(isStageResource)
      ) {
        throw new NhnCloudCliError(
          "API Gateway 응답 형식 오류: stageResourceList 가 올바른 배열이 아닙니다.",
          EXIT_API_ERROR,
        );
      }
      return response.stageResourceList;
    } catch (err) {
      if (err instanceof NhnCloudCliError) throw err;
      throw toNhnCloudCliError(err);
    }
  }

  /** paging.totalCount 를 기준으로 API Gateway stage 배포 이력 전체를 수집한다. */
  async listDeploys(apigwServiceId: string, stageId: string): Promise<DeployHistory[]> {
    // 응답 paging의 page·limit·totalCount를 따라 마지막 페이지까지 순회한다.
    const deploys: DeployHistory[] = [];
    const limit = 1000;
    let page = 1;

    try {
      while (true) {
        const response = await ky
          .get(
            `${this.baseUrl}/services/${encodeURIComponent(apigwServiceId)}/stages/${encodeURIComponent(stageId)}/deploys`,
            {
              headers: this.authHeaders(),
              searchParams: { page, limit },
              retry: 0,
              timeout: DEFAULT_TIMEOUT_MS,
            },
          )
          .json<DeployHistoryListResponse>();

        unwrapHeader(response);
        if (
          !Array.isArray(response.stageDeployHistoryList) ||
          !response.stageDeployHistoryList.every(isDeployHistory)
        ) {
          throw new NhnCloudCliError(
            "API Gateway 응답 형식 오류: stageDeployHistoryList 가 올바른 배열이 아닙니다.",
            EXIT_API_ERROR,
          );
        }
        if (!isApiGatewayPaging(response.paging)) {
          throw new NhnCloudCliError(
            "API Gateway 응답 형식 오류: paging 필드가 없거나 올바르지 않습니다.",
            EXIT_API_ERROR,
          );
        }

        deploys.push(...response.stageDeployHistoryList);
        if (response.paging.page * response.paging.limit >= response.paging.totalCount) {
          break;
        }
        if (response.stageDeployHistoryList.length === 0) {
          throw new NhnCloudCliError(
            "API Gateway 응답 형식 오류: paging.totalCount 전에 빈 deploy 페이지가 반환되었습니다.",
            EXIT_API_ERROR,
          );
        }
        page = response.paging.page + 1;
      }

      return deploys;
    } catch (err) {
      if (err instanceof NhnCloudCliError) throw err;
      throw toNhnCloudCliError(err);
    }
  }

  /** API Gateway stage 최신 배포 결과를 조회한다. */
  async getLatestDeploy(
    apigwServiceId: string,
    stageId: string,
  ): Promise<LatestDeployResult> {
    try {
      const response = await ky
        .get(
          `${this.baseUrl}/services/${encodeURIComponent(apigwServiceId)}/stages/${encodeURIComponent(stageId)}/deploys/latest`,
          {
            headers: this.authHeaders(),
            retry: 0,
            timeout: DEFAULT_TIMEOUT_MS,
          },
        )
        .json<LatestDeployResponse>();

      unwrapHeader(response);
      if (!isLatestDeployResult(response.latestStageDeployResult)) {
        throw new NhnCloudCliError(
          "API Gateway 응답 형식 오류: latestStageDeployResult 필드가 없거나 올바르지 않습니다.",
          EXIT_API_ERROR,
        );
      }
      return response.latestStageDeployResult;
    } catch (err) {
      if (err instanceof NhnCloudCliError) throw err;
      throw toNhnCloudCliError(err);
    }
  }
}
