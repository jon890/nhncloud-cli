import { describe, expect, it } from "vitest";
import { parseNonNegativeInteger, parsePositiveInteger } from "./helpers.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

describe("nks command helpers", () => {
  it("parsePositiveInteger() rejects zero", () => {
    expect(parsePositiveInteger("1", "--node-count")).toBe(1);
    expect(() => parsePositiveInteger("0", "--node-count")).toThrow(
      expect.objectContaining({ exitCode: EXIT_PARAM_ERROR }),
    );
  });

  it("parseNonNegativeInteger() accepts zero", () => {
    expect(parseNonNegativeInteger("0", "--num-buffer-nodes")).toBe(0);
    expect(parseNonNegativeInteger("2", "--num-buffer-nodes")).toBe(2);
    expect(() => parseNonNegativeInteger("-1", "--num-buffer-nodes")).toThrow(
      expect.objectContaining({ exitCode: EXIT_PARAM_ERROR }),
    );
  });
});
