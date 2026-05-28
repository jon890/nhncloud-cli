import ky from "ky";
import { endpointFor } from "../../api/endpoints.js";
import { unwrap, type NhnEnvelope } from "../../api/envelope.js";
import { toNhnCloudCliError } from "../../api/httpError.js";
import type { LogSearchParams, LogSearchResult } from "./types.js";

export class LogncrashClient {
  private readonly appkey: string;
  private readonly secret: string;

  constructor(appkey: string, secret: string) {
    this.appkey = appkey;
    this.secret = secret;
  }

  async search(params: LogSearchParams): Promise<LogSearchResult> {
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
}
