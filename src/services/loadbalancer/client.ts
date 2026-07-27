import ky from "ky";
import { toNhnCloudCliError } from "../../api/httpError.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_API_ERROR } from "../../utils/exit-codes.js";
import {
  isIpAclGroup,
  isIpAclTarget,
  isLoadBalancer,
  type IpAclGroup,
  type IpAclTarget,
  type LoadBalancer,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 30_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readArrayField<T>(
  response: unknown,
  key: string,
  itemGuard: (item: unknown) => item is T,
  missingKeyMessage: string,
  invalidItemMessage: string,
): T[] {
  if (!isRecord(response) || !Array.isArray(response[key])) {
    throw new NhnCloudCliError(missingKeyMessage, EXIT_API_ERROR);
  }

  const items = response[key];
  if (!items.every(itemGuard)) {
    throw new NhnCloudCliError(invalidItemMessage, EXIT_API_ERROR);
  }
  return items;
}

function readObjectField<T>(
  response: unknown,
  key: string,
  itemGuard: (item: unknown) => item is T,
  missingKeyMessage: string,
  invalidItemMessage: string,
): T {
  if (!isRecord(response) || !(key in response)) {
    throw new NhnCloudCliError(missingKeyMessage, EXIT_API_ERROR);
  }

  const item = response[key];
  if (!itemGuard(item)) {
    throw new NhnCloudCliError(invalidItemMessage, EXIT_API_ERROR);
  }
  return item;
}

export class LoadBalancerClient {
  private readonly tokenId: string;
  private readonly endpoint: string;

  constructor(tokenId: string, networkEndpoint: string) {
    this.tokenId = tokenId;
    this.endpoint = `${networkEndpoint}/lbaas`;
  }

  private authHeaders(): Record<string, string> {
    return { "X-Auth-Token": this.tokenId };
  }

  async listLoadBalancers(query?: Record<string, string>): Promise<LoadBalancer[]> {
    const raw = await this.getJson("/loadbalancers", query);
    return readArrayField(
      raw,
      "loadbalancers",
      isLoadBalancer,
      "loadbalancer list 응답 형식이 올바르지 않습니다 — loadbalancers 배열이 없습니다.",
      "loadbalancer list 응답의 Load Balancer 항목 형식이 예상과 다릅니다 — API 응답 필드를 확인하세요.",
    );
  }

  async getLoadBalancer(id: string): Promise<LoadBalancer> {
    const raw = await this.getJson(`/loadbalancers/${encodeURIComponent(id)}`);
    return readObjectField(
      raw,
      "loadbalancer",
      isLoadBalancer,
      "loadbalancer get 응답 형식이 올바르지 않습니다 — loadbalancer 객체가 없습니다.",
      "loadbalancer get 응답의 Load Balancer 항목 형식이 예상과 다릅니다 — API 응답 필드를 확인하세요.",
    );
  }

  async listIpAclGroups(query?: Record<string, string>): Promise<IpAclGroup[]> {
    const raw = await this.getJson("/ipacl-groups", query);
    return readArrayField(
      raw,
      "ipacl_groups",
      isIpAclGroup,
      "loadbalancer ipacl list 응답 형식이 올바르지 않습니다 — ipacl_groups 배열이 없습니다.",
      "loadbalancer ipacl list 응답의 IP ACL 그룹 항목 형식이 예상과 다릅니다 — API 응답 필드를 확인하세요.",
    );
  }

  async getIpAclGroup(id: string): Promise<IpAclGroup> {
    const raw = await this.getJson(`/ipacl-groups/${encodeURIComponent(id)}`);
    return readObjectField(
      raw,
      "ipacl_group",
      isIpAclGroup,
      "loadbalancer ipacl get 응답 형식이 올바르지 않습니다 — ipacl_group 객체가 없습니다.",
      "loadbalancer ipacl get 응답의 IP ACL 그룹 항목 형식이 예상과 다릅니다 — API 응답 필드를 확인하세요.",
    );
  }

  async listIpAclTargets(query: { ipacl_group_id: string }): Promise<IpAclTarget[]> {
    const raw = await this.getJson("/ipacl-targets", query);
    return readArrayField(
      raw,
      "ipacl_targets",
      isIpAclTarget,
      "loadbalancer ipacl target list 응답 형식이 올바르지 않습니다 — ipacl_targets 배열이 없습니다.",
      "loadbalancer ipacl target list 응답의 IP ACL 대상 항목 형식이 예상과 다릅니다 — API 응답 필드를 확인하세요.",
    );
  }

  private async getJson(path: string, searchParams?: Record<string, string>): Promise<unknown> {
    const url = `${this.endpoint}${path}`;
    try {
      return await ky
        .get(url, {
          headers: this.authHeaders(),
          searchParams,
          retry: 0,
          timeout: DEFAULT_TIMEOUT_MS,
        })
        .json();
    } catch (error) {
      throw toNhnCloudCliError(error);
    }
  }
}
