import { describe, it, expect } from "vitest";
import { unwrap, unwrapHeader } from "./envelope.js";
import { NhnCloudCliError } from "../utils/errors.js";
import { EXIT_API_ERROR } from "../utils/exit-codes.js";

describe("unwrap", () => {
  it("isSuccessful=true + body 존재 → body 반환", () => {
    const res = {
      header: { isSuccessful: true, resultCode: 0, resultMessage: "OK" },
      body: { x: 1 },
    };
    expect(unwrap(res)).toEqual({ x: 1 });
  });

  it("isSuccessful=false → NhnCloudCliError(EXIT_API_ERROR) throw", () => {
    const res = {
      header: { isSuccessful: false, resultCode: 1, resultMessage: "fail" },
      body: { x: 1 },
    };
    try {
      unwrap(res);
      expect.fail("throw 하지 않음");
    } catch (err) {
      expect(err).toBeInstanceOf(NhnCloudCliError);
      expect((err as NhnCloudCliError).exitCode).toBe(EXIT_API_ERROR);
    }
  });

  it("isSuccessful=true 이지만 body 누락 → EXIT_API_ERROR throw (5-3 런타임 보증)", () => {
    const res = {
      header: { isSuccessful: true, resultCode: 0, resultMessage: "OK" },
      // body 없음
    };
    try {
      unwrap(res);
      expect.fail("throw 하지 않음");
    } catch (err) {
      expect(err).toBeInstanceOf(NhnCloudCliError);
      expect((err as NhnCloudCliError).exitCode).toBe(EXIT_API_ERROR);
    }
  });

  it("resultCode 가 string('0')이어도 isSuccessful=true 면 body 반환 (ADR-006 타입 비교 금지)", () => {
    const res = {
      header: { isSuccessful: true, resultCode: "0", resultMessage: "OK" },
      body: { ok: true },
    };
    expect(unwrap(res)).toEqual({ ok: true });
  });
});

describe("unwrapHeader", () => {
  it("isSuccessful=true → throw 안 함", () => {
    const res = {
      header: { isSuccessful: true, resultCode: 0, resultMessage: "OK" },
    };
    expect(() => unwrapHeader(res)).not.toThrow();
  });

  it("isSuccessful=false → NhnCloudCliError(EXIT_API_ERROR) throw", () => {
    const res = {
      header: { isSuccessful: false, resultCode: "ERROR", resultMessage: "fail" },
    };
    try {
      unwrapHeader(res);
      expect.fail("throw 하지 않음");
    } catch (err) {
      expect(err).toBeInstanceOf(NhnCloudCliError);
      expect((err as NhnCloudCliError).exitCode).toBe(EXIT_API_ERROR);
    }
  });
});
