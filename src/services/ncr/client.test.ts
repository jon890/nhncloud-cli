import { describe, it, expect, vi, beforeEach } from "vitest";
import ky from "ky";
import { NcrClient } from "./client.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_AUTH_ERROR, EXIT_API_ERROR, EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

vi.mock("ky");

describe("NcrClient.listRegistries", () => {
  beforeEach(() => vi.resetAllMocks());

  it("{ header, registries: [...] } 에서 Registry[] 반환 (nullable uri·string repo_count 수용)", async () => {
    // 실측 확정: body 가 아니라 header 와 나란히 registries named 필드로 온다.
    vi.mocked(ky.get).mockReturnValue({
      json: async () => ({
        header: { isSuccessful: true, resultCode: 0, resultMessage: "OK" },
        registries: [
          { name: "registry-a", repo_count: 3, uri: "example.com/registry-a", private_uri: null },
          { name: "registry-b", repo_count: "0", uri: null },
        ],
      }),
    } as never);

    const client = new NcrClient("uak-id", "uak-secret", "kr1");
    const result = await client.listRegistries("test-appkey");
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("registry-a");
    // 5-6 검증: uri 가 null 이어도 거르지 않는다
    expect(result[1].uri).toBeNull();
    // 6-2 검증: repo_count 가 string 이어도 수용
    expect(result[1].repo_count).toBe("0");
  });

  it("registries 누락 시 빈 배열 반환 (방어)", async () => {
    vi.mocked(ky.get).mockReturnValue({
      json: async () => ({
        header: { isSuccessful: true, resultCode: 0, resultMessage: "OK" },
      }),
    } as never);

    const client = new NcrClient("uak-id", "uak-secret", "kr1");
    const result = await client.listRegistries("test-appkey");
    expect(result).toEqual([]);
  });

  it("isSuccessful=false 면 throw (EXIT_API_ERROR)", async () => {
    vi.mocked(ky.get).mockReturnValue({
      json: async () => ({
        header: { isSuccessful: false, resultCode: 401, resultMessage: "Unauthorized" },
      }),
    } as never);

    const client = new NcrClient("uak-id", "uak-secret", "kr1");
    await expect(client.listRegistries("test-appkey")).rejects.toMatchObject({
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

  it("region host 해석 + 정적 UAK 헤더: kr1-ncr.api.nhncloudservice.com + X-TC-AUTHENTICATION-ID/SECRET", async () => {
    vi.mocked(ky.get).mockReturnValue({
      json: async () => ({
        header: { isSuccessful: true, resultCode: 0, resultMessage: "OK" },
        registries: [],
      }),
    } as never);

    const client = new NcrClient("id", "secret", "kr1");
    await client.listRegistries("appkey");

    expect(ky.get).toHaveBeenCalledWith(
      expect.stringContaining("kr1-ncr.api.nhncloudservice.com"),
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-TC-AUTHENTICATION-ID": "id",
          "X-TC-AUTHENTICATION-SECRET": "secret",
        }),
      }),
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

  it("{ header, registry: {...} } 에서 단일 Registry 반환", async () => {
    vi.mocked(ky.get).mockReturnValue({
      json: async () => ({
        header: { isSuccessful: true, resultCode: 0, resultMessage: "OK" },
        registry: { name: "my-registry", repo_count: 5, uri: "example.com/my-registry", private_uri: null },
      }),
    } as never);

    const client = new NcrClient("uak-id", "uak-secret", "kr1");
    const result = await client.getRegistry("test-appkey", "my-registry");
    expect(result.name).toBe("my-registry");
    expect(result.private_uri).toBeNull();
  });

  it("registry 필드 누락 시 형식 오류 throw (EXIT_API_ERROR)", async () => {
    vi.mocked(ky.get).mockReturnValue({
      json: async () => ({
        header: { isSuccessful: true, resultCode: 0, resultMessage: "OK" },
      }),
    } as never);

    const client = new NcrClient("uak-id", "uak-secret", "kr1");
    await expect(client.getRegistry("test-appkey", "my-registry")).rejects.toMatchObject({
      exitCode: EXIT_API_ERROR,
    });
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
