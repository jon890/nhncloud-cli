import { describe, it, expect, vi, beforeEach } from "vitest";
import ky from "ky";
import { DeployClient } from "./client.js";

vi.mock("ky");

describe("DeployClient.artifacts", () => {
  beforeEach(() => vi.resetAllMocks());

  it("봉투를 unwrap 해 body 를 반환", async () => {
    vi.mocked(ky.get).mockReturnValue({
      json: async () => ({
        header: { isSuccessful: true, resultCode: 0, resultMessage: "OK" },
        body: { artifacts: [{ id: "a1" }] },
      }),
    } as never);

    const client = new DeployClient("token");
    const res = await client.artifacts("appkey");
    expect(res).toEqual({ artifacts: [{ id: "a1" }] });
  });

  it("isSuccessful=false 면 throw", async () => {
    vi.mocked(ky.get).mockReturnValue({
      json: async () => ({
        header: { isSuccessful: false, resultCode: "ERROR", resultMessage: "fail" },
      }),
    } as never);

    const client = new DeployClient("token");
    await expect(client.artifacts("appkey")).rejects.toThrow();
  });
});
