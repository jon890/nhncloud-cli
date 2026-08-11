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
  /** 실제 응답은 `labels.kube_tag` 에 담긴다. 최상위는 구형/일부 응답 호환용 optional (이슈 #47). */
  kube_tag?: string;
  labels?: Record<string, unknown>;
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

export interface NksClusterIpAcl {
  cluster_uuid: string;
  enable: boolean | "true" | "false";
  action?: string;
  ipacl_targets?: unknown[];
  [key: string]: unknown;
}

export interface NksNodeGroupAutoscale {
  ca_enable: boolean | "true" | "false";
  clusterautoscale: string;
  [key: string]: unknown;
}

export interface NksUuidResponse {
  uuid: string;
  [key: string]: unknown;
}

/**
 * 클러스터 작업 이력(event). `NksNamedResource` 와 별개 스키마다.
 *
 * `name`·`status` 대신 `resource_name`·`state` 를 쓰고, `id` 가 **정수**다.
 * `NksNamedResource` 는 `id` 가 문자열일 것을 요구하므로 이벤트에는 쓸 수 없다 (이슈 #79).
 * 공식 문서와 실제 응답으로 확인한 필드다 — `contents` 는 성공한 작업에서 null 로 온다.
 */
export interface NksClusterEvent {
  id: number;
  uuid: string;
  project_id?: string;
  cluster_uuid?: string;
  cluster_name?: string;
  resource_uuid?: string;
  resource_name?: string;
  resource_type?: string;
  type?: string;
  state?: string;
  contents?: string | null;
  details?: string | null;
  created_at?: string;
  updated_at?: string;
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
    (typeof obj["node_count"] === "number" || typeof obj["node_count"] === "string")
  );
}

/**
 * cluster 요약에서 kube_tag 를 꺼낸다.
 * 실제 `GET /v1/clusters` 응답은 `labels.kube_tag` 에 두므로 그쪽을 우선하고,
 * 구형/일부 응답 호환을 위해 최상위 `kube_tag` 로 fallback 한다 (이슈 #47).
 */
export function nksClusterKubeTag(cluster: NksClusterSummary): string {
  const fromLabels = cluster.labels?.["kube_tag"];
  if (typeof fromLabels === "string") return fromLabels;
  if (typeof cluster.kube_tag === "string") return cluster.kube_tag;
  return "-";
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
  if ("header" in val || "body" in val) return false;
  const uuid = val["uuid"];
  const id = val["id"];
  const name = val["name"];
  const status = val["status"];
  const hasKnownResourceField =
    typeof uuid === "string" ||
    typeof id === "string" ||
    typeof name === "string" ||
    typeof status === "string";
  return (
    hasKnownResourceField &&
    (uuid === undefined || typeof uuid === "string") &&
    (id === undefined || typeof id === "string") &&
    (name === undefined || typeof name === "string") &&
    (status === undefined || typeof status === "string")
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

export function isNksClusterIpAcl(val: unknown): val is NksClusterIpAcl {
  if (!isPlainObject(val) || "header" in val || "body" in val) return false;
  if (typeof val["cluster_uuid"] !== "string" || !isBooleanLike(val["enable"])) return false;

  const isEnabled = val["enable"] === true || val["enable"] === "true";
  if (!isEnabled) return true;

  return typeof val["action"] === "string" && Array.isArray(val["ipacl_targets"]);
}

export function isNksNodeGroupAutoscale(val: unknown): val is NksNodeGroupAutoscale {
  return (
    isPlainObject(val) &&
    !("header" in val) &&
    !("body" in val) &&
    isBooleanLike(val["ca_enable"]) &&
    typeof val["clusterautoscale"] === "string"
  );
}

function isBooleanLike(val: unknown): val is boolean | "true" | "false" {
  return typeof val === "boolean" || val === "true" || val === "false";
}

export function isNksUuidResponse(val: unknown): val is NksUuidResponse {
  return isPlainObject(val) && typeof val["uuid"] === "string";
}

/**
 * 이벤트 식별자 두 개만 필수로 본다.
 * 나머지 필드는 선택적으로 두어 서버가 필드를 늘려도 조회가 깨지지 않게 한다.
 */
export function isNksClusterEvent(val: unknown): val is NksClusterEvent {
  if (!isPlainObject(val)) return false;
  if ("header" in val || "body" in val) return false;
  return typeof val["id"] === "number" && typeof val["uuid"] === "string";
}
