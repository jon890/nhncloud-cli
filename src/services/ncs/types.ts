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

/**
 * NcsTemplateDetail — `template get` 단건 조회 응답 (named 필드 `template`).
 * Summary 와 동일 핵심 필드 + containers(컨테이너 spec 배열, 정확한 필드는 실측 미확정이라 unknown[]).
 */
export interface NcsTemplateDetail extends NcsTemplateSummary {
  containers?: unknown[];
}

/** NcsTemplateDetail 타입 가드 — Summary 와 동일 필수 필드(id·name)만 검사. */
export function isNcsTemplateDetail(val: unknown): val is NcsTemplateDetail {
  return isNcsTemplateSummary(val);
}

/**
 * NcsTemplateVersionSummary — `template version list` 목록 항목.
 * version 은 숫자형 문자열("1")뿐 아니라 라벨형("second")도 관측되어 string 으로 둔다.
 */
export interface NcsTemplateVersionSummary {
  id: string;
  version: string;
  description?: string | null;
  createdAt?: string;
  workloadCount?: number | string;
  [key: string]: unknown;
}

/** NcsTemplateVersionSummary 타입 가드 — 핵심 식별 필드(id·version)만 string 요구. */
export function isNcsTemplateVersionSummary(val: unknown): val is NcsTemplateVersionSummary {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return typeof obj["id"] === "string" && typeof obj["version"] === "string";
}

/** template version list query 옵션. */
export interface NcsTemplateVersionListParams {
  q?: string;
  sort?: string;
  page?: number;
  size?: number;
}

/**
 * NcsTemplateVersionDetail — `template version get` 단건 조회 응답 (named 필드 `version`).
 * Summary 와 동일 핵심 필드 + containers(컨테이너 spec, 정확한 필드는 실측 미확정이라 unknown[]).
 */
export interface NcsTemplateVersionDetail extends NcsTemplateVersionSummary {
  containers?: unknown[];
}

/** NcsTemplateVersionDetail 타입 가드 — Summary 와 동일 필수 필드(id·version)만 검사. */
export function isNcsTemplateVersionDetail(val: unknown): val is NcsTemplateVersionDetail {
  return isNcsTemplateVersionSummary(val);
}
