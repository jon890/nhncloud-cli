import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { output } from "../../formatters/table.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { startSpinner } from "../../utils/spinner.js";
import { resolveNcsClient } from "./helpers.js";
import { workloadCommand } from "./workload.js";

vi.mock("./helpers.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./helpers.js")>();
  return {
    ...actual,
    resolveNcsClient: vi.fn(),
  };
});

vi.mock("../../formatters/table.js", () => ({ output: vi.fn() }));
vi.mock("../../utils/spinner.js", () => ({
  startSpinner: vi.fn(),
  stopSpinner: vi.fn(),
}));

const getWorkloadLogs = vi.fn();
const getWorkloadEvents = vi.fn();
const client = {
  getWorkloadLogs,
  getWorkloadEvents,
};

function programWithWorkload(): Command {
  const program = new Command("nhncloud")
    .exitOverride()
    .option("--json")
    .option("--quiet");
  const ncs = new Command("ncs");
  ncs.addCommand(workloadCommand);
  program.addCommand(ncs);
  return program;
}

describe("NCS workload logs·events 시간 필터", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveNcsClient).mockResolvedValue({
      client: client as never,
      profileName: "default",
    });
    getWorkloadLogs.mockResolvedValue({ logs: [] });
    getWorkloadEvents.mockResolvedValue({ totalCount: 0, events: [] });
  });

  it("logs의 잘못된 시간을 자격증명·spinner·API 전에 거부한다", async () => {
    await expect(
      programWithWorkload().parseAsync([
        "node",
        "nhncloud",
        "ncs",
        "workload",
        "logs",
        "workload-1",
        "--task",
        "task-1",
        "--container",
        "app",
        "--from",
        "2026-07-28T12:00:00",
      ]),
    ).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });

    expect(resolveNcsClient).not.toHaveBeenCalled();
    expect(startSpinner).not.toHaveBeenCalled();
    expect(getWorkloadLogs).not.toHaveBeenCalled();
  });

  it("events의 존재하지 않는 날짜를 자격증명·spinner·API 전에 거부한다", async () => {
    await expect(
      programWithWorkload().parseAsync([
        "node",
        "nhncloud",
        "ncs",
        "workload",
        "events",
        "workload-1",
        "--task",
        "task-1",
        "--from",
        "2026-02-30T00:00:00Z",
      ]),
    ).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });

    expect(resolveNcsClient).not.toHaveBeenCalled();
    expect(startSpinner).not.toHaveBeenCalled();
    expect(getWorkloadEvents).not.toHaveBeenCalled();
  });

  it("logs에 UTC로 정규화된 시간만 전달한다", async () => {
    await programWithWorkload().parseAsync([
      "node",
      "nhncloud",
      "--json",
      "ncs",
      "workload",
      "logs",
      "workload-1",
      "--task",
      "task-1",
      "--container",
      "app",
      "--from",
      "2026-07-28T21:00:00.987+09:00",
      "--to",
      "2026-07-28T12:30:00Z",
    ]);

    expect(getWorkloadLogs).toHaveBeenCalledWith("workload-1", "task-1", {
      container: "app",
      from: "2026-07-28T12:00:00Z",
      to: "2026-07-28T12:30:00Z",
      page: undefined,
      size: undefined,
    });
    expect(output).toHaveBeenCalled();
  });

  it("events에 UTC로 정규화된 시간만 전달한다", async () => {
    await programWithWorkload().parseAsync([
      "node",
      "nhncloud",
      "ncs",
      "workload",
      "events",
      "workload-1",
      "--task",
      "task-1",
      "--from",
      "2026-07-28T12:00:00Z",
      "--to",
      "2026-07-28T21:30:00+09:00",
    ]);

    expect(getWorkloadEvents).toHaveBeenCalledWith("workload-1", "task-1", {
      type: undefined,
      q: undefined,
      from: "2026-07-28T12:00:00Z",
      to: "2026-07-28T12:30:00Z",
      page: undefined,
      size: undefined,
    });
  });

  it("help에 허용 형식·UTC 정규화·생략 계약을 표시한다", () => {
    const logs = workloadCommand.commands.find((command) => command.name() === "logs");
    const events = workloadCommand.commands.find((command) => command.name() === "events");

    for (const command of [logs, events]) {
      const help = (command?.helpInformation() ?? "").replace(/\s+/g, " ");
      expect(help).toContain("시간대 포함 RFC3339");
      expect(help).toContain("30m/1h/2d/now");
      expect(help).toContain("UTC Z로 정규화");
      expect(help).toContain("생략 시 API 기본 범위");
    }
  });
});
