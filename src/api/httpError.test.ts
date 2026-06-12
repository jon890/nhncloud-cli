import { describe, it, expect } from "vitest";
import { HTTPError } from "ky";
import { toNhnCloudCliError } from "./httpError.js";
import { NhnCloudCliError } from "../utils/errors.js";
import { EXIT_API_ERROR, EXIT_AUTH_ERROR } from "../utils/exit-codes.js";

/** HTTPError 실제 인스턴스 생성 헬퍼 (instanceof 분기를 올바르게 타기 위한 필수 패턴) */
function makeHttpError(status: number): HTTPError {
  return new HTTPError(
    new Response(null, { status }),
    new Request("https://example.com"),
    {} as never,
  );
}

describe("toNhnCloudCliError", () => {
  it("401 → EXIT_AUTH_ERROR", () => {
    const result = toNhnCloudCliError(makeHttpError(401));
    expect(result).toBeInstanceOf(NhnCloudCliError);
    expect(result.exitCode).toBe(EXIT_AUTH_ERROR);
  });

  it("403 → EXIT_AUTH_ERROR", () => {
    const result = toNhnCloudCliError(makeHttpError(403));
    expect(result).toBeInstanceOf(NhnCloudCliError);
    expect(result.exitCode).toBe(EXIT_AUTH_ERROR);
  });

  it("404 → EXIT_API_ERROR (AUTH 아님을 명시 — code-review-pitfalls 2-2 근거 박제)", () => {
    const result = toNhnCloudCliError(makeHttpError(404));
    expect(result).toBeInstanceOf(NhnCloudCliError);
    expect(result.exitCode).toBe(EXIT_API_ERROR);
  });

  it("500 → EXIT_API_ERROR", () => {
    const result = toNhnCloudCliError(makeHttpError(500));
    expect(result).toBeInstanceOf(NhnCloudCliError);
    expect(result.exitCode).toBe(EXIT_API_ERROR);
  });

  it("비-HTTP raw Error → NhnCloudCliError(err.message, EXIT_API_ERROR) 로 wrap (원형 보존 아님)", () => {
    const err = new Error("ECONNREFUSED");
    const result = toNhnCloudCliError(err);
    // httpError.ts:25-27 의 실제 동작: new NhnCloudCliError(err.message, EXIT_API_ERROR)
    // instanceof NhnCloudCliError 단언이 아니라 exitCode 로 고정 (HTTPError 분기를 못 타 AUTH 아닌 API_ERROR)
    expect(result.exitCode).toBe(EXIT_API_ERROR);
    expect(result.message).toBe("ECONNREFUSED");
  });

  it("이미 NhnCloudCliError 인스턴스면 그대로 passthrough (httpError.ts:12-14)", () => {
    const original = new NhnCloudCliError("already", EXIT_AUTH_ERROR);
    const result = toNhnCloudCliError(original);
    expect(result).toBe(original); // 같은 객체 참조
  });
});
