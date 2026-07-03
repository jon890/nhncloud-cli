/**
 * NKS 클러스터 요약 — `GET /v1/clusters`.
 * Phase 1 table 출력 필드만 필수 검증하고, 나머지 응답 필드는 --json 에서 보존한다.
 */
export interface NksClusterSummary {
  uuid: string;
  name: string;
  status: string;
  health_status: string;
  node_count: number | string;
  kube_tag: string;
  [key: string]: unknown;
}

/**
 * NKS 지원 정보 — `GET /v1/supports`.
 * supported_k8s / supported_event_type 은 공식 응답의 raw 객체를 보존한다.
 */
export interface NksSupports {
  supported_k8s: Record<string, unknown>;
  supported_event_type: Record<string, unknown>;
  [key: string]: unknown;
}

export interface NksNamedResource {
  uuid?: string;
  id?: string;
  name?: string;
  status?: string;
  [key: string]: unknown;
}

export interface NksNodeGroupSummary extends NksNamedResource {
  uuid: string;
  name: string;
  status: string;
}

export interface NksAddonType extends NksNamedResource {
  name: string;
}

export interface NksAddon extends NksNamedResource {
  name: string;
  version?: string;
}

export function isNksClusterSummary(val: unknown): val is NksClusterSummary {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj["uuid"] === "string" &&
    typeof obj["name"] === "string" &&
    typeof obj["status"] === "string" &&
    typeof obj["health_status"] === "string" &&
    (typeof obj["node_count"] === "number" || typeof obj["node_count"] === "string") &&
    typeof obj["kube_tag"] === "string"
  );
}

export function isNksSupports(val: unknown): val is NksSupports {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return isPlainObject(obj["supported_k8s"]) && isPlainObject(obj["supported_event_type"]);
}

export function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

export function isNksNamedResource(val: unknown): val is NksNamedResource {
  if (!isPlainObject(val)) return false;
  const uuid = val["uuid"];
  const id = val["id"];
  const name = val["name"];
  return (
    (uuid === undefined || typeof uuid === "string") &&
    (id === undefined || typeof id === "string") &&
    (name === undefined || typeof name === "string")
  );
}

export function isNksNodeGroupSummary(val: unknown): val is NksNodeGroupSummary {
  if (!isPlainObject(val)) return false;
  return (
    typeof val["uuid"] === "string" &&
    typeof val["name"] === "string" &&
    typeof val["status"] === "string"
  );
}

export function isNksAddonType(val: unknown): val is NksAddonType {
  return isPlainObject(val) && typeof val["name"] === "string";
}

export function isNksAddon(val: unknown): val is NksAddon {
  return isPlainObject(val) && typeof val["name"] === "string";
}
