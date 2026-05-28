import ky from "ky";
import { endpointFor } from "../../api/endpoints.js";
import { unwrap, type NhnEnvelope } from "../../api/envelope.js";
import { toNhnCloudCliError } from "../../api/httpError.js";
import type { DeployRunParams } from "./types.js";

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
}
