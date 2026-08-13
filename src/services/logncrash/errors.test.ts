import { describe, expect, it } from "vitest";
import { HTTPError } from "ky";
import { EXIT_API_ERROR, EXIT_AUTH_ERROR } from "../../utils/exit-codes.js";
import { LogncrashServerError, toLogncrashError } from "./errors.js";

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
