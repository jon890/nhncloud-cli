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

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}
