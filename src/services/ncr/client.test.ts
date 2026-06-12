import { describe, it, expect, vi, beforeEach } from "vitest";
import ky from "ky";
import { NcrClient } from "./client.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_AUTH_ERROR, EXIT_API_ERROR, EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

vi.mock("ky");

describe("NcrClient.listRegistries", () => {
  beforeEach(() => vi.resetAllMocks());

  it("봉투 unwrap 후 Registry[] 반환 — body 가 배열 형태", async () => {
    vi.mocked(ky.get).mockReturnValue({
      json: async () => ({
        header: { isSuccessful: true, resultCode: 0, resultMessage: "OK" },
        body: [{ name: "my-registry", repo_count: 3, uri: "kr1-ncr.example.com/my-registry" }],
      }),
    } as never);

    const client = new NcrClient("uak-id", "uak-secret", "kr1");
    const result = await client.listRegistries("test-appkey");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("my-registry");
    expect(result[0].repo_count).toBe(3);
  });

  it("봉투 unwrap 후 Registry[] 반환 — body 가 { registries: [...] } 형태", async () => {
    vi.mocked(ky.get).mockReturnValue({
      json: async () => ({
        header: { isSuccessful: true, resultCode: 0, resultMessage: "OK" },
        body: {
          registries: [
            { name: "registry-a", repo_count: 1, uri: null },
            { name: "registry-b", repo_count: "0", uri: "example.com/b", private_uri: null },
          ],
        },
      }),
    } as never);

    const client = new NcrClient("uak-id", "uak-secret", "kr1");
    const result = await client.listRegistries("test-appkey");
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("registry-a");
    // 5-6 검증: uri 가 null 이어도 거르지 않는다
    expect(result[0].uri).toBeNull();
    // 6-2 검증: repo_count 가 string 이어도 수용
    expect(result[1].repo_count).toBe("0");
  });

  it("isSuccessful=false 면 throw", async () => {
    vi.mocked(ky.get).mockReturnValue({
      json: async () => ({
        header: { isSuccessful: false, resultCode: 401, resultMessage: "Unauthorized" },
      }),
    } as never);

    const client = new NcrClient("uak-id", "uak-secret", "kr1");
    await expect(client.listRegistries("test-appkey")).rejects.toBeInstanceOf(NhnCloudCliError);
  });

  it("HTTP 401 → EXIT_AUTH_ERROR (toNhnCloudCliError 매핑 흉내)", async () => {
    // vi.mock("ky") 가 HTTPError 까지 자동 mock 해 instanceof 체크가 깨진다.
    // toNhnCloudCliError 가 401 → EXIT_AUTH_ERROR 로 변환한 결과를 직접 주입.
    vi.mocked(ky.get).mockReturnValue({
      json: async () => {
        throw new NhnCloudCliError("API 호출 실패 (401)", EXIT_AUTH_ERROR);
      },
    } as never);

    const client = new NcrClient("uak-id", "uak-secret", "kr1");
    await expect(client.listRegistries("test-appkey")).rejects.toMatchObject({
      exitCode: EXIT_AUTH_ERROR,
    });
  });

  it("HTTP 404 → EXIT_API_ERROR (toNhnCloudCliError 매핑 흉내)", async () => {
    vi.mocked(ky.get).mockReturnValue({
      json: async () => {
        throw new NhnCloudCliError("API 호출 실패 (404)", EXIT_API_ERROR);
      },
    } as never);

    const client = new NcrClient("uak-id", "uak-secret", "kr1");
    await expect(client.listRegistries("test-appkey")).rejects.toMatchObject({
      exitCode: EXIT_API_ERROR,
    });
  });

  it("region host 해석: kr1 → kr1-ncr.api.nhncloudservice.com 호출", async () => {
    vi.mocked(ky.get).mockReturnValue({
      json: async () => ({
        header: { isSuccessful: true, resultCode: 0, resultMessage: "OK" },
        body: [],
      }),
    } as never);

    const client = new NcrClient("id", "secret", "kr1");
    await client.listRegistries("appkey");

    expect(ky.get).toHaveBeenCalledWith(
      expect.stringContaining("kr1-ncr.api.nhncloudservice.com"),
      expect.any(Object),
    );
  });

  it("미등록 region('xx') → NcrClient 생성 시 EXIT_PARAM_ERROR", () => {
    expect(() => new NcrClient("id", "secret", "xx")).toThrow(
      expect.objectContaining({ exitCode: EXIT_PARAM_ERROR }),
    );
  });
});

describe("NcrClient.getRegistry", () => {
  beforeEach(() => vi.resetAllMocks());

  it("단일 레지스트리 반환 — body 가 Registry 직접", async () => {
    vi.mocked(ky.get).mockReturnValue({
      json: async () => ({
        header: { isSuccessful: true, resultCode: 0, resultMessage: "OK" },
        body: { name: "my-registry", repo_count: 5, uri: "example.com/my-registry", private_uri: null },
      }),
    } as never);

    const client = new NcrClient("uak-id", "uak-secret", "kr1");
    const result = await client.getRegistry("test-appkey", "my-registry");
    expect(result.name).toBe("my-registry");
    expect(result.private_uri).toBeNull();
  });

  it("단일 레지스트리 반환 — body 가 { registry: {...} } 형태", async () => {
    vi.mocked(ky.get).mockReturnValue({
      json: async () => ({
        header: { isSuccessful: true, resultCode: 0, resultMessage: "OK" },
        body: {
          registry: { name: "wrapped-registry", repo_count: "2", uri: null },
        },
      }),
    } as never);

    const client = new NcrClient("uak-id", "uak-secret", "kr1");
    const result = await client.getRegistry("test-appkey", "wrapped-registry");
    expect(result.name).toBe("wrapped-registry");
  });

  it("HTTP 401 → EXIT_AUTH_ERROR (toNhnCloudCliError 매핑 흉내)", async () => {
    vi.mocked(ky.get).mockReturnValue({
      json: async () => {
        throw new NhnCloudCliError("API 호출 실패 (401)", EXIT_AUTH_ERROR);
      },
    } as never);

    const client = new NcrClient("uak-id", "uak-secret", "kr1");
    await expect(client.getRegistry("test-appkey", "my-registry")).rejects.toMatchObject({
      exitCode: EXIT_AUTH_ERROR,
    });
  });
});
