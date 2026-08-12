import { describe, expect, it } from "vitest";
import { EXIT_PARAM_ERROR } from "./exit-codes.js";
import { MIN_SPLIT_WINDOW_MS, splitTimeRange } from "./time.js";

describe("splitTimeRange", () => {
  it("인접 창이 같은 경계를 공유하고 마지막 창은 원래 끝에서 끝난다", () => {
    const windows = splitTimeRange(
      "2026-08-03T00:00:00+09:00",
      "2026-08-03T05:00:00+09:00",
      2 * 60 * 60 * 1000,
    );

    expect(windows).toEqual([
      { from: "2026-08-03T00:00:00+09:00", to: "2026-08-03T02:00:00+09:00" },
      { from: "2026-08-03T02:00:00+09:00", to: "2026-08-03T04:00:00+09:00" },
      { from: "2026-08-03T04:00:00+09:00", to: "2026-08-03T05:00:00+09:00" },
    ]);
    expect(windows[0]?.to).toBe(windows[1]?.from);
    expect(windows[1]?.to).toBe(windows[2]?.from);
    expect(windows.at(-1)?.to).toBe("2026-08-03T05:00:00+09:00");
  });

  it("창이 전체 범위 이상이면 입력 범위 하나를 그대로 반환한다", () => {
    expect(
      splitTimeRange(
        "2026-08-03T00:00:00Z",
        "2026-08-03T01:00:00Z",
        60 * 60 * 1000,
      ),
    ).toEqual([{ from: "2026-08-03T00:00:00Z", to: "2026-08-03T01:00:00Z" }]);
  });

  it("최소 창보다 작으면 파라미터 오류로 거부한다", () => {
    expect(() =>
      splitTimeRange(
        "2026-08-03T00:00:00Z",
        "2026-08-03T01:00:00Z",
        MIN_SPLIT_WINDOW_MS - 1,
      ),
    ).toThrowError(expect.objectContaining({ exitCode: EXIT_PARAM_ERROR }));
  });

  it("오프셋 입력과 밀리초 단위 창 크기에서도 파싱 가능한 초 단위 경계를 만든다", () => {
    const windows = splitTimeRange(
      "2026-08-03T00:00:00+09:00",
      "2026-08-03T00:20:01+09:00",
      600_500,
    );

    expect(windows[0]?.to).toBe("2026-08-03T00:10:00+09:00");
    expect(windows.flatMap(({ from, to }) => [from, to]).every(
      (boundary) => Number.isFinite(new Date(boundary).getTime()),
    )).toBe(true);
  });

  it("date-only 입력도 분할 전에 같은 ISO8601 표기로 정규화한다", () => {
    const windows = splitTimeRange(
      "2026-08-03",
      "2026-08-04",
      12 * 60 * 60 * 1000,
    );
    const boundaries = [windows[0]?.from, ...windows.map(({ to }) => to)];

    expect(boundaries.every((boundary) =>
      boundary !== undefined && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(boundary)
    )).toBe(true);
    expect(new Set(boundaries.map((boundary) => boundary?.slice(-6))).size).toBe(1);
  });
});
