import { describe, it, expect } from "vitest";
import { parseHarborHost } from "./helpers.js";
import { EXIT_API_ERROR } from "../../utils/exit-codes.js";

describe("parseHarborHost", () => {
  it("scheme 없는 uri — host 반환", () => {
    expect(parseHarborHost("host.example.com/myreg")).toBe("host.example.com");
  });

  it("https:// scheme 포함 uri — scheme 제거 후 host 반환", () => {
    expect(parseHarborHost("https://host.example.com/myreg")).toBe("host.example.com");
  });

  it("http:// scheme 포함 uri — scheme 제거 후 host 반환", () => {
    expect(parseHarborHost("http://host.example.com/myreg")).toBe("host.example.com");
  });

  it("중첩 경로 — 첫 '/' 앞 host 만 반환", () => {
    expect(parseHarborHost("host.example.com/a/b")).toBe("host.example.com");
  });

  it("undefined → EXIT_API_ERROR throw", () => {
    expect(() => parseHarborHost(undefined)).toThrow(
      expect.objectContaining({ exitCode: EXIT_API_ERROR }),
    );
  });

  it("null → EXIT_API_ERROR throw", () => {
    expect(() => parseHarborHost(null)).toThrow(
      expect.objectContaining({ exitCode: EXIT_API_ERROR }),
    );
  });

  it('빈 문자열("") → EXIT_API_ERROR throw', () => {
    expect(() => parseHarborHost("")).toThrow(
      expect.objectContaining({ exitCode: EXIT_API_ERROR }),
    );
  });
});
