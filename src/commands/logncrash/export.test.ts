import { Command } from "commander";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NhnEnvelopeError } from "../../api/envelope.js";
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
    // 받은 1건은 .partial 로 보존하고 임시 파일은 남기지 않는다.
    expect(readdirSync(directory)).toEqual(["logs.jsonl.partial"]);
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

  it("상한에 도달하면 남은 창을 조회하지 않고 절단 경고를 남긴다", async () => {
    scrollStart
      .mockRejectedValueOnce(new LogncrashServerError("server 500", null))
      .mockResolvedValueOnce({
        totalItems: 100_000,
        data: Array(100_000).fill({ id: 1 }),
      });
    const output = join(directory, "logs.jsonl");

    await programWithExport().parseAsync(args(output));

    expect(scrollStart).toHaveBeenCalledTimes(2);
    expect(vi.mocked(process.stderr.write).mock.calls.flat().join(" ")).toContain(
      "남은 창을 조회하지 않은 채 상한 100000건까지만 추출했습니다",
    );
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

  describe("조회 횟수 제한과 부분 결과 보존 (ADR-032)", () => {
    const rateLimit = (): NhnEnvelopeError =>
      new NhnEnvelopeError(429, "Rate limit exceeded.");

    function stderrText(): string {
      return vi
        .mocked(process.stderr.write)
        .mock.calls.map(([message]) => String(message))
        .join("");
    }

    it("일부를 받은 뒤 실패하면 .partial 에 남기고 --output 은 만들지 않는다", async () => {
      scrollStart.mockResolvedValue({
        scrollKey: "scroll-1",
        totalItems: 2,
        data: [{ id: 1 }],
      });
      scrollNext.mockRejectedValue(rateLimit());
      const output = join(directory, "logs.jsonl");

      await expect(programWithExport().parseAsync(args(output))).rejects.toMatchObject({
        exitCode: EXIT_API_ERROR,
      });

      expect(existsSync(output)).toBe(false);
      expect(readFileSync(`${output}.partial`, "utf-8")).toBe('{"id":1}\n');
      expect(readdirSync(directory)).toEqual(["logs.jsonl.partial"]);
      expect(stderrText()).toContain("받은 1건을");
    });

    it("--format json 부분 파일도 배열을 닫아 그대로 파싱된다", async () => {
      scrollStart.mockResolvedValue({
        scrollKey: "scroll-1",
        totalItems: 5,
        data: [{ id: 1 }, { id: 2 }],
      });
      scrollNext.mockRejectedValue(rateLimit());
      const output = join(directory, "logs.json");

      await expect(
        programWithExport().parseAsync(args(output, ["--format", "json"])),
      ).rejects.toMatchObject({ exitCode: EXIT_API_ERROR });

      expect(JSON.parse(readFileSync(`${output}.partial`, "utf-8"))).toEqual([
        { id: 1 },
        { id: 2 },
      ]);
    });

    it("분할이 일어난 뒤 실패하면 안내의 --from 이 실패한 창의 시작이다", async () => {
      scrollStart
        .mockRejectedValueOnce(new LogncrashServerError("server 500", null))
        .mockResolvedValueOnce({
          totalItems: 1,
          data: [{ id: 1, logTime: "2026-08-03T00:05:00Z" }],
        })
        .mockRejectedValueOnce(rateLimit());
      const output = join(directory, "logs.jsonl");

      await expect(programWithExport().parseAsync(args(output))).rejects.toMatchObject({
        exitCode: EXIT_API_ERROR,
      });

      // 창은 오래된 쪽부터 처리되므로 이어받을 지점은 실패한 창(2번째)의 시작이다.
      expect(stderrText()).toContain(
        '--from "2026-08-03T00:30:00Z" --to "2026-08-03T01:00:00Z"',
      );
      // 이미 받은 구간의 시작도, 파일 마지막 로그의 logTime 도 아니다.
      expect(stderrText()).not.toContain('--from "2026-08-03T00:00:00Z"');
      expect(stderrText()).not.toContain("00:05:00Z");
    });

    // 실패 위에 실패가 겹치는 경로다. 보존이 안 되는 것보다 원인이 가려지는 것이 나쁘다.
    it("부분 결과 보존이 실패해도 원본 오류를 가리지 않는다", async () => {
      scrollStart.mockResolvedValue({
        scrollKey: "scroll-1",
        totalItems: 2,
        data: [{ id: 1 }],
      });
      scrollNext.mockRejectedValue(rateLimit());
      const output = join(directory, "logs.jsonl");
      // .partial 자리를 디렉터리로 막아 rename 을 실패시킨다.
      mkdirSync(`${output}.partial`);

      const error: unknown = await programWithExport()
        .parseAsync(args(output))
        .then(() => null)
        .catch((e: unknown) => e);

      // 원본 rate limit 오류가 그대로 올라온다.
      expect(error).toMatchObject({ exitCode: EXIT_API_ERROR });
      expect((error as Error).message).toContain("조회 횟수 제한");

      const written = vi.mocked(process.stderr.write).mock.calls
        .map((call) => String(call[0]))
        .join("");
      expect(written).toContain("남기지 못했습니다");
      // 남기지 못했는데 남겼다고 알리면 안 된다.
      expect(written).not.toContain("에 남겼습니다");
    });

    it("한 건도 받지 못하고 실패하면 .partial 도 임시 파일도 남지 않는다", async () => {
      scrollStart.mockRejectedValue(rateLimit());
      const output = join(directory, "logs.jsonl");

      await expect(programWithExport().parseAsync(args(output))).rejects.toMatchObject({
        exitCode: EXIT_API_ERROR,
      });

      expect(readdirSync(directory)).toEqual([]);
    });

    it("scrollNext 의 조회 횟수 제한은 범위를 좁히라고 안내하지 않는다", async () => {
      scrollStart.mockResolvedValue({
        scrollKey: "scroll-1",
        totalItems: 2,
        data: [{ id: 1 }],
      });
      scrollNext.mockRejectedValue(rateLimit());
      const output = join(directory, "logs.jsonl");

      const error: unknown = await programWithExport()
        .parseAsync(args(output))
        .then(() => null)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NhnCloudCliError);
      expect((error as NhnCloudCliError).message).toContain("시간을 두고 다시 실행하세요");
      expect((error as NhnCloudCliError).message).not.toContain("범위를 좁혀");
    });

    it("scrollStart 단계의 조회 횟수 제한도 같은 안내를 받는다", async () => {
      scrollStart.mockRejectedValue(rateLimit());
      const output = join(directory, "logs.jsonl");

      await expect(programWithExport().parseAsync(args(output))).rejects.toMatchObject({
        exitCode: EXIT_API_ERROR,
        message: expect.stringContaining("시간을 두고 다시 실행하세요"),
      });
    });

    it("조회 횟수 제한은 적응형 분할을 유발하지 않는다", async () => {
      scrollStart.mockRejectedValue(rateLimit());
      const output = join(directory, "logs.jsonl");

      await expect(programWithExport().parseAsync(args(output))).rejects.toBeInstanceOf(
        NhnCloudCliError,
      );

      expect(scrollStart).toHaveBeenCalledTimes(1);
    });

    // 분할이 없으면 실패한 창이 곧 요청 구간 전체라 이어받을 지점이 없다.
    // 그때 --from 안내를 내면 방금 친 명령과 글자까지 같아진다.
    it("분할이 없으면 이어받기 대신 전량 재조회를 알린다", async () => {
      scrollStart.mockResolvedValue({
        scrollKey: "scroll-1",
        totalItems: 2,
        data: [{ id: 1 }],
      });
      scrollNext.mockRejectedValue(rateLimit());
      const output = join(directory, "logs.jsonl");

      await expect(programWithExport().parseAsync(args(output))).rejects.toMatchObject({
        exitCode: EXIT_API_ERROR,
      });

      const written = stderrText();
      expect(written).toContain("이어받을 지점이 없습니다");
      expect(written).not.toContain("이어받으려면 --from");
    });

    // 힌트를 붙이는 지점이 한 곳이라 문구가 두 번 붙을 수 없다.
    it("조회 횟수 제한 안내가 한 번만 붙는다", async () => {
      scrollStart.mockResolvedValue({
        scrollKey: "scroll-1",
        totalItems: 2,
        data: [{ id: 1 }],
      });
      scrollNext.mockRejectedValue(rateLimit());
      const output = join(directory, "logs.jsonl");

      const error: unknown = await programWithExport()
        .parseAsync(args(output))
        .then(() => null)
        .catch((e: unknown) => e);

      const message = (error as Error).message;
      expect(message.split("조회 횟수 제한에 걸렸습니다").length - 1).toBe(1);
    });

    // 교체 전에 지우면 rename 이 실패했을 때 이번 결과와 앞선 부분 결과를 한꺼번에 잃는다.
    it("교체가 실패하면 앞선 부분 파일을 지우지 않는다", async () => {
      // --output 자리를 비어 있지 않은 디렉터리로 막으면 rename 이 실패한다.
      const output = join(directory, "blocked");
      mkdirSync(output);
      writeFileSync(join(output, "keep"), "x");
      writeFileSync(`${output}.partial`, '{"kept":true}\n');

      scrollStart.mockResolvedValue({ scrollKey: undefined, totalItems: 1, data: [{ id: 1 }] });

      await expect(
        programWithExport().parseAsync(args(output, ["--force"])),
      ).rejects.toMatchObject({ exitCode: EXIT_PARAM_ERROR });

      // 이번 결과를 잃은 위에 앞선 부분 결과까지 잃으면 안 된다.
      expect(existsSync(`${output}.partial`)).toBe(true);
    });

    // 성공한 실행이 앞선 실패의 잔여를 남기면 자동화가 낡은 결과를 현재 것으로 읽는다.
    it("성공하면 앞선 실행이 남긴 부분 파일을 치운다", async () => {
      const output = join(directory, "logs.jsonl");
      writeFileSync(`${output}.partial`, '{"stale":true}\n');

      scrollStart.mockResolvedValue({ scrollKey: undefined, totalItems: 1, data: [{ id: 1 }] });

      await programWithExport().parseAsync(args(output));

      expect(existsSync(output)).toBe(true);
      expect(existsSync(`${output}.partial`)).toBe(false);
    });
  });
});
