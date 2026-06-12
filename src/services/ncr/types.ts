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

/**
 * Harbor REST API — repository (이미지) 타입 (ADR-017).
 * name 은 "{project}/{repo}" 형태. 수치 메타(artifact_count·pull_count)는 string|number 허용(6-2 회피).
 */
export interface Repository {
  name: string;
  artifact_count?: number | string;
  pull_count?: number | string;
  update_time?: string | null;
  [key: string]: unknown;
}

/**
 * Repository 타입 가드.
 * name 만 string 요구 — 나머지는 optional/nullable 허용(5-6 회피).
 */
export function isRepository(val: unknown): val is Repository {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return typeof obj["name"] === "string";
}

/**
 * Harbor REST API — artifact 의 태그 타입 (ADR-017).
 */
export interface ArtifactTag {
  name: string;
  push_time?: string | null;
  [key: string]: unknown;
}

/**
 * Harbor REST API — artifact 타입 (ADR-017).
 * tags 는 null 허용 — dangling artifact(태그 없는 artifact)는 tags=null(5-6 회피).
 * 수치 필드(size)는 string|number 허용(6-2 회피).
 */
export interface Artifact {
  digest?: string;
  size?: number | string;
  push_time?: string | null;
  tags?: ArtifactTag[] | null;
  [key: string]: unknown;
}

/**
 * Artifact 타입 가드.
 * Harbor artifact 는 필수 식별 필드(digest)도 optional — object·non-null 이면 통과.
 */
export function isArtifact(val: unknown): val is Artifact {
  return typeof val === "object" && val !== null;
}
