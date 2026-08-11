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
