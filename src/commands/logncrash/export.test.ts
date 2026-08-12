import { Command } from "commander";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_API_ERROR, EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { LogncrashServerError } from "../../services/logncrash/errors.js";
import { startSpinner } from "../../utils/spinner.js";
import { resolveLogncrashClient } from "./helpers.js";
import { exportCommand } from "./export.js";

vi.mock("./helpers.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./helpers.js")>();
  return { ...actual, resolveLogncrashClient: vi.fn() };
});
vi.mock("../../utils/spinner.js", () => ({
  startSpinner: vi.fn(() => ({ text: "" })),
  stopSpinner: vi.fn(),
}));

const scrollStart = vi.fn();
const scrollNext = vi.fn();
const client = { scrollStart, scrollNext };
let directory: string;

function programWithExport(): Command {
  return new Command("nhncloud").exitOverride().addCommand(exportCommand);
}

function args(output: string, extra: string[] = []): string[] {
  return [
    "node",
    "nhncloud",
    "export",
    "--query",
    "*",
    "--from",
    "2026-08-03T00:00:00Z",
    "--to",
    "2026-08-03T01:00:00Z",
    "--output",
    output,
    ...extra,
  ];
}

describe("logncrash export v3 scroll", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    directory = mkdtempSync(join(tmpdir(), "logncrash-export-test-"));
    vi.mocked(resolveLogncrashClient).mockResolvedValue(client as never);
    scrollStart.mockResolvedValue({ totalItems: 0, pageSize: 10, data: [] });
    scrollNext.mockResolvedValue({ totalItems: 0, data: [] });
    vi.spyOn(process.stderr, "write").mockImplementation((() => true) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(directory, { recursive: true, force: true });
  });

  it("--size 생략 시 경고 없이 scroll 시작 body에 query/from/to만 전달한다", async () => {
    const output = join(directory, "logs.jsonl");
    await programWithExport().parseAsync(args(output));

    expect(scrollStart).toHaveBeenCalledWith({
      query: "*",
      from: "2026-08-03T00:00:00Z",
      to: "2026-08-03T01:00:00Z",
    });
    expect(String(vi.mocked(process.stderr.write).mock.calls.flat())).not.toContain("폐기 예정");
    expect(readFileSync(output, "utf-8")).toBe("");
  });

  it("--size 100은 한 번 경고하지만 scroll body에는 넣지 않는다", async () => {
    const output = join(directory, "logs.jsonl");
    await programWithExport().parseAsync(args(output, ["--size", "100"]));

    const warnings = vi.mocked(process.stderr.write).mock.calls
      .map(([message]) => String(message))
      .filter((message) => message.includes("폐기 예정"));
    expect(warnings).toHaveLength(1);
    expect(scrollStart.mock.calls[0]?.[0]).not.toHaveProperty("pageSize");
  });

  it("범위 밖 --size를 자격증명·파일·API 전에 거부한다", async () => {
    const output = join(directory, "logs.jsonl");
    await expect(
      programWithExport().parseAsync(args(output, ["--size", "101"])),
    ).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });

    expect(resolveLogncrashClient).not.toHaveBeenCalled();
    expect(startSpinner).not.toHaveBeenCalled();
    expect(scrollStart).not.toHaveBeenCalled();
    expect(readdirSync(directory)).toEqual([]);
  });

  it("pageSize 없는 다음 응답을 처리하고 빈 data 또는 전체 건수에서 종료한다", async () => {
    scrollStart.mockResolvedValue({
      scrollKey: "scroll-1",
      totalItems: 2,
      pageSize: 10,
      data: [{ id: 1 }],
    });
    scrollNext.mockResolvedValue({ totalItems: 2, data: [{ id: 2 }] });
    const output = join(directory, "logs.jsonl");

    await programWithExport().parseAsync(args(output));

    expect(scrollNext).toHaveBeenCalledWith("scroll-1");
    expect(readFileSync(output, "utf-8")).toBe('{"id":1}\n{"id":2}\n');
  });

  it("다음 페이지 실패 시 임시 파일을 정리하고 원본 오류를 보존한다", async () => {
    scrollStart.mockResolvedValue({
      scrollKey: "scroll-1",
      totalItems: 2,
      data: [{ id: 1 }],
    });
    scrollNext.mockRejectedValue(
      new NhnCloudCliError("upstream 503", EXIT_API_ERROR),
    );
    const output = join(directory, "logs.jsonl");

    await expect(programWithExport().parseAsync(args(output))).rejects.toMatchObject({
      exitCode: EXIT_API_ERROR,
      message: expect.stringContaining("upstream 503"),
    });
    expect(scrollStart).toHaveBeenCalledTimes(1);
    expect(readdirSync(directory)).toEqual([]);
  });

  it("첫 500 뒤 절반 창으로 재시도해 전체 범위를 추출한다", async () => {
    scrollStart
      .mockRejectedValueOnce(new LogncrashServerError("server 500", "req-1"))
      .mockResolvedValueOnce({ totalItems: 1, data: [{ id: 1 }] })
      .mockResolvedValueOnce({ totalItems: 1, data: [{ id: 2 }] });
    const output = join(directory, "logs.jsonl");

    await programWithExport().parseAsync(args(output));

    expect(scrollStart.mock.calls.map(([body]) => body)).toEqual([
      { query: "*", from: "2026-08-03T00:00:00Z", to: "2026-08-03T01:00:00Z" },
      { query: "*", from: "2026-08-03T00:00:00Z", to: "2026-08-03T00:30:00Z" },
      { query: "*", from: "2026-08-03T00:30:00Z", to: "2026-08-03T01:00:00Z" },
    ]);
    expect(readFileSync(output, "utf-8")).toBe('{"id":1}\n{"id":2}\n');
  });

  it("찾아낸 성공 창 크기를 남은 구간에 재사용한다", async () => {
    scrollStart
      .mockRejectedValueOnce(new LogncrashServerError("server 500", null))
      .mockRejectedValueOnce(new LogncrashServerError("server 500", null))
      .mockResolvedValue({ totalItems: 0, data: [] });
    const output = join(directory, "logs.jsonl");

    await programWithExport().parseAsync(args(output));

    expect(scrollStart.mock.calls.slice(2).map(([body]) => body)).toEqual([
      { query: "*", from: "2026-08-03T00:00:00Z", to: "2026-08-03T00:15:00Z" },
      { query: "*", from: "2026-08-03T00:15:00Z", to: "2026-08-03T00:30:00Z" },
      { query: "*", from: "2026-08-03T00:30:00Z", to: "2026-08-03T00:45:00Z" },
      { query: "*", from: "2026-08-03T00:45:00Z", to: "2026-08-03T01:00:00Z" },
    ]);
  });

  it("최소 창에서도 500이면 실패하고 결과와 임시 파일을 남기지 않는다", async () => {
    scrollStart.mockRejectedValue(new LogncrashServerError("server 500", null));
    const output = join(directory, "logs.jsonl");

    await expect(programWithExport().parseAsync(args(output))).rejects.toBeInstanceOf(
      LogncrashServerError,
    );

    expect(scrollStart).toHaveBeenCalledTimes(3);
    expect(existsSync(output)).toBe(false);
    expect(readdirSync(directory)).toEqual([]);
  });

  it("scrollNext에서 일부를 쓴 뒤 500이어도 분할하고 실패 창의 로그를 되돌린다", async () => {
    scrollStart
      .mockResolvedValueOnce({ totalItems: 3, scrollKey: "full-1", data: [{ id: 1 }] })
      .mockResolvedValueOnce({ totalItems: 2, data: [{ id: 1 }, { id: 2 }] })
      .mockResolvedValueOnce({ totalItems: 1, data: [{ id: 3 }] });
    scrollNext
      .mockResolvedValueOnce({ totalItems: 3, scrollKey: "full-2", data: [{ id: 2 }] })
      .mockRejectedValueOnce(new LogncrashServerError("next 500", "req-next"));
    const output = join(directory, "logs.jsonl");

    await programWithExport().parseAsync(args(output));

    expect(scrollNext).toHaveBeenCalledTimes(2);
    expect(readFileSync(output, "utf-8")).toBe('{"id":1}\n{"id":2}\n{"id":3}\n');
  });

  it("여러 창의 totalItems를 누적해 진행률 분모를 유지한다", async () => {
    scrollStart
      .mockRejectedValueOnce(new LogncrashServerError("server 500", null))
      .mockResolvedValueOnce({ totalItems: 2, data: [{ id: 1 }, { id: 2 }] })
      .mockResolvedValueOnce({ totalItems: 3, data: [{ id: 3 }, { id: 4 }, { id: 5 }] });
    const output = join(directory, "logs.jsonl");

    await programWithExport().parseAsync(args(output));

    const spinner = vi.mocked(startSpinner).mock.results[0]?.value as { text: string };
    expect(spinner.text).toContain("5/5");
  });

  it("500이 아닌 scrollStart 오류는 분할 재시도하지 않는다", async () => {
    const error = new NhnCloudCliError("unauthorized", EXIT_API_ERROR);
    scrollStart.mockRejectedValue(error);
    const output = join(directory, "logs.jsonl");

    await expect(programWithExport().parseAsync(args(output))).rejects.toBe(error);

    expect(scrollStart).toHaveBeenCalledTimes(1);
    expect(readdirSync(directory)).toEqual([]);
  });

  it("JSON 형식은 여러 창에서도 하나의 올바른 배열을 만든다", async () => {
    scrollStart
      .mockRejectedValueOnce(new LogncrashServerError("server 500", null))
      .mockResolvedValueOnce({ totalItems: 1, data: [{ id: 1 }] })
      .mockResolvedValueOnce({ totalItems: 1, data: [{ id: 2 }] });
    const output = join(directory, "logs.json");

    await programWithExport().parseAsync(args(output, ["--format", "json"]));

    expect(JSON.parse(readFileSync(output, "utf-8"))).toEqual([{ id: 1 }, { id: 2 }]);
    expect(readFileSync(output, "utf-8")).toBe('[{"id":1},{"id":2}]\n');
  });
});
