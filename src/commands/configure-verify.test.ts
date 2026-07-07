import { describe, it, expect, vi, beforeEach } from "vitest";
import ky from "ky";
import { verifyNcs } from "./configure-verify.js";
import { NhnCloudCliError } from "../utils/errors.js";
import { EXIT_AUTH_ERROR } from "../utils/exit-codes.js";

vi.mock("ky");

function mockKyJsonResponse(body: unknown) {
  return { json: async () => body } as never;
}

describe("verifyNcs", () => {
  beforeEach(() => vi.resetAllMocks());

  it("appkey 가 빈 문자열이면 OAuth/NCS 호출 없이 false", async () => {
    const ok = await verifyNcs({ id: "uak-id", secret: "uak-secret" }, "");
    expect(ok).toBe(false);
    expect(ky.post).not.toHaveBeenCalled();
    expect(ky.get).not.toHaveBeenCalled();
  });

  it("OAuth 토큰 교환 + listTemplates 성공 시 true", async () => {
    vi.mocked(ky.post).mockReturnValue(
      mockKyJsonResponse({
        access_token: "test-token",
        expires_in: 3600,
        token_type: "Bearer",
      }),
    );
    vi.mocked(ky.get).mockReturnValue({
      json: async () => ({
        header: { isSuccessful: true, resultCode: 200, resultMessage: "SUCCESS" },
        templates: [],
      }),
      headers: { get: () => null },
    } as never);

    const ok = await verifyNcs({ id: "uak-id", secret: "uak-secret" }, "test-appkey");
    expect(ok).toBe(true);

    // 캐시 우회(forceRefresh=true) 확인 — OAuth 를 직접 호출했는지
    expect(ky.post).toHaveBeenCalledWith(
      expect.stringContaining("oauth2/token/create"),
      expect.anything(),
    );
  });

  it("OAuth 401 인증 실패 시 false", async () => {
    // vi.mock("ky") 가 HTTPError 까지 자동 mock 해 instanceof 체크가 깨진다(ncr/client.test.ts 와 동일 사유).
    // toNhnCloudCliError 가 401 → EXIT_AUTH_ERROR 로 변환한 결과를 직접 주입.
    vi.mocked(ky.post).mockImplementation(() => {
      throw new NhnCloudCliError("API 호출 실패 (401)", EXIT_AUTH_ERROR);
    });

    const ok = await verifyNcs({ id: "uak-id", secret: "uak-secret" }, "test-appkey");
    expect(ok).toBe(false);
  });
});
