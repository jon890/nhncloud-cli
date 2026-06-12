import { describe, it, expect, vi, beforeEach } from "vitest";
import ky from "ky";
import { HarborClient } from "./harbor-client.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_AUTH_ERROR, EXIT_API_ERROR } from "../../utils/exit-codes.js";

vi.mock("ky");

/**
 * Harbor REST API mock — Response 객체({json, headers.get}) 를 반환한다.
 * 기존 NCR client 의 .json<T>() 체이닝과 달리 pagination Link 헤더 접근이 필요해
 * Response 객체 자체를 반환하는 mock 을 사용한다.
 */
function page(data: unknown, hasNext: boolean) {
  return {
    json: async () => data,
    headers: {
      get: (k: string) => (k === "link" && hasNext ? '<https://host/next>; rel="next"' : null),
    },
  } as never;
}

describe("HarborClient.listRepositories", () => {
  beforeEach(() => vi.resetAllMocks());

  it("단일 페이지 — Repository[] 반환 (name·artifact_count(string) 수용)", async () => {
    vi.mocked(ky.get).mockResolvedValueOnce(
      page([{ name: "proj/repo-a", artifact_count: "3", pull_count: 10 }], false),
    );

    const client = new HarborClient("id", "secret", "host.example.com");
    const result = await client.listRepositories("proj");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("proj/repo-a");
    // 6-2 검증: artifact_count 가 string 이어도 수용
    expect(result[0].artifact_count).toBe("3");
  });

  it("pagination 전수 수집 — 2페이지 → 결과 2개, ky.get 2회 호출", async () => {
    const r1 = { name: "proj/repo-a", artifact_count: 1 };
    const r2 = { name: "proj/repo-b", artifact_count: 2 };
    vi.mocked(ky.get)
      .mockResolvedValueOnce(page([r1], true))   // page=1, rel="next" 있음
      .mockResolvedValueOnce(page([r2], false));  // page=2, rel="next" 없음 → 종료

    const client = new HarborClient("id", "secret", "host.example.com");
    const result = await client.listRepositories("proj");

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("proj/repo-a");
    expect(result[1].name).toBe("proj/repo-b");
    // ky.get 이 정확히 2회 호출됐는지(page=1, page=2) 확인
    expect(ky.get).toHaveBeenCalledTimes(2);
    // page=1 URL 포함 여부
    expect(ky.get).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("page=1"),
      expect.anything(),
    );
    // page=2 URL 포함 여부
    expect(ky.get).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("page=2"),
      expect.anything(),
    );
  });

  it("Basic Auth 헤더 단언 — Authorization: Basic base64(id:secret)", async () => {
    vi.mocked(ky.get).mockResolvedValueOnce(page([], false));

    const client = new HarborClient("my-id", "my-secret", "host.example.com");
    await client.listRepositories("proj");

    const expected = Buffer.from("my-id:my-secret").toString("base64");
    expect(ky.get).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Basic ${expected}`,
        }),
      }),
    );
  });

  it("URL 단언 — /api/v2.0/projects/{project}/repositories + page_size=100", async () => {
    vi.mocked(ky.get).mockResolvedValueOnce(page([], false));

    const client = new HarborClient("id", "secret", "host.example.com");
    await client.listRepositories("my-proj");

    expect(ky.get).toHaveBeenCalledWith(
      expect.stringMatching(
        /https:\/\/host\.example\.com\/api\/v2\.0\/projects\/my-proj\/repositories\?page=1&page_size=100/,
      ),
      expect.anything(),
    );
  });

  it("비배열 응답 → 형식 오류 throw (EXIT_API_ERROR)", async () => {
    vi.mocked(ky.get).mockResolvedValueOnce(page({ unexpected: "object" }, false));

    const client = new HarborClient("id", "secret", "host.example.com");
    await expect(client.listRepositories("proj")).rejects.toMatchObject({
      exitCode: EXIT_API_ERROR,
    });
  });

  it("HTTP 401 → EXIT_AUTH_ERROR (toNhnCloudCliError 매핑 흉내)", async () => {
    // vi.mock("ky") 가 HTTPError instanceof 를 깨므로 NhnCloudCliError 직접 throw (021 선례)
    vi.mocked(ky.get).mockRejectedValueOnce(
      new NhnCloudCliError("API 호출 실패 (401)", EXIT_AUTH_ERROR),
    );

    const client = new HarborClient("id", "secret", "host.example.com");
    await expect(client.listRepositories("proj")).rejects.toMatchObject({
      exitCode: EXIT_AUTH_ERROR,
    });
  });

  it("HTTP 404 → EXIT_API_ERROR (toNhnCloudCliError 매핑 흉내)", async () => {
    vi.mocked(ky.get).mockRejectedValueOnce(
      new NhnCloudCliError("API 호출 실패 (404)", EXIT_API_ERROR),
    );

    const client = new HarborClient("id", "secret", "host.example.com");
    await expect(client.listRepositories("proj")).rejects.toMatchObject({
      exitCode: EXIT_API_ERROR,
    });
  });
});

describe("HarborClient.listArtifacts", () => {
  beforeEach(() => vi.resetAllMocks());

  it("평면 배열 반환 — tags=null dangling artifact 포함", async () => {
    const artifacts = [
      { digest: "sha256:aaa", size: 1024, push_time: "2026-01-01T00:00:00Z", tags: [{ name: "v1.0", push_time: "2026-01-01T00:00:00Z" }] },
      { digest: "sha256:bbb", size: 512, push_time: "2026-01-02T00:00:00Z", tags: null },
    ];
    vi.mocked(ky.get).mockResolvedValueOnce(page(artifacts, false));

    const client = new HarborClient("id", "secret", "host.example.com");
    const result = await client.listArtifacts("proj", "my-repo");
    expect(result).toHaveLength(2);
    // tags=null dangling artifact 도 그대로 반환(flatten 은 command 레벨)
    expect(result[1].tags).toBeNull();
  });

  it("repository 경로의 '/' 를 %2F 로 인코딩 (path-traversal 방지)", async () => {
    vi.mocked(ky.get).mockResolvedValueOnce(page([], false));

    const client = new HarborClient("id", "secret", "host.example.com");
    await client.listArtifacts("proj", "nested/repo");

    // nested/repo → nested%2Frepo
    expect(ky.get).toHaveBeenCalledWith(
      expect.stringContaining("nested%2Frepo"),
      expect.anything(),
    );
  });

  it("비배열 응답 → EXIT_API_ERROR throw", async () => {
    vi.mocked(ky.get).mockResolvedValueOnce(page("not-an-array", false));

    const client = new HarborClient("id", "secret", "host.example.com");
    await expect(client.listArtifacts("proj", "repo")).rejects.toMatchObject({
      exitCode: EXIT_API_ERROR,
    });
  });
});
