import ky from "ky";
import { toNhnCloudCliError } from "../../api/httpError.js";
import { isRepository, isArtifact, type Repository, type Artifact } from "./types.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_API_ERROR } from "../../utils/exit-codes.js";

/** Harbor REST API 기본 timeout (30초) — 모듈 로컬 const (export 아님) */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Harbor 최대 page_size (100) — 모듈 로컬 const (export 아님) */
const PAGE_SIZE = 100;

/** pagination 무한루프 안전망 — Harbor 버그·프록시 변조로 rel="next" 가 영구 유지될 때 차단 */
const MAX_PAGES = 1000;

/**
 * Harbor REST API v2.0 클라이언트 (ADR-017).
 *
 * 인증: UAK id/secret 을 HTTP Basic Auth (Authorization: Basic base64(id:secret)).
 * Management API 의 X-TC 정적 헤더와 다른 모델 — Bearer 토큰 교환 불요.
 * 응답: NHN 봉투가 아닌 Harbor 평면 JSON 배열 — unwrap/unwrapHeader 호출 금지.
 * pagination: ?page=N&page_size=100 + Link rel="next" 헤더로 전수 수집.
 */
export class HarborClient {
  private readonly uakId: string;
  private readonly uakSecret: string;
  private readonly host: string;

  constructor(uakId: string, uakSecret: string, host: string) {
    this.uakId = uakId;
    this.uakSecret = uakSecret;
    this.host = host;
  }

  private basicAuthHeaders(): Record<string, string> {
    const token = Buffer.from(`${this.uakId}:${this.uakSecret}`).toString("base64");
    return { Authorization: `Basic ${token}` };
  }

  /**
   * Harbor REST 페이지네이션 전수 수집 (ADR-017 — silent truncation 방지).
   *
   * Harbor 응답 Link: <...?page=N+1...>; rel="next" 헤더가 없으면 종료.
   * ky.get() 이 Response 를 반환하므로 .json() 과 .headers.get("link") 를 함께 사용한다
   * (체이닝하면 헤더를 못 본다 — 기존 NCR client 의 .json<T>() 체이닝 패턴과 다름).
   */
  private async getAllPages(path: string): Promise<unknown[]> {
    const acc: unknown[] = [];
    let page = 1;
    try {
      for (;;) {
        const url = `https://${this.host}${path}?page=${page}&page_size=${PAGE_SIZE}`;
        const res = await ky.get(url, {
          headers: this.basicAuthHeaders(),
          retry: 0,
          timeout: DEFAULT_TIMEOUT_MS,
        });
        const data = await res.json<unknown>();
        if (!Array.isArray(data)) {
          throw new NhnCloudCliError(
            "Harbor REST 응답 형식 오류: 배열이 아닙니다.",
            EXIT_API_ERROR,
          );
        }
        acc.push(...data);
        const link = res.headers.get("link");
        if (!link || !link.includes('rel="next"')) break;
        page++;
        if (page > MAX_PAGES) {
          // Harbor 버그·프록시 변조로 rel="next" 가 영구 유지되는 비정상 상황 차단.
          throw new NhnCloudCliError(
            `Harbor pagination 최대 페이지(${MAX_PAGES}) 초과 — 비정상 응답으로 중단합니다.`,
            EXIT_API_ERROR,
          );
        }
      }
    } catch (err) {
      if (err instanceof NhnCloudCliError) throw err;
      throw toNhnCloudCliError(err);
    }
    return acc;
  }

  /**
   * 프로젝트(레지스트리)의 repository(이미지) 목록을 반환한다.
   * GET /api/v2.0/projects/{project}/repositories
   */
  async listRepositories(project: string): Promise<Repository[]> {
    const enc = encodeURIComponent(project);
    const data = await this.getAllPages(`/api/v2.0/projects/${enc}/repositories`);
    return data.filter(isRepository);
  }

  /**
   * repository 의 artifact 목록을 반환한다.
   * GET /api/v2.0/projects/{project}/repositories/{repository}/artifacts
   * repository 의 '/' 는 %2F 로 인코딩(path-traversal 방지).
   */
  async listArtifacts(project: string, repository: string): Promise<Artifact[]> {
    const encProject = encodeURIComponent(project);
    const encRepo = encodeURIComponent(repository);
    const data = await this.getAllPages(
      `/api/v2.0/projects/${encProject}/repositories/${encRepo}/artifacts`,
    );
    return data.filter(isArtifact);
  }
}
