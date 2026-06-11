import ky from "ky";
import { toNhnCloudCliError } from "../../api/httpError.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_API_ERROR } from "../../utils/exit-codes.js";
import type { Vpc, VpcSubnet } from "./types.js";

const DEFAULT_TIMEOUT_MS = 30_000;

// ── 응답 타입 가드 ─────────────────────────────────────────────────────────────

function isVpc(val: unknown): val is Vpc {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return typeof obj["id"] === "string" && typeof obj["name"] === "string";
}

function isVpcsResponse(val: unknown): val is { vpcs: Vpc[] } {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return Array.isArray(obj["vpcs"]) && obj["vpcs"].every(isVpc);
}

function isSubnet(val: unknown): val is VpcSubnet {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return typeof obj["id"] === "string" && typeof obj["cidr"] === "string";
}

function isSubnetsResponse(val: unknown): val is { vpcsubnets: VpcSubnet[] } {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return Array.isArray(obj["vpcsubnets"]) && obj["vpcsubnets"].every(isSubnet);
}

// ── NetworkClient ───────────────────────────────────────────────────────────────

export class NetworkClient {
  private readonly tokenId: string;
  private readonly networkEndpoint: string;

  constructor(tokenId: string, networkEndpoint: string) {
    this.tokenId = tokenId;
    this.networkEndpoint = networkEndpoint;
  }

  private authHeaders(): Record<string, string> {
    return { "X-Auth-Token": this.tokenId };
  }

  /**
   * VPC 목록을 조회한다 (GET /v2.0/vpcs, NHN VPC).
   * instance 와 다른 host(networkEndpoint)지만 같은 Keystone 토큰을 쓴다.
   */
  async listVpcs(): Promise<Vpc[]> {
    const url = `${this.networkEndpoint}/vpcs`;
    try {
      const raw = await ky
        .get(url, {
          headers: this.authHeaders(),
          retry: 0,
          timeout: DEFAULT_TIMEOUT_MS,
        })
        .json();

      if (!isVpcsResponse(raw)) {
        throw new NhnCloudCliError(
          "network list 응답 형식이 올바르지 않습니다 — vpcs 배열이 없습니다.",
          EXIT_API_ERROR,
        );
      }
      return raw.vpcs;
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  /**
   * 서브넷 목록을 조회한다 (GET /v2.0/vpcsubnets, NHN VPC).
   */
  async listSubnets(): Promise<VpcSubnet[]> {
    const url = `${this.networkEndpoint}/vpcsubnets`;
    try {
      const raw = await ky
        .get(url, {
          headers: this.authHeaders(),
          retry: 0,
          timeout: DEFAULT_TIMEOUT_MS,
        })
        .json();

      if (!isSubnetsResponse(raw)) {
        throw new NhnCloudCliError(
          "network subnet list 응답 형식이 올바르지 않습니다 — vpcsubnets 배열이 없습니다.",
          EXIT_API_ERROR,
        );
      }
      return raw.vpcsubnets;
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }
}
