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
});
