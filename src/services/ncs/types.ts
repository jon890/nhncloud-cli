/**
 * NCS(NHN Container Service) template 타입 (ADR-020).
 * 공식 docs 예제 JSON(https://docs.nhncloud.com/ko/Container/NCS/ko/public-api/) 실측 확정 필드.
 * 수치 필드(versionCount·workloadCount)는 서비스 관례상 string 혼재 가능성이 있어 string|number 허용(6-2 회피).
 */
export interface NcsTemplateSummary {
  id: string;
  name: string;
  version?: string;
  createdAt?: string;
  description?: string | null;
  versionDescription?: string | null;
  versionCount?: number | string;
  workloadCount?: number | string;
  [key: string]: unknown;
}

/**
 * NcsTemplateSummary 타입 가드.
 * 핵심 식별 필드(id·name)만 string 요구 — 나머지는 optional/nullable 허용(5-6 회피).
 */
export function isNcsTemplateSummary(val: unknown): val is NcsTemplateSummary {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return typeof obj["id"] === "string" && typeof obj["name"] === "string";
}

/** template list query 옵션 — page/size 는 API 기본 page size(10) 를 그대로 노출한다. */
export interface NcsTemplateListParams {
  page?: number;
  size?: number;
  disableContainers?: boolean;
}
