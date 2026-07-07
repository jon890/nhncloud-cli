import { describe, it, expect, vi, beforeEach } from "vitest";
import ky from "ky";
import { NcsClient } from "./client.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_AUTH_ERROR, EXIT_API_ERROR, EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

vi.mock("ky");

function mockKyResponse(body: unknown, headers: Record<string, string> = {}) {
  return {
    json: async () => body,
    headers: {
      get: (key: string) => headers[key.toLowerCase()] ?? null,
    },
  } as never;
}

describe("NcsClient.listTemplates", () => {
  beforeEach(() => vi.resetAllMocks());

  it("{ header, templates: [...] } 에서 templates 반환 + X-Total-Count 헤더 파싱", async () => {
    vi.mocked(ky.get).mockReturnValue(
      mockKyResponse(
        {
          header: { isSuccessful: true, resultCode: 200, resultMessage: "SUCCESS" },
          templates: [
            { id: "tmpl-1", name: "nginx-template", version: "second", versionCount: 2, workloadCount: 1 },
            { id: "tmpl-2", name: "redis-template", versionCount: "1" },
          ],
        },
        { "x-total-count": "2" },
      ),
    );

    const client = new NcsClient("token", "kr1", "test-appkey");
    const result = await client.listTemplates();
    expect(result.totalCount).toBe(2);
    expect(result.templates).toHaveLength(2);
    expect(result.templates[0].id).toBe("tmpl-1");
    // 6-2 검증: versionCount 가 string 이어도 수용
    expect(result.templates[1].versionCount).toBe("1");
  });

  it("x-nhn-authorization 헤더 포함 단언", async () => {
    vi.mocked(ky.get).mockReturnValue(
      mockKyResponse({
        header: { isSuccessful: true, resultCode: 200, resultMessage: "SUCCESS" },
        templates: [],
      }),
    );

    const client = new NcsClient("my-token", "kr1", "test-appkey");
    await client.listTemplates();

    expect(ky.get).toHaveBeenCalledWith(
      expect.stringContaining("kr1-ncs.api.nhncloudservice.com"),
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-nhn-authorization": "Bearer my-token",
        }),
      }),
    );
  });

  it("templates 누락 시 빈 배열 반환 (방어)", async () => {
    vi.mocked(ky.get).mockReturnValue(
      mockKyResponse({
        header: { isSuccessful: true, resultCode: 200, resultMessage: "SUCCESS" },
      }),
    );

    const client = new NcsClient("token", "kr1", "test-appkey");
    const result = await client.listTemplates();
    expect(result.templates).toEqual([]);
    expect(result.totalCount).toBe(0);
  });

  it("templates 가 비배열(키 형태 변경)이면 형식 오류 throw", async () => {
    vi.mocked(ky.get).mockReturnValue(
      mockKyResponse({
        header: { isSuccessful: true, resultCode: 200, resultMessage: "SUCCESS" },
        templates: { unexpected: "object" },
      }),
    );

    const client = new NcsClient("token", "kr1", "test-appkey");
    await expect(client.listTemplates()).rejects.toMatchObject({
      exitCode: EXIT_API_ERROR,
    });
  });

  it("isSuccessful=false 면 throw (EXIT_API_ERROR)", async () => {
    vi.mocked(ky.get).mockReturnValue(
      mockKyResponse({
        header: { isSuccessful: false, resultCode: 401, resultMessage: "Unauthorized" },
      }),
    );

    const client = new NcsClient("token", "kr1", "test-appkey");
    await expect(client.listTemplates()).rejects.toMatchObject({
      exitCode: EXIT_API_ERROR,
    });
  });

  it("HTTP 401 → EXIT_AUTH_ERROR (toNhnCloudCliError 매핑 흉내)", async () => {
    // vi.mock("ky") 가 HTTPError 까지 자동 mock 해 instanceof 체크가 깨진다.
    // toNhnCloudCliError 가 401 → EXIT_AUTH_ERROR 로 변환한 결과를 직접 주입.
    vi.mocked(ky.get).mockReturnValue({
      json: async () => {
        throw new NhnCloudCliError("API 호출 실패 (401)", EXIT_AUTH_ERROR);
      },
    } as never);

    const client = new NcsClient("token", "kr1", "test-appkey");
    await expect(client.listTemplates()).rejects.toMatchObject({
      exitCode: EXIT_AUTH_ERROR,
    });
  });

  it("HTTP 404(그 외 4xx) → EXIT_API_ERROR (toNhnCloudCliError 매핑 흉내)", async () => {
    vi.mocked(ky.get).mockReturnValue({
      json: async () => {
        throw new NhnCloudCliError("API 호출 실패 (404)", EXIT_API_ERROR);
      },
    } as never);

    const client = new NcsClient("token", "kr1", "test-appkey");
    await expect(client.listTemplates()).rejects.toMatchObject({
      exitCode: EXIT_API_ERROR,
    });
  });

  it("미등록 region('xx') → NcsClient 생성 시 EXIT_PARAM_ERROR", () => {
    expect(() => new NcsClient("token", "xx", "test-appkey")).toThrow(
      expect.objectContaining({ exitCode: EXIT_PARAM_ERROR }),
    );
  });
});

describe("NcsClient.getTemplate", () => {
  beforeEach(() => vi.resetAllMocks());

  it("{ header, template: {...} } 에서 template 반환", async () => {
    vi.mocked(ky.get).mockReturnValue(
      mockKyResponse({
        header: { isSuccessful: true, resultCode: 200, resultMessage: "SUCCESS" },
        template: { id: "tmpl-1", name: "nginx-template", versionCount: 2 },
      }),
    );

    const client = new NcsClient("token", "kr1", "test-appkey");
    const result = await client.getTemplate("tmpl-1");
    expect(result.id).toBe("tmpl-1");
    expect(result.name).toBe("nginx-template");
  });

  it("template 필드 누락 시 형식 오류 throw (EXIT_API_ERROR)", async () => {
    vi.mocked(ky.get).mockReturnValue(
      mockKyResponse({
        header: { isSuccessful: true, resultCode: 200, resultMessage: "SUCCESS" },
      }),
    );

    const client = new NcsClient("token", "kr1", "test-appkey");
    await expect(client.getTemplate("tmpl-1")).rejects.toMatchObject({
      exitCode: EXIT_API_ERROR,
    });
  });
});

describe("NcsClient.listTemplateVersions", () => {
  beforeEach(() => vi.resetAllMocks());

  it("{ header, versions: [...] } 에서 versions 반환 + X-Total-Count 헤더 파싱", async () => {
    vi.mocked(ky.get).mockReturnValue(
      mockKyResponse(
        {
          header: { isSuccessful: true, resultCode: 200, resultMessage: "SUCCESS" },
          versions: [
            { id: "v-1", version: "1", workloadCount: 1 },
            { id: "v-2", version: "second" },
          ],
        },
        { "x-total-count": "2" },
      ),
    );

    const client = new NcsClient("token", "kr1", "test-appkey");
    const result = await client.listTemplateVersions("tmpl-1");
    expect(result.totalCount).toBe(2);
    expect(result.versions).toHaveLength(2);
    expect(result.versions[1].version).toBe("second");
  });

  it("versions 누락 시 빈 배열 반환 (방어)", async () => {
    vi.mocked(ky.get).mockReturnValue(
      mockKyResponse({
        header: { isSuccessful: true, resultCode: 200, resultMessage: "SUCCESS" },
      }),
    );

    const client = new NcsClient("token", "kr1", "test-appkey");
    const result = await client.listTemplateVersions("tmpl-1");
    expect(result.versions).toEqual([]);
    expect(result.totalCount).toBe(0);
  });

  it("versions 가 비배열(키 형태 변경)이면 형식 오류 throw", async () => {
    vi.mocked(ky.get).mockReturnValue(
      mockKyResponse({
        header: { isSuccessful: true, resultCode: 200, resultMessage: "SUCCESS" },
        versions: { unexpected: "object" },
      }),
    );

    const client = new NcsClient("token", "kr1", "test-appkey");
    await expect(client.listTemplateVersions("tmpl-1")).rejects.toMatchObject({
      exitCode: EXIT_API_ERROR,
    });
  });
});

describe("NcsClient.getTemplateVersion", () => {
  beforeEach(() => vi.resetAllMocks());

  it("{ header, version: {...} } 에서 version 반환", async () => {
    vi.mocked(ky.get).mockReturnValue(
      mockKyResponse({
        header: { isSuccessful: true, resultCode: 200, resultMessage: "SUCCESS" },
        version: { id: "v-1", version: "1", workloadCount: 3 },
      }),
    );

    const client = new NcsClient("token", "kr1", "test-appkey");
    const result = await client.getTemplateVersion("tmpl-1", "1");
    expect(result.id).toBe("v-1");
    expect(result.version).toBe("1");
  });

  it("version 필드 누락 시 형식 오류 throw (EXIT_API_ERROR)", async () => {
    vi.mocked(ky.get).mockReturnValue(
      mockKyResponse({
        header: { isSuccessful: true, resultCode: 200, resultMessage: "SUCCESS" },
      }),
    );

    const client = new NcsClient("token", "kr1", "test-appkey");
    await expect(client.getTemplateVersion("tmpl-1", "1")).rejects.toMatchObject({
      exitCode: EXIT_API_ERROR,
    });
  });
});
