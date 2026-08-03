import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { output } from "../../formatters/table.js";
import { startSpinner } from "../../utils/spinner.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
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
});
