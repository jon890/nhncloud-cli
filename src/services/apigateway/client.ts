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
  isResource,
  isResourceParameters,
  isResourceResponses,
  type ApiGatewayService,
  type ApiGatewayServiceListParams,
  type Resource,
  type ResourceParameters,
  type ResourceResponses,
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
}
