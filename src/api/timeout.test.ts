import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_TIMEOUT_MS,
  setRequestTimeoutMs,
  SYNC_TIMEOUT_MS,
} from "./timeout.js";

describe("request timeout", () => {
  afterEach(() => {
    setRequestTimeoutMs(30_000);
  });

  it("기본 조회 상한과 동기 작업 하한을 제공한다", () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(30_000);
    expect(SYNC_TIMEOUT_MS).toBe(600_000);
  });

  it("전역 값이 동기 작업 하한보다 작으면 동기 상한을 낮추지 않는다", () => {
    setRequestTimeoutMs(120_000);

    expect(DEFAULT_TIMEOUT_MS).toBe(120_000);
    expect(SYNC_TIMEOUT_MS).toBe(600_000);
  });

  it("전역 값이 동기 작업 하한보다 크면 동기 상한도 늘린다", () => {
    setRequestTimeoutMs(900_000);

    expect(DEFAULT_TIMEOUT_MS).toBe(900_000);
    expect(SYNC_TIMEOUT_MS).toBe(900_000);
  });
});
