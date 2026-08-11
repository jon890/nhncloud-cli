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

export interface StageUpdateBody {
  backendEndpointUrl: string;
  stageDescription?: string;
}

export interface PluginInput {
  pluginType: string;
  pluginConfigJson?: Record<string, unknown>;
  delete?: boolean;
}

export interface PathPluginInput extends PluginInput {
  applyChildPath?: boolean;
}

export interface MethodPluginUpdateBody {
  methodName: string;
  methodDescription?: string;
  methodPluginList: PluginInput[];
}

export const PATH_PLUGIN_TYPES = [
  "CORS",
  "SET_REQUEST_HEADER",
  "SET_RESPONSE_HEADER",
  "ADD_REQUEST_QUERY_PARAMETER",
] as const;

export const METHOD_PLUGIN_TYPES = [
  "HTTP",
  "MOCK",
  "SET_REQUEST_HEADER",
  "SET_RESPONSE_HEADER",
  "ADD_REQUEST_QUERY_PARAMETER",
] as const;

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

/** resource-paths·resource-methods 수정 응답 항목 (ADR-028). */
export interface UpdatedResource {
  resourceId: string;
  path: string;
  methodType?: string | null;
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

/** `isUpdatedResource`는 수정 출력에 필요한 최소 필드만 요구한다. */
export function isUpdatedResource(value: unknown): value is UpdatedResource {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj["resourceId"] === "string" &&
    typeof obj["path"] === "string" &&
    (obj["methodType"] === undefined || isNullableString(obj["methodType"]))
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

export interface StageCustomDomain {
  customDomain: string;
  createdAt: string;
}

export interface StageAliasDomain {
  aliasDomain: string;
  createdAt: string;
}

/** API Gateway stage 목록 응답 항목 (ADR-027 실측 계약). */
export interface Stage {
  stageId: string;
  apigwServiceId: string;
  regionCode: string;
  stageName: string | null;
  stageDescription: string;
  stageUrl: string;
  backendEndpointUrl: string;
  resourceUpdatedAt: string;
  createdAt: string;
  updatedAt: string;
  stageCustomUrl: string;
  stageCustomDomainList: StageCustomDomain[];
  stageAliasDomainList: StageAliasDomain[];
  [key: string]: unknown;
}

/** stage 수정 응답 항목. 조회 응답보다 필드가 적으므로 별도 계약을 둔다. */
export interface UpdatedStage {
  stageId: string;
  stageName: string | null;
  stageUrl: string;
  backendEndpointUrl: string;
  updatedAt: string;
  [key: string]: unknown;
}

export type StageResourcePlugin = Record<string, unknown>;

/** 배포된 stage resource. service resource와 식별자·필드 계약이 다르다. */
export interface StageResource {
  stageResourceId: string;
  path: string;
  methodType: string | null;
  methodName: string | null;
  methodDescription: string | null;
  customBackendEndpointUrl: string | null;
  updatedAt: string;
  stageResourcePluginList: StageResourcePlugin[];
  [key: string]: unknown;
}

/** API Gateway stage 배포 이력. */
export interface DeployHistory {
  deployId: string;
  stageId: string;
  deployedAt: string;
  rollbackAt: string | null;
  deployDescription: string;
  isBase: boolean;
  [key: string]: unknown;
}

/** API Gateway stage 최신 배포 결과. */
export interface LatestDeployResult extends DeployHistory {
  deployStatus: string;
  stageResourceList: StageResource[];
}

export type SwaggerData = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStageCustomDomain(value: unknown): value is StageCustomDomain {
  if (!isRecord(value)) return false;
  return typeof value["customDomain"] === "string" && typeof value["createdAt"] === "string";
}

function isStageAliasDomain(value: unknown): value is StageAliasDomain {
  if (!isRecord(value)) return false;
  return typeof value["aliasDomain"] === "string" && typeof value["createdAt"] === "string";
}

export function isStage(value: unknown): value is Stage {
  if (!isRecord(value)) return false;
  return (
    typeof value["stageId"] === "string" &&
    typeof value["apigwServiceId"] === "string" &&
    typeof value["regionCode"] === "string" &&
    isNullableString(value["stageName"]) &&
    typeof value["stageDescription"] === "string" &&
    typeof value["stageUrl"] === "string" &&
    typeof value["backendEndpointUrl"] === "string" &&
    typeof value["resourceUpdatedAt"] === "string" &&
    typeof value["createdAt"] === "string" &&
    typeof value["updatedAt"] === "string" &&
    typeof value["stageCustomUrl"] === "string" &&
    Array.isArray(value["stageCustomDomainList"]) &&
    value["stageCustomDomainList"].every(isStageCustomDomain) &&
    Array.isArray(value["stageAliasDomainList"]) &&
    value["stageAliasDomainList"].every(isStageAliasDomain)
  );
}

/** `isUpdatedStage`는 수정 성공 뒤 재시도를 유발하지 않도록 출력 필드만 좁힌다. */
export function isUpdatedStage(value: unknown): value is UpdatedStage {
  if (!isRecord(value)) return false;
  return (
    typeof value["stageId"] === "string" &&
    isNullableString(value["stageName"]) &&
    typeof value["stageUrl"] === "string" &&
    typeof value["backendEndpointUrl"] === "string" &&
    typeof value["updatedAt"] === "string"
  );
}

function isStageResourcePlugin(value: unknown): value is StageResourcePlugin {
  return isRecord(value);
}

export function isStageResource(value: unknown): value is StageResource {
  if (!isRecord(value)) return false;
  return (
    typeof value["stageResourceId"] === "string" &&
    typeof value["path"] === "string" &&
    isNullableString(value["methodType"]) &&
    isNullableString(value["methodName"]) &&
    isNullableString(value["methodDescription"]) &&
    isNullableString(value["customBackendEndpointUrl"]) &&
    typeof value["updatedAt"] === "string" &&
    Array.isArray(value["stageResourcePluginList"]) &&
    value["stageResourcePluginList"].every(isStageResourcePlugin)
  );
}

export function isDeployHistory(value: unknown): value is DeployHistory {
  if (!isRecord(value)) return false;
  return (
    typeof value["deployId"] === "string" &&
    typeof value["stageId"] === "string" &&
    typeof value["deployedAt"] === "string" &&
    isNullableString(value["rollbackAt"]) &&
    typeof value["deployDescription"] === "string" &&
    typeof value["isBase"] === "boolean"
  );
}

export function isLatestDeployResult(value: unknown): value is LatestDeployResult {
  if (!isDeployHistory(value)) return false;
  return (
    typeof value["deployStatus"] === "string" &&
    Array.isArray(value["stageResourceList"]) &&
    value["stageResourceList"].every(isStageResource)
  );
}

/** Swagger 본문은 사용자 정의 객체이므로 내부 키를 해석하지 않는다. */
export function isSwaggerData(value: unknown): value is SwaggerData {
  return isRecord(value);
}
