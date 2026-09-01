import { describe, expect, it, vi } from "vitest";
import { EXIT_API_ERROR } from "../../utils/exit-codes.js";
import {
  assertAvailableSearchToken,
  availableTokenStatus,
} from "./token.js";

describe("Log & Crash 조회 토큰 상태", () => {
  it.each([
    [1, null],
    [40_000, null],
    [0, 1],
    [-1, 2],
    [-2_302, 1_440],
  ])("잔량 %s의 양수까지 추정 대기 시간을 계산한다", (availableToken, expected) => {
    expect(availableTokenStatus(availableToken)).toEqual({
      availableToken,
      estimatedWaitSeconds: expected,
    });
  });

  it("양수이면 검색을 허용한다", () => {
    expect(() => assertAvailableSearchToken(availableTokenStatus(1))).not.toThrow();
  });

  it("0 이하면 관측 속도와 재확인 명령을 안내하고 자동으로 기다리지 않는다", () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    expect(() => assertAvailableSearchToken(availableTokenStatus(-2_302))).toThrow(
      expect.objectContaining({
        exitCode: EXIT_API_ERROR,
        message: expect.stringMatching(/-2302.*1\.6 token\/s.*1440초.*자동으로 기다리지.*available-token/s),
      }),
    );
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    setTimeoutSpy.mockRestore();
  });
});
