/** API Gateway service 목록·단건 응답 항목 (ADR-027 실측 계약). */
export interface ApiGatewayService {
  apigwServiceId: string;
  apigwServiceAlias: string;
  apigwServiceName: string;
  apigwServiceDescription: string;
  apigwDomain: string;
  appKey: string;
  regionCode: string;
  serverGroupId: string;
  dedicatedId: string | null;
  createdAt: string;
  updatedAt: string;
  apigwServiceTypeCode: string;
  [key: string]: unknown;
}

/** `paging` 응답 객체. services·stages·deploys 에만 존재한다. */
export interface ApiGatewayPaging {
  limit: number;
  page: number;
  totalCount: number;
}

/** API Gateway service 응답 타입 가드. */
export function isApiGatewayService(value: unknown): value is ApiGatewayService {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj["apigwServiceId"] === "string" &&
    typeof obj["apigwServiceAlias"] === "string" &&
    typeof obj["apigwServiceName"] === "string" &&
    typeof obj["apigwServiceDescription"] === "string" &&
    typeof obj["apigwDomain"] === "string" &&
    typeof obj["appKey"] === "string" &&
    typeof obj["regionCode"] === "string" &&
    typeof obj["serverGroupId"] === "string" &&
    (typeof obj["dedicatedId"] === "string" || obj["dedicatedId"] === null) &&
    typeof obj["createdAt"] === "string" &&
    typeof obj["updatedAt"] === "string" &&
    typeof obj["apigwServiceTypeCode"] === "string"
  );
}

/** API Gateway paging 응답 타입 가드. */
export function isApiGatewayPaging(value: unknown): value is ApiGatewayPaging {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj["limit"] === "number" &&
    Number.isInteger(obj["limit"]) &&
    obj["limit"] > 0 &&
    typeof obj["page"] === "number" &&
    Number.isInteger(obj["page"]) &&
    obj["page"] > 0 &&
    typeof obj["totalCount"] === "number" &&
    Number.isInteger(obj["totalCount"]) &&
    obj["totalCount"] >= 0
  );
}

export interface ApiGatewayServiceListParams {
  page?: number;
  limit?: number;
}

/** API Gateway resource 목록 응답 항목 (ADR-027 실측 계약). */
export interface Resource {
  resourceId: string;
  apigwServiceId: string;
  parentPath: string | null;
  path: string;
  methodType: string | null;
  methodName: string | null;
  methodDescription: string | null;
  createdAt: string;
  updatedAt: string;
  resourcePluginList: unknown[];
  [key: string]: unknown;
}

export interface ResourceRequestBody {
  name: string | null;
  description: string | null;
  modelId: string | null;
  [key: string]: unknown;
}

/** API Gateway resource 요청 parameter 응답. */
export interface ResourceParameters {
  queryStringList: unknown[];
  headerList: unknown[];
  formDataList: unknown[];
  requestBody: ResourceRequestBody;
  contentTypeList: unknown[];
}

/** API Gateway resource 응답 정의 목록. */
export interface ResourceResponses {
  responseList: unknown[];
  contentTypeList: unknown[];
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function isResourceRequestBody(value: unknown): value is ResourceRequestBody {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    isNullableString(obj["name"]) &&
    isNullableString(obj["description"]) &&
    isNullableString(obj["modelId"])
  );
}

/** API Gateway resource 응답 타입 가드. */
export function isResource(value: unknown): value is Resource {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj["resourceId"] === "string" &&
    typeof obj["apigwServiceId"] === "string" &&
    isNullableString(obj["parentPath"]) &&
    typeof obj["path"] === "string" &&
    isNullableString(obj["methodType"]) &&
    isNullableString(obj["methodName"]) &&
    isNullableString(obj["methodDescription"]) &&
    typeof obj["createdAt"] === "string" &&
    typeof obj["updatedAt"] === "string" &&
    Array.isArray(obj["resourcePluginList"])
  );
}

/** API Gateway resource parameter 응답 타입 가드. */
export function isResourceParameters(value: unknown): value is ResourceParameters {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    Array.isArray(obj["queryStringList"]) &&
    Array.isArray(obj["headerList"]) &&
    Array.isArray(obj["formDataList"]) &&
    isResourceRequestBody(obj["requestBody"]) &&
    Array.isArray(obj["contentTypeList"])
  );
}

/** API Gateway resource response 응답 타입 가드. */
export function isResourceResponses(value: unknown): value is ResourceResponses {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return Array.isArray(obj["responseList"]) && Array.isArray(obj["contentTypeList"]);
}
