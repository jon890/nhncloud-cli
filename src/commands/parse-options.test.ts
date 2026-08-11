import { describe, expect, it } from "vitest";
import { NhnCloudCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";
import {
  parseIntegerOption,
  parseNonNegativeIntegerOption,
  parsePositiveIntegerOption,
  parseRequiredArgument,
} from "./parse-options.js";

function expectParamError(fn: () => unknown, value: string): void {
  try {
    fn();
    throw new Error("expected parse failure");
  } catch (err) {
    expect(err).toBeInstanceOf(NhnCloudCliError);
    expect((err as NhnCloudCliError).exitCode).toBe(EXIT_PARAM_ERROR);
    expect((err as NhnCloudCliError).message).toContain(JSON.stringify(value));
  }
}

describe("parse command integer options", () => {
  it("accepts positive integer notation", () => {
    expect(parsePositiveIntegerOption("1", "--limit")).toBe(1);
    expect(parsePositiveIntegerOption("10", "--limit")).toBe(10);
  });

  it("accepts non-negative integer notation", () => {
    expect(parseNonNegativeIntegerOption("0", "--page")).toBe(0);
    expect(parseNonNegativeIntegerOption("1", "--page")).toBe(1);
    expect(parseNonNegativeIntegerOption("10", "--page")).toBe(10);
  });

  it("accepts min/max range boundaries", () => {
    expect(parseIntegerOption("1", "--size", { min: 1, max: 100 })).toBe(1);
    expect(parseIntegerOption("100", "--size", { min: 1, max: 100 })).toBe(100);
  });

  it.each(["", " ", "01", "1e2", "10abc", "1.5", "-1"])(
    "rejects invalid positive integer notation %j",
    (value) => {
      expectParamError(() => parsePositiveIntegerOption(value, "--limit"), value);
    },
  );

  it.each(["", " ", "01", "1e2", "10abc", "1.5", "-1"])(
    "rejects invalid non-negative integer notation %j",
    (value) => {
      expectParamError(() => parseNonNegativeIntegerOption(value, "--page"), value);
    },
  );

  it("rejects range values outside min/max", () => {
    expectParamError(() => parseIntegerOption("0", "--size", { min: 1, max: 100 }), "0");
    expectParamError(() => parseIntegerOption("101", "--size", { min: 1, max: 100 }), "101");
  });

  it("keeps omitted optional values undefined", () => {
    expect(parsePositiveIntegerOption(undefined, "--limit")).toBeUndefined();
    expect(parseNonNegativeIntegerOption(undefined, "--page")).toBeUndefined();
    expect(parseIntegerOption(undefined, "--size", { min: 1, max: 100 })).toBeUndefined();
  });
});

describe("parse required positional arguments", () => {
  it("trims a non-empty argument", () => {
    expect(parseRequiredArgument("  resource-id  ", "resource-id")).toBe("resource-id");
  });

  it.each(["", " ", "\t\n"])("rejects an empty argument %j", (value) => {
    expect(() => parseRequiredArgument(value, "resource-id")).toThrow(
      expect.objectContaining({ exitCode: EXIT_PARAM_ERROR }),
    );
  });
});
