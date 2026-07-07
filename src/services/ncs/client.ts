import ky from "ky";
import { ncsHost } from "../../api/endpoints.js";
import { unwrapHeader, type NhnEnvelope } from "../../api/envelope.js";
import { toNhnCloudCliError } from "../../api/httpError.js";
import {
  isNcsTemplateSummary,
  type NcsTemplateSummary,
  type NcsTemplateListParams,
  isNcsTemplateDetail,
  type NcsTemplateDetail,
  isNcsTemplateVersionSummary,
  type NcsTemplateVersionSummary,
  type NcsTemplateVersionListParams,
  isNcsTemplateVersionDetail,
  type NcsTemplateVersionDetail,
} from "./types.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_API_ERROR } from "../../utils/exit-codes.js";

/** 조회용 기본 timeout (30초) — export 하지 않는 모듈 로컬 const */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * NCS API 응답 봉투 (공식 docs 예제 JSON 확정 — ADR-020, docs.nhncloud.com/ko/Container/NCS/ko/public-api/).
 * 표준 NHN 봉투의 `body` 가 아니라 `header` 와 나란히 named 필드로 온다 — NCR 과 같은 패턴.
 * 목록은 `templates`. 따라서 unwrap(body 필수) 대신 unwrapHeader(header 검사) 후 named 필드를 직접 읽는다.
 */
interface NcsTemplateListResponse extends NhnEnvelope<unknown> {
  templates?: NcsTemplateSummary[];
}

/** `template get` 단건 응답 — named 필드 `template` (Phase 1 확정 패턴 재사용). */
interface NcsTemplateGetResponse extends NhnEnvelope<unknown> {
  template?: NcsTemplateDetail;
}

/** `template version list` 목록 응답 — named 필드 `versions`. */
interface NcsTemplateVersionListResponse extends NhnEnvelope<unknown> {
  versions?: NcsTemplateVersionSummary[];
}

/** `template version get` 단건 응답 — named 필드 `version`. */
interface NcsTemplateVersionGetResponse extends NhnEnvelope<unknown> {
  version?: NcsTemplateVersionDetail;
}

/**
 * NCS(NHN Container Service) API 클라이언트 (ADR-020).
 * 인증은 Deploy 와 같은 UAK OAuth Bearer 토큰(src/api/oauth.ts getAccessToken) 을 재사용한다.
 */
export class NcsClient {
  private readonly accessToken: string;
  private readonly baseUrl: string;

  constructor(accessToken: string, region: string, appKey: string) {
    this.accessToken = accessToken;
    this.baseUrl = `https://${ncsHost(region)}/ncs/v1.0/appkeys/${encodeURIComponent(appKey)}`;
  }

  private authHeaders(): Record<string, string> {
    return { "x-nhn-authorization": `Bearer ${this.accessToken}` };
  }

  /**
   * 설계도(template) 목록을 반환한다.
   * GET /ncs/v1.0/appkeys/{appKey}/templates
   * 응답: { header, templates: [...] } — body 가 아니라 named 필드(docs 예제 확정).
   *
   * pagination: 기본 page size 10(docs 확정). 목록이 앞부분만 조용히 반환(silent truncation)하지
   * 않도록 page/size 를 그대로 노출한다. 총 개수는 응답 헤더 X-Total-Count 로 온다(docs 확정) —
   * body/JSON 필드가 아니므로 ky Response 에서 header 를 직접 읽는다(harbor-client.ts 의
   * .json()+.headers.get() 분리 패턴과 동일 — .json<T>() 체이닝으로는 헤더를 못 본다).
   */
  async listTemplates(
    query: NcsTemplateListParams = {},
  ): Promise<{ totalCount: number; templates: NcsTemplateSummary[] }> {
    const url = `${this.baseUrl}/templates`;
    const searchParams: Record<string, string | number | boolean> = {};
    if (query.page !== undefined) searchParams["page"] = query.page;
    if (query.size !== undefined) searchParams["size"] = query.size;
    if (query.disableContainers !== undefined) {
      // wire 상 실제 쿼리 키는 docs 예제 인용(fetch, 실측 미검증)에 따라 snake_case 로 전송한다.
      // 이후 phase 에서 실제 200 응답으로 재확인 필요.
      searchParams["disable_containers"] = query.disableContainers;
    }

    try {
      const res = await ky.get(url, {
        headers: this.authHeaders(),
        searchParams,
        retry: 0,
        timeout: DEFAULT_TIMEOUT_MS,
      });
      const body = await res.json<NcsTemplateListResponse>();

      unwrapHeader(body);
      if (!Array.isArray(body.templates)) {
        // 누락은 빈 목록, 비배열(키 형태 변경)은 명확한 형식 오류 — NCR listRegistries 와 같은 결.
        if (body.templates === undefined) return { totalCount: 0, templates: [] };
        throw new NhnCloudCliError(
          "NCS API 응답 형식 오류: templates 가 배열이 아닙니다.",
          EXIT_API_ERROR,
        );
      }
      const templates = body.templates.filter(isNcsTemplateSummary);

      // X-Total-Count 헤더가 없거나 숫자가 아니면 현재 페이지 길이로 fallback(deploy binaries totalCount 패턴과 동일).
      const headerTotal = res.headers.get("x-total-count");
      const totalCount =
        headerTotal !== null && /^\d+$/.test(headerTotal) ? Number(headerTotal) : templates.length;

      return { totalCount, templates };
    } catch (err) {
      if (err instanceof NhnCloudCliError) throw err;
      throw toNhnCloudCliError(err);
    }
  }

  /**
   * 설계도(template) 단건을 반환한다.
   * GET /ncs/v1.0/appkeys/{appKey}/templates/{id}
   * 응답: { header, template: {...} } — named 필드(listTemplates 와 같은 패턴).
   */
  async getTemplate(id: string): Promise<NcsTemplateDetail> {
    const url = `${this.baseUrl}/templates/${encodeURIComponent(id)}`;
    try {
      const res = await ky.get(url, {
        headers: this.authHeaders(),
        retry: 0,
        timeout: DEFAULT_TIMEOUT_MS,
      });
      const body = await res.json<NcsTemplateGetResponse>();

      unwrapHeader(body);
      if (!isNcsTemplateDetail(body.template)) {
        throw new NhnCloudCliError(
          "NCS API 응답 형식 오류: template 필드가 없거나 형식이 올바르지 않습니다.",
          EXIT_API_ERROR,
        );
      }
      return body.template;
    } catch (err) {
      if (err instanceof NhnCloudCliError) throw err;
      throw toNhnCloudCliError(err);
    }
  }

  /**
   * 설계도(template) 의 버전 목록을 반환한다.
   * GET /ncs/v1.0/appkeys/{appKey}/templates/{id}/versions
   * 응답: { header, versions: [...] } — named 필드. pagination 은 listTemplates 와 동일하게
   * X-Total-Count 응답 헤더 + page/size 노출(silent truncation 방지).
   */
  async listTemplateVersions(
    id: string,
    query: NcsTemplateVersionListParams = {},
  ): Promise<{ totalCount: number; versions: NcsTemplateVersionSummary[] }> {
    const url = `${this.baseUrl}/templates/${encodeURIComponent(id)}/versions`;
    const searchParams: Record<string, string | number> = {};
    if (query.q !== undefined) searchParams["q"] = query.q;
    if (query.sort !== undefined) searchParams["sort"] = query.sort;
    if (query.page !== undefined) searchParams["page"] = query.page;
    if (query.size !== undefined) searchParams["size"] = query.size;

    try {
      const res = await ky.get(url, {
        headers: this.authHeaders(),
        searchParams,
        retry: 0,
        timeout: DEFAULT_TIMEOUT_MS,
      });
      const body = await res.json<NcsTemplateVersionListResponse>();

      unwrapHeader(body);
      if (!Array.isArray(body.versions)) {
        if (body.versions === undefined) return { totalCount: 0, versions: [] };
        throw new NhnCloudCliError(
          "NCS API 응답 형식 오류: versions 가 배열이 아닙니다.",
          EXIT_API_ERROR,
        );
      }
      const versions = body.versions.filter(isNcsTemplateVersionSummary);

      const headerTotal = res.headers.get("x-total-count");
      const totalCount =
        headerTotal !== null && /^\d+$/.test(headerTotal) ? Number(headerTotal) : versions.length;

      return { totalCount, versions };
    } catch (err) {
      if (err instanceof NhnCloudCliError) throw err;
      throw toNhnCloudCliError(err);
    }
  }

  /**
   * 설계도(template) 버전 단건을 반환한다.
   * GET /ncs/v1.0/appkeys/{appKey}/templates/{id}/versions/{version}
   * 응답: { header, version: {...} } — named 필드.
   */
  async getTemplateVersion(id: string, version: string): Promise<NcsTemplateVersionDetail> {
    const url = `${this.baseUrl}/templates/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}`;
    try {
      const res = await ky.get(url, {
        headers: this.authHeaders(),
        retry: 0,
        timeout: DEFAULT_TIMEOUT_MS,
      });
      const body = await res.json<NcsTemplateVersionGetResponse>();

      unwrapHeader(body);
      if (!isNcsTemplateVersionDetail(body.version)) {
        throw new NhnCloudCliError(
          "NCS API 응답 형식 오류: version 필드가 없거나 형식이 올바르지 않습니다.",
          EXIT_API_ERROR,
        );
      }
      return body.version;
    } catch (err) {
      if (err instanceof NhnCloudCliError) throw err;
      throw toNhnCloudCliError(err);
    }
  }
}
