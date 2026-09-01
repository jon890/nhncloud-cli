import { describe, expect, it } from "vitest";
import { HTTPError } from "ky";
import { EXIT_API_ERROR, EXIT_AUTH_ERROR } from "../../utils/exit-codes.js";
import {
  isRateLimitError,
  LogncrashServerError,
  toLogncrashError,
  withRateLimitHint,
} from "./errors.js";
import { NhnEnvelopeError } from "../../api/envelope.js";
import { NhnCloudCliError } from "../../utils/errors.js";

function makeHttpError(status: number, body?: string): HTTPError {
  const response = new Response(body, {
    status,
    statusText: status === 500 ? "Internal Server Error" : undefined,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
  });
  return new HTTPError(
    response,
    new Request("https://example.com/v3/appkey/logs/cursor"),
    {} as never,
  );
}

describe("toLogncrashError", () => {
  it("500 응답의 requestId를 정제하고 API 오류 종료 코드를 보존한다", async () => {
    const result = await toLogncrashError(
      makeHttpError(500, JSON.stringify({ requestId: "request\n-id" })),
    );

    expect(result).toBeInstanceOf(LogncrashServerError);
    expect(result).toMatchObject({
      requestId: "request?-id",
      exitCode: EXIT_API_ERROR,
    });
    expect(result.message).toContain("API 호출 실패 (500):");
  });

  it.each([
    ["JSON이 아닌 본문", "not-json"],
    ["requestId가 없는 본문", JSON.stringify({ status: 500 })],
  ])("500 %s이면 requestId를 null로 둔다", async (_name, body) => {
    const result = await toLogncrashError(makeHttpError(500, body));

    expect(result).toBeInstanceOf(LogncrashServerError);
    expect(result).toMatchObject({ requestId: null, exitCode: EXIT_API_ERROR });
  });

  it.each([401, 403])("%i 응답은 기존 인증 오류 변환을 유지한다", async (status) => {
    const result = await toLogncrashError(makeHttpError(status));

    expect(result).not.toBeInstanceOf(LogncrashServerError);
    expect(result.exitCode).toBe(EXIT_AUTH_ERROR);
  });
});

describe("isRateLimitError", () => {
  // ADR-032: 서버가 HTTP 200 으로 응답하므로 상태 코드로는 걸러지지 않는다.
  it.each([
    [429, "숫자"],
    ["429", "문자열"],
  ])("봉투 resultCode 가 %s 429 면 참이다 (%s)", (resultCode: number | string, _label: string) => {
    expect(isRateLimitError(new NhnEnvelopeError(resultCode, "Rate limit exceeded."))).toBe(true);
  });

  it.each([
    [0, "성공 코드"],
    [-401, "인증 실패 코드"],
    ["ERROR", "숫자가 아닌 코드"],
  ])("다른 resultCode 는 거짓이다 (%s)", (resultCode: number | string, _label: string) => {
    expect(isRateLimitError(new NhnEnvelopeError(resultCode, "fail"))).toBe(false);
  });

  it("봉투 오류가 아니면 거짓이다", () => {
    expect(isRateLimitError(makeHttpError(429))).toBe(false);
    expect(isRateLimitError(new NhnCloudCliError("API 오류: fail", EXIT_API_ERROR))).toBe(false);
    expect(isRateLimitError(undefined)).toBe(false);
  });
});

describe("withRateLimitHint", () => {
  it("원본 메시지 뒤에 대처 방법을 덧붙인다", () => {
    const result = withRateLimitHint(
      new NhnEnvelopeError(429, "Rate limit exceeded. Please try again later."),
    );

    expect(result.message).toContain("API 오류: Rate limit exceeded.");
    expect(result.message).toContain("자동으로 다시 시도하지 않습니다");
    expect(result.message).toContain("검색 기간만 좁혀 해결을 보장할 수 없습니다");
    expect(result.message).toContain("nhncloud logncrash available-token");
  });

  it("원본의 종료 코드를 그대로 보존한다", () => {
    const original = new NhnEnvelopeError(429, "Rate limit exceeded.");
    expect(withRateLimitHint(original).exitCode).toBe(original.exitCode);
  });

  it("실측한 회복 속도나 소모량을 숫자로 담지 않는다", () => {
    const result = withRateLimitHint(new NhnEnvelopeError(429, "Rate limit exceeded."));
    const hint = result.message.split("\n")[1] ?? "";
    expect(hint).not.toMatch(/\d/);
  });
});
