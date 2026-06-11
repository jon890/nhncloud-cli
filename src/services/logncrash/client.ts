import ky from "ky";
import { endpointFor } from "../../api/endpoints.js";
import { unwrap, unwrapHeader, type NhnEnvelope } from "../../api/envelope.js";
import { toNhnCloudCliError } from "../../api/httpError.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_CONFIG_ERROR } from "../../utils/exit-codes.js";
import type { LogSearchParams, LogSearchResult, LogSendParams, ScrollStartParams, ScrollResult } from "./types.js";

export class LogncrashClient {
  private readonly appkey: string;
  /** 검색(X-LNCS-SECRET)에만 필요. collector send 는 secret 을 쓰지 않으므로 옵셔널 (ADR-014). */
  private readonly secret: string | undefined;

  constructor(appkey: string, secret?: string) {
    this.appkey = appkey;
    this.secret = secret;
  }

  async search(params: LogSearchParams): Promise<LogSearchResult> {
    if (!this.secret) {
      throw new NhnCloudCliError(
        "logncrash search 에는 secret 이 필요합니다. configure 로 logncrash secret 을 설정하세요.",
        EXIT_CONFIG_ERROR,
      );
    }
    const endpoint = endpointFor("logncrash");
    const url = `${endpoint}/api/v2/search/${encodeURIComponent(this.appkey)}`;

    try {
      const res = await ky
        .post(url, {
          headers: {
            "X-LNCS-SECRET": this.secret,
            "Content-Type": "application/json",
          },
          json: {
            query: params.query,
            from: params.from,
            to: params.to,
            pageNumber: params.pageNumber ?? 0,
            pageSize: params.pageSize ?? 10,
          },
        })
        .json<NhnEnvelope<LogSearchResult>>();

      return unwrap(res);
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  /**
   * scroll 검색을 시작한다. POST /api/v2/search/scroll/{appkey}.
   * body 는 search 와 동일(query/from/to/pageSize). 응답 scrollKey 로 scrollNext 를 이어 호출한다.
   */
  async scrollStart(params: ScrollStartParams): Promise<ScrollResult> {
    if (!this.secret) {
      throw new NhnCloudCliError(
        "logncrash scroll 에는 secret 이 필요합니다. configure 로 logncrash secret 을 설정하세요.",
        EXIT_CONFIG_ERROR,
      );
    }
    const endpoint = endpointFor("logncrash");
    const url = `${endpoint}/api/v2/search/scroll/${encodeURIComponent(this.appkey)}`;

    try {
      const res = await ky
        .post(url, {
          headers: {
            "X-LNCS-SECRET": this.secret,
            "Content-Type": "application/json",
          },
          json: {
            query: params.query,
            from: params.from,
            to: params.to,
            pageSize: params.pageSize ?? 100,
          },
        })
        .json<NhnEnvelope<ScrollResult>>();

      return unwrap(res);
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  /**
   * scroll 다음 페이지를 가져온다. POST /api/v2/search/scroll/{appkey}/{scrollKey}.
   * body 는 보내지 않는다(scrollKey 가 좌표). scrollKey 만료 시 API 가 실패 봉투를 주며,
   * unwrap 이 EXIT_API_ERROR 로 변환한다 — 호출부에서 만료 안내 메시지로 감싼다.
   */
  async scrollNext(scrollKey: string): Promise<ScrollResult> {
    if (!this.secret) {
      throw new NhnCloudCliError(
        "logncrash scroll 에는 secret 이 필요합니다. configure 로 logncrash secret 을 설정하세요.",
        EXIT_CONFIG_ERROR,
      );
    }
    const endpoint = endpointFor("logncrash");
    const url = `${endpoint}/api/v2/search/scroll/${encodeURIComponent(this.appkey)}/${encodeURIComponent(scrollKey)}`;

    try {
      const res = await ky
        .post(url, {
          headers: {
            "X-LNCS-SECRET": this.secret,
            "Content-Type": "application/json",
          },
        })
        .json<NhnEnvelope<ScrollResult>>();

      return unwrap(res);
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
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
