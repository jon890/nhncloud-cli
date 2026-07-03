import ky from "ky";
import { toNhnCloudCliError } from "../../api/httpError.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_API_ERROR } from "../../utils/exit-codes.js";
import {
  isNksAddon,
  isNksAddonType,
  isNksClusterSummary,
  isNksNamedResource,
  isNksNodeGroupSummary,
  isNksSupports,
  isNksUuidResponse,
  type NksAddon,
  type NksAddonType,
  type NksClusterSummary,
  type NksNamedResource,
  type NksNodeGroupSummary,
  type NksSupports,
  type NksUuidResponse,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 30_000;

function isClustersResponse(val: unknown): val is { clusters: NksClusterSummary[] } {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return Array.isArray(obj["clusters"]) && obj["clusters"].every(isNksClusterSummary);
}

function isNamedResourceResponse(key: string, val: unknown): val is Record<string, NksNamedResource> {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return isNksNamedResource(obj[key]);
}

function isNamedResourceArrayResponse(key: string, val: unknown): val is Record<string, NksNamedResource[]> {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return Array.isArray(obj[key]) && obj[key].every(isNksNamedResource);
}

function isNodeGroupsResponse(val: unknown): val is { nodegroups: NksNodeGroupSummary[] } {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return Array.isArray(obj["nodegroups"]) && obj["nodegroups"].every(isNksNodeGroupSummary);
}

function isNodeGroupResponse(val: unknown): val is { nodegroup: NksNodeGroupSummary } {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return isNksNodeGroupSummary(obj["nodegroup"]);
}

function isAddonTypesResponse(val: unknown): val is { addon_types: NksAddonType[] } {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return Array.isArray(obj["addon_types"]) && obj["addon_types"].every(isNksAddonType);
}

function isAddonTypeResponse(val: unknown): val is { addon_type: NksAddonType } {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return isNksAddonType(obj["addon_type"]);
}

function isAddonsResponse(val: unknown): val is { addons: NksAddon[] } {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return Array.isArray(obj["addons"]) && obj["addons"].every(isNksAddon);
}

function isAddonResponse(val: unknown): val is { addon: NksAddon } {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return isNksAddon(obj["addon"]);
}

export class NksClient {
  private readonly tokenId: string;
  private readonly nksEndpoint: string;

  constructor(tokenId: string, nksEndpoint: string) {
    this.tokenId = tokenId;
    this.nksEndpoint = nksEndpoint;
  }

  private authHeaders(): Record<string, string> {
    return {
      "X-Auth-Token": this.tokenId,
      "OpenStack-API-Version": "container-infra latest",
    };
  }

  /** NKS 지원 Kubernetes 버전과 event type 을 조회한다 (GET /supports). */
  async supports(): Promise<NksSupports> {
    const url = `${this.nksEndpoint}/supports`;
    try {
      const raw = await ky
        .get(url, {
          headers: this.authHeaders(),
          retry: 0,
          timeout: DEFAULT_TIMEOUT_MS,
        })
        .json();

      if (!isNksSupports(raw)) {
        throw new NhnCloudCliError(
          "nks supports 응답 형식이 올바르지 않습니다 — supported_k8s / supported_event_type 객체가 없습니다.",
          EXIT_API_ERROR,
        );
      }
      return raw;
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  /** NKS 클러스터 목록을 조회한다 (GET /clusters). */
  async listClusters(): Promise<NksClusterSummary[]> {
    const url = `${this.nksEndpoint}/clusters`;
    try {
      const raw = await ky
        .get(url, {
          headers: this.authHeaders(),
          retry: 0,
          timeout: DEFAULT_TIMEOUT_MS,
        })
        .json();

      if (!isClustersResponse(raw)) {
        throw new NhnCloudCliError(
          "nks cluster list 응답 형식이 올바르지 않습니다 — clusters 배열이 없습니다.",
          EXIT_API_ERROR,
        );
      }
      return raw.clusters;
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  async getCluster(cluster: string): Promise<NksNamedResource> {
    return this.getNamedResource("cluster", `/clusters/${encodeURIComponent(cluster)}`, "nks cluster get 응답 형식이 올바르지 않습니다 — cluster 객체가 없습니다.");
  }

  async createCluster(payload: Record<string, unknown>): Promise<NksUuidResponse> {
    return this.requestUuid("post", "/clusters", payload, "nks cluster create 응답 형식이 올바르지 않습니다 — uuid 필드가 없습니다.");
  }

  async deleteCluster(cluster: string): Promise<void> {
    await this.requestNoBody("delete", `/clusters/${encodeURIComponent(cluster)}`);
  }

  async resizeCluster(params: {
    cluster: string;
    nodegroup: string;
    nodeCount: number;
    nodesToRemove?: string[];
  }): Promise<void> {
    const payload: Record<string, unknown> = {
      nodegroup: params.nodegroup,
      node_count: params.nodeCount,
    };
    if (params.nodesToRemove && params.nodesToRemove.length > 0) {
      payload["nodes_to_remove"] = params.nodesToRemove;
    }
    await this.requestNoBody("post", `/clusters/${encodeURIComponent(params.cluster)}/actions/resize`, payload);
  }

  async setClusterIpAcl(cluster: string, payload: Record<string, unknown>): Promise<NksUuidResponse | null> {
    return this.requestOptionalUuid("post", `/clusters/${encodeURIComponent(cluster)}/api_ep_ipacl`, payload);
  }

  async renewClusterCertificate(cluster: string, termOfValidity: number): Promise<NksUuidResponse> {
    return this.requestUuid(
      "patch",
      `/certificates/${encodeURIComponent(cluster)}`,
      { term_of_validity: termOfValidity },
      "nks cluster renew-certificate 응답 형식이 올바르지 않습니다 — uuid 필드가 없습니다.",
    );
  }

  async updateClusterServiceGateway(cluster: string, ncrSgw: string, obsSgw: string): Promise<NksUuidResponse> {
    return this.requestUuid(
      "post",
      `/clusters/${encodeURIComponent(cluster)}/actions/update_sgw`,
      { ncr_sgw: ncrSgw, obs_sgw: obsSgw },
      "nks cluster update-sgw 응답 형식이 올바르지 않습니다 — uuid 필드가 없습니다.",
    );
  }

  async setControlPlaneLog(cluster: string, controlPlaneLog: Record<string, unknown>): Promise<NksUuidResponse> {
    return this.requestUuid(
      "patch",
      `/clusters/${encodeURIComponent(cluster)}`,
      { type: "control_plane_log", control_plane_log: controlPlaneLog },
      "nks cluster set-control-plane-log 응답 형식이 올바르지 않습니다 — uuid 필드가 없습니다.",
    );
  }

  async listClusterEvents(cluster: string): Promise<NksNamedResource[]> {
    return this.getNamedResourceArray(
      "events",
      `/clusters/${encodeURIComponent(cluster)}/events`,
      "nks cluster events 응답 형식이 올바르지 않습니다 — events 배열이 없습니다.",
    );
  }

  async getClusterEvent(cluster: string, event: string): Promise<NksNamedResource> {
    return this.getNamedResource(
      "event",
      `/clusters/${encodeURIComponent(cluster)}/events/${encodeURIComponent(event)}`,
      "nks cluster event 응답 형식이 올바르지 않습니다 — event 객체가 없습니다.",
    );
  }

  async getClusterKubeconfig(cluster: string): Promise<string> {
    const url = `${this.nksEndpoint}/clusters/${encodeURIComponent(cluster)}/config`;
    try {
      return await ky
        .get(url, {
          headers: this.authHeaders(),
          retry: 0,
          timeout: DEFAULT_TIMEOUT_MS,
        })
        .text();
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  async getClusterIpAcl(cluster: string): Promise<NksNamedResource> {
    return this.getNamedResource(
      "api_ep_ipacl",
      `/clusters/${encodeURIComponent(cluster)}/api_ep_ipacl`,
      "nks cluster ipacl 응답 형식이 올바르지 않습니다 — api_ep_ipacl 객체가 없습니다.",
    );
  }

  async listNodeGroups(cluster: string): Promise<NksNodeGroupSummary[]> {
    const raw = await this.getJson(`/clusters/${encodeURIComponent(cluster)}/nodegroups`);
    if (!isNodeGroupsResponse(raw)) {
      throw new NhnCloudCliError(
        "nks nodegroup list 응답 형식이 올바르지 않습니다 — nodegroups 배열이 없습니다.",
        EXIT_API_ERROR,
      );
    }
    return raw.nodegroups;
  }

  async getNodeGroup(cluster: string, nodegroup: string): Promise<NksNodeGroupSummary> {
    const raw = await this.getJson(`/clusters/${encodeURIComponent(cluster)}/nodegroups/${encodeURIComponent(nodegroup)}`);
    if (!isNodeGroupResponse(raw)) {
      throw new NhnCloudCliError(
        "nks nodegroup get 응답 형식이 올바르지 않습니다 — nodegroup 객체가 없습니다.",
        EXIT_API_ERROR,
      );
    }
    return raw.nodegroup;
  }

  async getNodeGroupAutoscale(cluster: string, nodegroup: string): Promise<NksNamedResource> {
    return this.getNamedResource(
      "autoscale",
      `/clusters/${encodeURIComponent(cluster)}/nodegroups/${encodeURIComponent(nodegroup)}/autoscale`,
      "nks nodegroup autoscale 응답 형식이 올바르지 않습니다 — autoscale 객체가 없습니다.",
    );
  }

  async listAddonTypes(): Promise<NksAddonType[]> {
    const raw = await this.getJson("/addon_types");
    if (!isAddonTypesResponse(raw)) {
      throw new NhnCloudCliError(
        "nks addon-type list 응답 형식이 올바르지 않습니다 — addon_types 배열이 없습니다.",
        EXIT_API_ERROR,
      );
    }
    return raw.addon_types;
  }

  async getAddonType(addonType: string): Promise<NksAddonType> {
    const raw = await this.getJson(`/addon_types/${encodeURIComponent(addonType)}`);
    if (!isAddonTypeResponse(raw)) {
      throw new NhnCloudCliError(
        "nks addon-type get 응답 형식이 올바르지 않습니다 — addon_type 객체가 없습니다.",
        EXIT_API_ERROR,
      );
    }
    return raw.addon_type;
  }

  async listAddons(filters: { k8sVersion?: string; image?: string; platformVersion?: string }): Promise<NksAddon[]> {
    const searchParams: Record<string, string> = {};
    if (filters.k8sVersion) searchParams["k8s_version"] = filters.k8sVersion;
    if (filters.image) searchParams["image"] = filters.image;
    if (filters.platformVersion) searchParams["platform_version"] = filters.platformVersion;

    const raw = await this.getJson("/addons", searchParams);
    if (!isAddonsResponse(raw)) {
      throw new NhnCloudCliError(
        "nks addon list 응답 형식이 올바르지 않습니다 — addons 배열이 없습니다.",
        EXIT_API_ERROR,
      );
    }
    return raw.addons;
  }

  async getAddon(addon: string): Promise<NksAddon> {
    const raw = await this.getJson(`/addons/${encodeURIComponent(addon)}`);
    if (!isAddonResponse(raw)) {
      throw new NhnCloudCliError(
        "nks addon get 응답 형식이 올바르지 않습니다 — addon 객체가 없습니다.",
        EXIT_API_ERROR,
      );
    }
    return raw.addon;
  }

  async listClusterAddons(cluster: string): Promise<NksAddon[]> {
    const raw = await this.getJson(`/clusters/${encodeURIComponent(cluster)}/addons`);
    if (!isAddonsResponse(raw)) {
      throw new NhnCloudCliError(
        "nks cluster addon list 응답 형식이 올바르지 않습니다 — addons 배열이 없습니다.",
        EXIT_API_ERROR,
      );
    }
    return raw.addons;
  }

  async getClusterAddon(cluster: string, addon: string): Promise<NksAddon> {
    const raw = await this.getJson(`/clusters/${encodeURIComponent(cluster)}/addons/${encodeURIComponent(addon)}`);
    if (!isAddonResponse(raw)) {
      throw new NhnCloudCliError(
        "nks cluster addon get 응답 형식이 올바르지 않습니다 — addon 객체가 없습니다.",
        EXIT_API_ERROR,
      );
    }
    return raw.addon;
  }

  private async getNamedResource(key: string, path: string, errorMessage: string): Promise<NksNamedResource> {
    const raw = await this.getJson(path);
    if (!isNamedResourceResponse(key, raw)) {
      throw new NhnCloudCliError(errorMessage, EXIT_API_ERROR);
    }
    return raw[key];
  }

  private async getNamedResourceArray(key: string, path: string, errorMessage: string): Promise<NksNamedResource[]> {
    const raw = await this.getJson(path);
    if (!isNamedResourceArrayResponse(key, raw)) {
      throw new NhnCloudCliError(errorMessage, EXIT_API_ERROR);
    }
    return raw[key];
  }

  private async getJson(path: string, searchParams?: Record<string, string>): Promise<unknown> {
    const url = `${this.nksEndpoint}${path}`;
    try {
      return await ky
        .get(url, {
          headers: this.authHeaders(),
          searchParams,
          retry: 0,
          timeout: DEFAULT_TIMEOUT_MS,
        })
        .json();
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  private async requestUuid(
    method: "post" | "patch",
    path: string,
    payload: Record<string, unknown>,
    errorMessage: string,
  ): Promise<NksUuidResponse> {
    const raw = await this.requestJson(method, path, payload);
    if (!isNksUuidResponse(raw)) {
      throw new NhnCloudCliError(errorMessage, EXIT_API_ERROR);
    }
    return raw;
  }

  private async requestOptionalUuid(
    method: "post" | "patch",
    path: string,
    payload: Record<string, unknown>,
  ): Promise<NksUuidResponse | null> {
    const raw = await this.requestJson(method, path, payload);
    if (raw === undefined || raw === null || raw === "") return null;
    if (!isNksUuidResponse(raw)) {
      throw new NhnCloudCliError(
        "nks 응답 형식이 올바르지 않습니다 — uuid 필드가 없습니다.",
        EXIT_API_ERROR,
      );
    }
    return raw;
  }

  private async requestNoBody(
    method: "post" | "delete",
    path: string,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    const url = `${this.nksEndpoint}${path}`;
    try {
      if (method === "delete") {
        await ky.delete(url, { headers: this.authHeaders(), retry: 0, timeout: DEFAULT_TIMEOUT_MS });
        return;
      }
      await ky.post(url, { headers: this.authHeaders(), json: payload, retry: 0, timeout: DEFAULT_TIMEOUT_MS });
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  private async requestJson(
    method: "post" | "patch",
    path: string,
    payload: Record<string, unknown>,
  ): Promise<unknown> {
    const url = `${this.nksEndpoint}${path}`;
    try {
      const options = { headers: this.authHeaders(), json: payload, retry: 0, timeout: DEFAULT_TIMEOUT_MS };
      return method === "post" ? await ky.post(url, options).json() : await ky.patch(url, options).json();
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }
}
