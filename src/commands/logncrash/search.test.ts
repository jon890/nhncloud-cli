import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { output } from "../../formatters/table.js";
import { LogncrashServerError } from "../../services/logncrash/errors.js";
import { NhnEnvelopeError } from "../../api/envelope.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { startSpinner } from "../../utils/spinner.js";
import { EXIT_API_ERROR, EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { resolveLogncrashClient } from "./helpers.js";
import { searchCommand } from "./search.js";

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

const cursorSearch = vi.fn();
const client = { cursorSearch };

function programWithSearch(): Command {
  return new Command("nhncloud")
    .exitOverride()
    .option("--json")
    .option("--quiet")
    .addCommand(searchCommand);
}

function baseArgs(): string[] {
  return [
    "node",
    "nhncloud",
    "search",
    "--query",
    "*",
    "--from",
    "2026-08-03T00:00:00Z",
    "--to",
    "2026-08-03T01:00:00Z",
  ];
}

describe("logncrash search v3 cursor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveLogncrashClient).mockResolvedValue(client as never);
    cursorSearch.mockResolvedValue({
      totalItems: 1,
      pageNumber: 0,
      pageSize: 10,
      data: [{ logTime: "2026-08-03T00:30:00Z", logType: "NORMAL", logBody: "hello" }],
    });
  });

  it.each([
    ["--page 1", ["--page", "1"]],
    ["빈 cursor", ["--cursor", ""]],
  ])("%s를 자격증명·spinner·API 전에 거부한다", async (_name, extra) => {
    await expect(
      programWithSearch().parseAsync([...baseArgs(), ...extra]),
    ).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });

    expect(resolveLogncrashClient).not.toHaveBeenCalled();
    expect(startSpinner).not.toHaveBeenCalled();
    expect(cursorSearch).not.toHaveBeenCalled();
  });

  it("첫 페이지는 cursor를 생략하고 JSON raw에도 nextCursor를 만들지 않는다", async () => {
    await programWithSearch().parseAsync([
      "node",
      "nhncloud",
      "--json",
      ...baseArgs().slice(2),
      "--size",
      "1",
      "--profile",
      "profile-a",
    ]);

    expect(resolveLogncrashClient).toHaveBeenCalledWith("profile-a");
    expect(cursorSearch).toHaveBeenCalledWith({
      query: "*",
      from: "2026-08-03T00:00:00Z",
      to: "2026-08-03T01:00:00Z",
      pageSize: 1,
    });
    const raw = vi.mocked(output).mock.calls[0]?.[1].raw as Record<string, unknown>;
    expect(raw).not.toHaveProperty("nextCursor");
  });

  it("opaque cursor를 변형 없이 전달하고 기존 table·quiet 식별 값을 유지한다", async () => {
    const nextCursor = "opaque+/=cursor";
    cursorSearch.mockResolvedValue({
      totalItems: 2,
      pageNumber: 0,
      pageSize: 10,
      data: [{ logTime: "2026-08-03T00:30:00Z", logType: "NORMAL", logBody: "hello" }],
      nextCursor,
    });

    await programWithSearch().parseAsync([
      "node",
      "nhncloud",
      "--quiet",
      ...baseArgs().slice(2),
      "--cursor",
      nextCursor,
    ]);

    expect(cursorSearch).toHaveBeenCalledWith(expect.objectContaining({ cursor: nextCursor }));
    expect(output).toHaveBeenCalledWith(
      expect.objectContaining({ quiet: true }),
      expect.objectContaining({
        headers: ["logTime", "logType", "본문 요약"],
        rows: [["2026-08-03T00:30:00Z", "NORMAL", "hello"]],
        ids: ["2026-08-03T00:30:00Z"],
        raw: expect.objectContaining({ nextCursor }),
      }),
    );
  });

  it("500에는 추정 안내와 정제한 requestId를 붙여 다시 던진다", async () => {
    cursorSearch.mockRejectedValue(
      new LogncrashServerError("API 호출 실패 (500)", "request\n-id"),
    );

    await expect(programWithSearch().parseAsync(baseArgs())).rejects.toMatchObject({
      requestId: "request?-id",
      message: expect.stringMatching(
        /API 호출 실패 \(500\).*검색 기간이 넓어.*export.*requestId: request\?-id/s,
      ),
    });
  });

  it("requestId가 null인 500에는 requestId 부분 없이 추정 안내만 붙인다", async () => {
    cursorSearch.mockRejectedValue(
      new LogncrashServerError("API 호출 실패 (500)", null),
    );

    await expect(programWithSearch().parseAsync(baseArgs())).rejects.toMatchObject({
      requestId: null,
      message: expect.stringMatching(
        /^(?!.*requestId:).*검색 기간이 넓어 서버가 처리하지 못했을 수 있습니다/s,
      ),
    });
  });

  it("401은 안내를 붙이지 않고 원본 오류를 그대로 전달한다", async () => {
    const error = new NhnCloudCliError("인증 실패 (401)", EXIT_API_ERROR);
    cursorSearch.mockRejectedValue(error);

    await expect(programWithSearch().parseAsync(baseArgs())).rejects.toBe(error);
  });

  // ADR-032: rate limit 은 기간을 좁혀도 풀리지 않는다. 500 안내를 붙이면 반대 방향이다.
  it("rate limit 에는 기간을 좁히라고 안내하지 않고 시간을 두라고 알린다", async () => {
    cursorSearch.mockRejectedValue(
      new NhnEnvelopeError(429, "Rate limit exceeded. Please try again later."),
    );

    await expect(programWithSearch().parseAsync(baseArgs())).rejects.toMatchObject({
      exitCode: EXIT_API_ERROR,
      message: expect.stringContaining("시간을 두고 다시 실행하세요"),
    });
    await expect(programWithSearch().parseAsync(baseArgs())).rejects.toMatchObject({
      message: expect.not.stringContaining("검색 기간이 넓어"),
    });
  });

  // 판별 없이 모든 봉투 오류를 감싸는 구현을 막는다.
  it("rate limit 이 아닌 봉투 오류에는 그 안내가 붙지 않는다", async () => {
    cursorSearch.mockRejectedValue(new NhnEnvelopeError(-401, "Authentication failed."));

    await expect(programWithSearch().parseAsync(baseArgs())).rejects.toMatchObject({
      message: expect.not.stringContaining("조회 횟수 제한"),
    });
  });
});
