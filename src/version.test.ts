import { describe, expect, it } from "vitest";
import { CLI_VERSION } from "./version.js";

describe("CLI_VERSION", () => {
  it("빌드 주입이 없는 실행에서는 0.0.0-dev 다", () => {
    expect(CLI_VERSION).toBe("0.0.0-dev");
  });
});
