import { describe, expect, it } from "vitest";
import { EXIT_PARAM_ERROR } from "./exit-codes.js";
import { MIN_SPLIT_WINDOW_MS, resolveTime, splitTimeRange } from "./time.js";

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
        "2026-08-04T00:00:00Z",
        24 * 60 * 60 * 1000,
      ),
    ).toEqual([{ from: "2026-08-03T00:00:00Z", to: "2026-08-04T00:00:00Z" }]);
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

  // splitTimeRange 는 순수 함수라 어떤 표기가 들어와도 양 끝을 보존해야 한다.
  // CLI 경로에서는 resolveTime 이 date-only 를 먼저 거부하므로 이 입력은 도달하지 않는다.
  it("date-only 입력에서도 첫 창 from 과 마지막 창 to 가 입력 원본과 같다", () => {
    const windows = splitTimeRange(
      "2026-08-03",
      "2026-08-04",
      12 * 60 * 60 * 1000,
    );

    expect(windows[0]?.from).toBe("2026-08-03");
    expect(windows.at(-1)?.to).toBe("2026-08-04");
  });
});

describe("resolveTime", () => {
  it("초나 시간대가 빠진 값은 거부한다", () => {
    // 아래 셋 모두 서버가 "invalid datetime format" 400 으로 거부하는 것을 실측했다
    for (const partial of ["2026-08-03", "2026-08-03T00:00", "2026-08-03T00:00:00"]) {
      expect(() => resolveTime(partial)).toThrow("초와 시간대까지 지정해야 합니다");
      expect(() => resolveTime(partial)).toThrowError(
        expect.objectContaining({ exitCode: EXIT_PARAM_ERROR }),
      );
    }
  });

  it("초와 시간대를 갖춘 ISO8601 만 그대로 통과시킨다", () => {
    expect(resolveTime("2026-08-03T00:00:00+09:00")).toBe("2026-08-03T00:00:00+09:00");
    expect(resolveTime("2026-08-03T00:00:00Z")).toBe("2026-08-03T00:00:00Z");
  });
});
