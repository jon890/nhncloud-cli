import ky from "ky";
import { toNhnCloudCliError } from "../../api/httpError.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_API_ERROR } from "../../utils/exit-codes.js";
import { isNksClusterSummary, isNksSupports, type NksClusterSummary, type NksSupports } from "./types.js";

const DEFAULT_TIMEOUT_MS = 30_000;

function isClustersResponse(val: unknown): val is { clusters: NksClusterSummary[] } {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return Array.isArray(obj["clusters"]) && obj["clusters"].every(isNksClusterSummary);
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
}
