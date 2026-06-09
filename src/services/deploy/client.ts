import ky from "ky";
import { endpointFor } from "../../api/endpoints.js";
import { unwrap, type NhnEnvelope } from "../../api/envelope.js";
import { toNhnCloudCliError } from "../../api/httpError.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_API_ERROR } from "../../utils/exit-codes.js";
import type { DeployRunParams, BinaryGroup, Binary, BinaryListParams } from "./types.js";

/**
 * 응답 타입 가드 — 5-4 회피.
 * key/binaryKey 는 number | string 수용 (docs 봇 차단으로 실측 불가,
 * 불명확 케이스이므로 완화. 형식 오류로 죽는 것을 방지).
 * 진단 노트: 실측 후 number 확정 시 string 분기 제거 가능.
 */
function isBinaryGroup(val: unknown): val is BinaryGroup {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  const keyType = typeof obj["key"];
  return (keyType === "number" || keyType === "string") && typeof obj["name"] === "string";
}

function isBinary(val: unknown): val is Binary {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  const binaryKeyType = typeof obj["binaryKey"];
  const binarySizeType = typeof obj["binarySize"];
  return (
    (binaryKeyType === "number" || binaryKeyType === "string") &&
    (binarySizeType === "number" || binarySizeType === "string")
  );
}

/** 동기 모드(async=false) 배포 최대 응답 대기 시간 (600초) */
const SYNC_TIMEOUT_MS = 600_000;

/** 조회용 기본 timeout (30초) */
const DEFAULT_TIMEOUT_MS = 30_000;

export class DeployClient {
  private readonly accessToken: string;
  private readonly baseUrl: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
    this.baseUrl = endpointFor("deploy");
  }

  private authHeaders(): Record<string, string> {
    return {
      "X-NHN-AUTHORIZATION": `Bearer ${this.accessToken}`,
    };
  }

  /**
   * 배포를 실행한다.
   * - targetHosts 가 비어있으면 payload 에서 targetServerHostnames 를 제외한다 (서버그룹 전체 배포).
   * - async=false(기본) 일 때 서버가 완료까지 응답을 보류하므로 ky timeout 을 600s 로 설정한다.
   */
  async run(params: DeployRunParams): Promise<Record<string, unknown>> {
    const url =
      `${this.baseUrl}/api/v2.1/projects/${params.appKey}` +
      `/artifacts/${params.artifactId}` +
      `/server-group/${params.serverGroupId}/deploy`;

    const isAsync = params.async ?? false;

    const payload: Record<string, unknown> = {
      concurrentNum: params.concurrentNum ?? 1,
      nextWhenFail: params.nextWhenFail ?? false,
      scenarioIds: params.scenarioIds,
      deployNote: params.deployNote ?? `CLI deploy ${new Date().toISOString()}`,
      async: isAsync,
    };

    // targetServerHostnames 빈 값이면 payload 에서 제외 (서버그룹 전체 배포)
    if (params.targetHosts) {
      payload["targetServerHostnames"] = params.targetHosts;
    }

    try {
      const res = await ky
        .post(url, {
          headers: {
            ...this.authHeaders(),
            "Content-Type": "application/json",
          },
          json: payload,
          retry: 0,
          timeout: isAsync ? DEFAULT_TIMEOUT_MS : SYNC_TIMEOUT_MS,
        })
        .json<NhnEnvelope<Record<string, unknown>>>();

      return unwrap(res);
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  /**
   * 아티팩트 목록을 조회한다.
   */
  async artifacts(appKey: string): Promise<Record<string, unknown>> {
    const url = `${this.baseUrl}/api/v2.1/projects/${appKey}/artifacts`;

    try {
      const res = await ky
        .get(url, {
          headers: this.authHeaders(),
          retry: 0,
          timeout: DEFAULT_TIMEOUT_MS,
        })
        .json<NhnEnvelope<Record<string, unknown>>>();

      return unwrap(res);
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  /**
   * 서버그룹 목록을 조회한다.
   */
  async serverGroups(appKey: string, artifactId: string): Promise<Record<string, unknown>> {
    const url =
      `${this.baseUrl}/api/v2.1/projects/${appKey}` +
      `/artifacts/${artifactId}/server-groups`;

    try {
      const res = await ky
        .get(url, {
          headers: this.authHeaders(),
          retry: 0,
          timeout: DEFAULT_TIMEOUT_MS,
        })
        .json<NhnEnvelope<Record<string, unknown>>>();

      return unwrap(res);
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  /**
   * 배포 이력을 조회한다.
   */
  async histories(appKey: string, artifactId: string): Promise<Record<string, unknown>> {
    const url =
      `${this.baseUrl}/api/v2.1/projects/${appKey}` +
      `/artifacts/${artifactId}/deploy-histories`;

    try {
      const res = await ky
        .get(url, {
          headers: this.authHeaders(),
          retry: 0,
          timeout: DEFAULT_TIMEOUT_MS,
        })
        .json<NhnEnvelope<Record<string, unknown>>>();

      return unwrap(res);
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  /**
   * 바이너리 그룹 목록을 조회한다.
   */
  async binaryGroups(appKey: string, artifactId: string): Promise<BinaryGroup[]> {
    const url =
      `${this.baseUrl}/api/v2.1/projects/${encodeURIComponent(appKey)}` +
      `/artifacts/${encodeURIComponent(artifactId)}/binary-groups`;

    try {
      const res = await ky
        .get(url, {
          headers: this.authHeaders(),
          retry: 0,
          timeout: DEFAULT_TIMEOUT_MS,
        })
        .json<NhnEnvelope<{ binaryGroups?: unknown }>>();

      const body = unwrap(res);
      const list = body.binaryGroups;
      if (!Array.isArray(list) || !list.every(isBinaryGroup)) {
        throw new NhnCloudCliError(
          "binary-groups 응답 형식이 올바르지 않습니다 — binaryGroups 배열이 없습니다.",
          EXIT_API_ERROR,
        );
      }
      return list;
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  /**
   * 특정 바이너리 그룹의 바이너리 목록을 조회한다.
   * pageNum/pageSize/sortKey/sortDirection 은 NHN docs 의 쿼리 파라미터로 그대로 전달한다.
   */
  async binaries(
    appKey: string,
    artifactId: string,
    binaryGroupKey: number,
    params: BinaryListParams = {},
  ): Promise<{ totalCount: number; binaries: Binary[] }> {
    const url =
      `${this.baseUrl}/api/v2.1/projects/${encodeURIComponent(appKey)}` +
      `/artifacts/${encodeURIComponent(artifactId)}/binary-groups/${binaryGroupKey}/binaries`;

    const searchParams: Record<string, string | number> = {};
    if (params.pageNum !== undefined) searchParams["pageNum"] = params.pageNum;
    if (params.pageSize !== undefined) searchParams["pageSize"] = params.pageSize;
    if (params.sortKey !== undefined) searchParams["sortKey"] = params.sortKey;
    if (params.sortDirection !== undefined) searchParams["sortDirection"] = params.sortDirection;

    try {
      const res = await ky
        .get(url, {
          headers: this.authHeaders(),
          searchParams,
          retry: 0,
          timeout: DEFAULT_TIMEOUT_MS,
        })
        .json<NhnEnvelope<{ totalCount?: unknown; binaries?: unknown }>>();

      const body = unwrap(res);
      const list = body.binaries;
      if (!Array.isArray(list) || !list.every(isBinary)) {
        throw new NhnCloudCliError(
          "binaries 응답 형식이 올바르지 않습니다 — binaries 배열이 없습니다.",
          EXIT_API_ERROR,
        );
      }
      // totalCount 는 number 가 정상이나 string("123") 으로 올 수 있어(resultCode 처럼 타입 혼재)
      // 숫자 문자열이면 변환해 "전체 항목 수" 의미를 보존한다. 그 외에만 현재 페이지 길이로 fallback.
      const tc = body.totalCount;
      const totalCount =
        typeof tc === "number"
          ? tc
          : typeof tc === "string" && /^\d+$/.test(tc)
            ? Number(tc)
            : list.length;
      return { totalCount, binaries: list };
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }
}
