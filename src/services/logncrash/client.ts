import ky from "ky";
import { endpointFor } from "../../api/endpoints.js";
import { unwrap, unwrapHeader, type NhnEnvelope } from "../../api/envelope.js";
import { toNhnCloudCliError } from "../../api/httpError.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_CONFIG_ERROR } from "../../utils/exit-codes.js";
import type {
  CursorSearchParams,
  CursorSearchResult,
  LogSearchParams,
  LogSearchResult,
  LogSendParams,
  ScrollStartParams,
  ScrollResult,
} from "./types.js";

/** Phase 2에서 export command의 폐기 예정 --size 전달을 제거하면 함께 없앤다. */
type LegacyScrollStartParams = ScrollStartParams & { pageSize?: number };

export class LogncrashClient {
  private readonly appkey: string;
  /** Search v3 읽기 요청에만 필요하다. collector send 는 인증 헤더를 쓰지 않는다(ADR-014). */
  private readonly accessToken: string | undefined;

  constructor(appkey: string, accessToken?: string) {
    this.appkey = appkey;
    this.accessToken = accessToken;
  }

  /**
   * Phase 2의 command 전환 전까지 기존 호출부의 타입 검사를 유지하는 v3 위임 호환층이다.
   * v2 경로·secret 인증을 사용하지 않으며 Phase 2에서 제거한다.
   */
  async search(params: LogSearchParams): Promise<LogSearchResult> {
    return this.cursorSearch({
      query: params.query,
      from: params.from,
      to: params.to,
      ...(params.pageSize !== undefined ? { pageSize: params.pageSize } : {}),
      ...(params.cursor !== undefined ? { cursor: params.cursor } : {}),
    });
  }

  async cursorSearch(params: CursorSearchParams): Promise<CursorSearchResult> {
    const headers = this.readHeaders();
    const endpoint = endpointFor("logncrash");
    const url = `${endpoint}/v3/${encodeURIComponent(this.appkey)}/logs/cursor`;

    try {
      const res = await ky
        .post(url, {
          headers,
          json: {
            query: params.query,
            from: params.from,
            to: params.to,
            ...(params.pageSize !== undefined ? { pageSize: params.pageSize } : {}),
            ...(params.cursor !== undefined ? { cursor: params.cursor } : {}),
          },
        })
        .json<NhnEnvelope<CursorSearchResult>>();

      return unwrap(res);
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  /**
   * v3 scroll 검색을 시작한다. 응답 scrollKey 로 scrollNext 를 이어 호출한다.
   */
  async scrollStart(params: LegacyScrollStartParams): Promise<ScrollResult> {
    const headers = this.readHeaders();
    const endpoint = endpointFor("logncrash");
    const url = `${endpoint}/v3/${encodeURIComponent(this.appkey)}/logs/scroll`;

    try {
      const res = await ky
        .post(url, {
          headers,
          json: {
            query: params.query,
            from: params.from,
            to: params.to,
          },
        })
        .json<NhnEnvelope<ScrollResult>>();

      return unwrap(res);
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  /**
   * v3 scroll 다음 페이지를 가져온다. body 없이 scrollKey 경로만 사용한다.
   */
  async scrollNext(scrollKey: string): Promise<ScrollResult> {
    const headers = this.readHeaders();
    const endpoint = endpointFor("logncrash");
    const url = `${endpoint}/v3/${encodeURIComponent(this.appkey)}/logs/scroll/${encodeURIComponent(scrollKey)}`;

    try {
      const res = await ky
        .post(url, {
          headers,
        })
        .json<NhnEnvelope<ScrollResult>>();

      return unwrap(res);
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  private readHeaders(): Record<string, string> {
    if (!this.accessToken) {
      throw new NhnCloudCliError(
        "Log & Crash Search v3 호출에는 공통 UAK로 발급한 access token이 필요합니다. nhncloud configure로 UAK를 설정하세요.",
        EXIT_CONFIG_ERROR,
      );
    }
    return { "X-NHN-Authorization": `Bearer ${this.accessToken}` };
  }

  /**
   * 로그 한 건을 Log & Crash collector 로 전송한다 (ADR-014).
   * - host: api-logncrash (검색의 api-lncs-search 와 별도)
   * - 인증: 헤더 없음 — body 의 projectName=appkey 로 식별 (secret 불요)
   * - logVersion 은 "v2" 고정. logSource/logType 미지정 시 collector 기본값("http"/"log") 적용.
   */
  async send(params: LogSendParams): Promise<void> {
    const endpoint = endpointFor("logncrash-collector");
    const url = `${endpoint}/v2/log`;

    const payload: Record<string, unknown> = {
      projectName: this.appkey,
      projectVersion: params.projectVersion,
      logVersion: "v2",
      body: params.body,
    };
    if (params.logLevel !== undefined) payload["logLevel"] = params.logLevel;
    if (params.logSource !== undefined) payload["logSource"] = params.logSource;
    if (params.logType !== undefined) payload["logType"] = params.logType;
    if (params.host !== undefined) payload["host"] = params.host;

    try {
      const res = await ky
        .post(url, {
          headers: { "Content-Type": "application/json" },
          json: payload,
        })
        .json<NhnEnvelope<unknown>>();

      // collector 는 body 없이 header 만 올 수 있어 unwrapHeader 로 성공만 판정 (ADR-006 단일 소스).
      unwrapHeader(res);
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }
}
