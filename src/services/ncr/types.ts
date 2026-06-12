/**
 * NCR Management API 타입 (ADR-016).
 * Harbor 파생 snake_case 필드. 수치 필드(repo_count 등)는 string|number 허용(6-2 회피).
 * uri/private_uri 는 null 허용(5-6 회피 — Harbor 응답에서 nullable 가능).
 */
export interface Registry {
  name: string;
  project_id?: number | string;
  repo_count?: number | string;
  uri?: string | null;
  private_uri?: string | null;
  [key: string]: unknown;
}

/**
 * Registry 타입 가드.
 * 핵심 식별 필드(name)만 string 요구 — 나머지는 optional/nullable 허용(5-6 회피).
 */
export function isRegistry(val: unknown): val is Registry {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return typeof obj["name"] === "string";
}

export interface RegistryListParams {
  appKey: string;
  region: string;
}
