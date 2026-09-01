import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { output } from "../../formatters/table.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_API_ERROR } from "../../utils/exit-codes.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { resolveLogncrashClient } from "./helpers.js";
import { availableTokenCommand } from "./available-token.js";

vi.mock("./helpers.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./helpers.js")>();
  return { ...actual, resolveLogncrashClient: vi.fn() };
});
vi.mock("../../formatters/table.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../formatters/table.js")>();
  return { ...actual, output: vi.fn() };
});
vi.mock("../../utils/spinner.js", () => ({
  startSpinner: vi.fn(() => ({})),
  stopSpinner: vi.fn(),
}));

const availableToken = vi.fn();
const client = { availableToken };

function programWithAvailableToken(): Command {
  return new Command("nhncloud")
    .exitOverride()
    .option("--json")
    .option("--quiet")
    .addCommand(availableTokenCommand);
}

describe("logncrash available-token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveLogncrashClient).mockResolvedValue(client as never);
    availableToken.mockResolvedValue({ availableToken: 10 });
  });

  it.each([
    ["기본", [], {}],
    ["JSON", ["--json"], { json: true }],
    ["quiet", ["--quiet"], { quiet: true }],
  ])("%s 출력에 raw 상태와 quiet 값을 전달한다", async (_name, globals, expectedOpts) => {
    await programWithAvailableToken().parseAsync([
      "node",
      "nhncloud",
      ...globals,
      "available-token",
      "--profile",
      "profile-a",
    ]);

    expect(resolveLogncrashClient).toHaveBeenCalledWith("profile-a");
    expect(output).toHaveBeenCalledWith(
      expect.objectContaining(expectedOpts),
      {
        headers: ["항목", "값"],
        rows: [
          ["남은 조회 토큰", "10"],
          ["양수까지 추정 대기 시간(초)", "대기 불필요"],
        ],
        raw: { availableToken: 10, estimatedWaitSeconds: null },
        ids: ["10"],
      },
    );
  });

  it("음수 잔량도 정상 결과와 추정 대기 시간으로 출력한다", async () => {
    availableToken.mockResolvedValue({ availableToken: -2_302 });

    await programWithAvailableToken().parseAsync(["node", "nhncloud", "available-token"]);

    expect(output).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        raw: { availableToken: -2_302, estimatedWaitSeconds: 1_440 },
        ids: ["-2302"],
      }),
    );
    expect(stopSpinner).toHaveBeenCalledWith(true);
  });

  it("API 오류에서 spinner를 실패로 닫고 원래 오류를 전달한다", async () => {
    const error = new NhnCloudCliError("조회 실패", EXIT_API_ERROR);
    availableToken.mockRejectedValue(error);

    await expect(
      programWithAvailableToken().parseAsync(["node", "nhncloud", "available-token"]),
    ).rejects.toBe(error);

    expect(startSpinner).toHaveBeenCalledWith("조회 토큰 확인 중...");
    expect(stopSpinner).toHaveBeenCalledWith(false);
    expect(output).not.toHaveBeenCalled();
  });
});
