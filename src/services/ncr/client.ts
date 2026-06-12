import ky from "ky";
import { ncrHost } from "../../api/endpoints.js";
import { unwrap, type NhnEnvelope } from "../../api/envelope.js";
import { toNhnCloudCliError } from "../../api/httpError.js";
import { isRegistry, type Registry } from "./types.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_API_ERROR } from "../../utils/exit-codes.js";

/** 조회용 기본 timeout (30초) — export 하지 않는 모듈 로컬 const */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * NCR Management API 클라이언트 (ADR-016).
 * 공통 UAK 를 정적 헤더(X-TC-AUTHENTICATION-ID/SECRET)로 직접 전송 — OAuth 교환 없음.
 * 실측 pending: 헤더 표기 대소문자/하이픈 — 401 이면 교정.
 */
export class NcrClient {
  private readonly uakId: string;
  private readonly uakSecret: string;
  private readonly baseUrl: string;

  constructor(uakId: string, uakSecret: string, region: string) {
    this.uakId = uakId;
    this.uakSecret = uakSecret;
    this.baseUrl = `https://${ncrHost(region)}`;
  }

  private authHeaders(): Record<string, string> {
    return {
      "X-TC-AUTHENTICATION-ID": this.uakId,
      "X-TC-AUTHENTICATION-SECRET": this.uakSecret,
    };
  }

  /**
   * 레지스트리 목록을 반환한다.
   * GET /ncr/v2.0/appkeys/{appKey}/registries
   * 실측 pending: 응답 봉투 body 가 배열인지 { registries: [...] } 객체인지.
   */
  async listRegistries(appKey: string): Promise<Registry[]> {
    const url = `${this.baseUrl}/ncr/v2.0/appkeys/${encodeURIComponent(appKey)}/registries`;
    try {
      const res = await ky
        .get(url, {
          headers: this.authHeaders(),
          retry: 0,
          timeout: DEFAULT_TIMEOUT_MS,
        })
        .json<NhnEnvelope<unknown>>();

      const body = unwrap(res);

      // 실측 pending: body 가 배열 또는 { registries: [...] } 객체일 수 있음
      if (Array.isArray(body)) {
        return body.filter(isRegistry);
      }

      if (typeof body === "object" && body !== null) {
        const obj = body as Record<string, unknown>;
        const arr = obj["registries"];
        if (Array.isArray(arr)) {
          return arr.filter(isRegistry);
        }
      }

      throw new NhnCloudCliError(
        "NCR API 응답 형식 오류: registries 배열을 찾을 수 없습니다.",
        EXIT_API_ERROR,
      );
    } catch (err) {
      if (err instanceof NhnCloudCliError) throw err;
      throw toNhnCloudCliError(err);
    }
  }

  /**
   * 단일 레지스트리를 반환한다.
   * GET /ncr/v2.0/appkeys/{appKey}/registries/{registryNameOrId}
   */
  async getRegistry(appKey: string, registry: string): Promise<Registry> {
    const url = `${this.baseUrl}/ncr/v2.0/appkeys/${encodeURIComponent(appKey)}/registries/${encodeURIComponent(registry)}`;
    try {
      const res = await ky
        .get(url, {
          headers: this.authHeaders(),
          retry: 0,
          timeout: DEFAULT_TIMEOUT_MS,
        })
        .json<NhnEnvelope<unknown>>();

      const body = unwrap(res);

      // body 가 Registry 직접 또는 { registry: {...} } 객체일 수 있음
      if (isRegistry(body)) {
        return body;
      }

      if (typeof body === "object" && body !== null) {
        const obj = body as Record<string, unknown>;
        const reg = obj["registry"];
        if (isRegistry(reg)) {
          return reg;
        }
      }

      throw new NhnCloudCliError(
        "NCR API 응답 형식 오류: registry 객체를 찾을 수 없습니다.",
        EXIT_API_ERROR,
      );
    } catch (err) {
      if (err instanceof NhnCloudCliError) throw err;
      throw toNhnCloudCliError(err);
    }
  }
}
