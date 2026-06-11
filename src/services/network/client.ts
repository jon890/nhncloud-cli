import ky from "ky";
import { toNhnCloudCliError } from "../../api/httpError.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_API_ERROR } from "../../utils/exit-codes.js";
import type { Vpc, VpcSubnet, FloatingIp, CreateFloatingIpParams } from "./types.js";

const DEFAULT_TIMEOUT_MS = 30_000;

// ── 응답 타입 가드 ─────────────────────────────────────────────────────────────

function isVpc(val: unknown): val is Vpc {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  // 출력에 쓰는 필드를 모두 검증 — 타입(required)·실측("항상 존재")과 일치, "undefined" 셀 방지.
  return (
    typeof obj["id"] === "string" &&
    typeof obj["name"] === "string" &&
    typeof obj["cidrv4"] === "string" &&
    typeof obj["state"] === "string" &&
    typeof obj["router:external"] === "boolean"
  );
}

function isVpcsResponse(val: unknown): val is { vpcs: Vpc[] } {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return Array.isArray(obj["vpcs"]) && obj["vpcs"].every(isVpc);
}

function isSubnet(val: unknown): val is VpcSubnet {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  // vpc_id·gateway·available_ip_count 는 subnet list 의 핵심 출력값 — 모두 검증 (실측: 항상 존재).
  return (
    typeof obj["id"] === "string" &&
    typeof obj["cidr"] === "string" &&
    typeof obj["vpc_id"] === "string" &&
    typeof obj["gateway"] === "string" &&
    typeof obj["available_ip_count"] === "number"
  );
}

function isSubnetsResponse(val: unknown): val is { vpcsubnets: VpcSubnet[] } {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return Array.isArray(obj["vpcsubnets"]) && obj["vpcsubnets"].every(isSubnet);
}

function isFloatingIp(val: unknown): val is FloatingIp {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj["id"] === "string" &&
    typeof obj["floating_ip_address"] === "string" &&
    typeof obj["status"] === "string"
  );
}

function isFloatingIpsResponse(val: unknown): val is { floatingips: FloatingIp[] } {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return Array.isArray(obj["floatingips"]) && obj["floatingips"].every(isFloatingIp);
}

function isFloatingIpResponse(val: unknown): val is { floatingip: FloatingIp } {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return isFloatingIp((obj as Record<string, unknown>)["floatingip"]);
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

  /** Floating IP 목록을 조회한다 (GET /v2.0/floatingips). */
  async listFloatingIps(): Promise<FloatingIp[]> {
    const url = `${this.networkEndpoint}/floatingips`;
    try {
      const raw = await ky
        .get(url, { headers: this.authHeaders(), retry: 0, timeout: DEFAULT_TIMEOUT_MS })
        .json();
      if (!isFloatingIpsResponse(raw)) {
        throw new NhnCloudCliError(
          "floatingip list 응답 형식이 올바르지 않습니다 — floatingips 배열이 없습니다.",
          EXIT_API_ERROR,
        );
      }
      return raw.floatingips;
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  /** Floating IP 를 발급한다 (POST /v2.0/floatingips). */
  async createFloatingIp(params: CreateFloatingIpParams): Promise<FloatingIp> {
    const url = `${this.networkEndpoint}/floatingips`;
    try {
      const raw = await ky
        .post(url, {
          headers: this.authHeaders(),
          json: { floatingip: { floating_network_id: params.floating_network_id } },
          retry: 0,
          timeout: DEFAULT_TIMEOUT_MS,
        })
        .json();
      if (!isFloatingIpResponse(raw)) {
        throw new NhnCloudCliError(
          "floatingip create 응답 형식이 올바르지 않습니다 — floatingip 객체가 없습니다.",
          EXIT_API_ERROR,
        );
      }
      return raw.floatingip;
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  /** Floating IP 를 삭제한다 (DELETE /v2.0/floatingips/{id}, 무본문). */
  async deleteFloatingIp(id: string): Promise<void> {
    const url = `${this.networkEndpoint}/floatingips/${encodeURIComponent(id)}`;
    try {
      await ky.delete(url, { headers: this.authHeaders(), retry: 0, timeout: DEFAULT_TIMEOUT_MS });
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  /**
   * 외부(external) VPC id 를 찾는다 — create 의 floating_network_id 기본 소스.
   * `router:external` 은 콜론 포함 리터럴 키 — bracket 접근 필수.
   * external VPC 가 둘 이상이면 첫 매칭을 반환한다.
   * 사용자는 `--network <id>` 로 명시 지정 가능하므로 create 의 stderr 에 그 사실을 안내한다.
   */
  async findExternalNetworkId(): Promise<string | null> {
    const url = `${this.networkEndpoint}/vpcs`;
    try {
      const raw = await ky
        .get(url, {
          headers: this.authHeaders(),
          searchParams: { "router:external": "true" },
          retry: 0,
          timeout: DEFAULT_TIMEOUT_MS,
        })
        .json();
      if (typeof raw !== "object" || raw === null) return null;
      const vpcs = (raw as Record<string, unknown>)["vpcs"];
      if (!Array.isArray(vpcs)) return null;
      for (const v of vpcs) {
        if (typeof v !== "object" || v === null) continue;
        const obj = v as Record<string, unknown>;
        if (obj["router:external"] === true && typeof obj["id"] === "string") {
          return obj["id"];
        }
      }
      return null;
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }
}
