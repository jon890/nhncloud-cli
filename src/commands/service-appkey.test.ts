import { beforeEach, describe, expect, it, vi } from "vitest";
import { NhnCloudCliError } from "../utils/errors.js";
import { EXIT_CONFIG_ERROR } from "../utils/exit-codes.js";

const mocks = vi.hoisted(() => ({
  getOptionalServiceCredential: vi.fn(),
}));

vi.mock("../config/credentials.js", () => ({
  getOptionalServiceCredential: mocks.getOptionalServiceCredential,
}));

import { resolveApiGatewayAppKey } from "./apigateway/helpers.js";
import { resolveDeployAppKey } from "./deploy/helpers.js";
import { resolveAppKey } from "./ncr/helpers.js";
import { resolveNcsAppKey } from "./ncs/helpers.js";
import { resolveServiceAppKey } from "./service-appkey.js";

async function captureError(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (err) {
    return err;
  }
  throw new Error("오류를 던질 것으로 기대했는데 정상 종료했다.");
}

describe("resolveServiceAppKey", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("비어 있지 않은 appkey를 반환한다", async () => {
    mocks.getOptionalServiceCredential.mockResolvedValue({ appkey: "<appkey>" });

    await expect(resolveServiceAppKey("ncr", "p", "missing")).resolves.toBe("<appkey>");
    expect(mocks.getOptionalServiceCredential).toHaveBeenCalledWith("ncr", "p");
  });

  it("서비스 블록이 없으면 서비스별 안내 오류를 던진다", async () => {
    mocks.getOptionalServiceCredential.mockResolvedValue(undefined);

    const err = await captureError(() => resolveServiceAppKey("ncr", "p", "missing ncr"));

    expect(err).toMatchObject({ exitCode: EXIT_CONFIG_ERROR, message: "missing ncr" });
  });

  it.each([undefined, ""])("appkey가 %j이면 서비스별 안내 오류를 던진다", async (appkey) => {
    mocks.getOptionalServiceCredential.mockResolvedValue({ appkey });

    const err = await captureError(() => resolveServiceAppKey("ncr", "p", "missing ncr"));

    expect(err).toMatchObject({ exitCode: EXIT_CONFIG_ERROR, message: "missing ncr" });
  });

  it("config 조회 오류 객체를 그대로 보존한다", async () => {
    const cause = new NhnCloudCliError("profile 오류", EXIT_CONFIG_ERROR);
    mocks.getOptionalServiceCredential.mockRejectedValue(cause);

    await expect(resolveServiceAppKey("ncr", "p", "missing ncr")).rejects.toBe(cause);
  });
});

describe("서비스별 appkey wrapper", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it.each([
    ["ncr", resolveAppKey, "ncr", "nhncloud configure --ncr-appkey <key> 를 실행해 설정하세요."],
    [
      "ncs",
      resolveNcsAppKey,
      "ncs",
      "NCS appKey 가 없습니다. nhncloud configure --ncs-appkey <key> 를 실행해 설정하세요.",
    ],
    [
      "apigateway",
      resolveApiGatewayAppKey,
      "apigateway",
      "API Gateway appKey가 없습니다. nhncloud configure --apigateway-appkey <key>로 설정하세요.",
    ],
    [
      "deploy",
      resolveDeployAppKey,
      "deploy",
      "nhncloud configure --deploy-appkey <key> 를 실행해 설정하세요.",
    ],
  ])("%s wrapper는 서비스 키와 기존 설정 안내를 유지한다", async (_label, resolver, service, message) => {
    mocks.getOptionalServiceCredential.mockResolvedValue(undefined);

    const err = await captureError(() => resolver("p"));

    expect(mocks.getOptionalServiceCredential).toHaveBeenCalledWith(service, "p");
    expect(err).toMatchObject({
      exitCode: EXIT_CONFIG_ERROR,
      message: expect.stringContaining(message),
    });
  });
});
