import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readJsonPayload } from "./helpers.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

describe("readJsonPayload", () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("정상 JSON 파일을 파싱해 반환한다", () => {
    dir = mkdtempSync(join(tmpdir(), "ncs-helpers-test-"));
    const file = join(dir, "payload.json");
    writeFileSync(file, JSON.stringify({ name: "nginx-template" }), "utf-8");

    const result = readJsonPayload(file);
    expect(result).toEqual({ name: "nginx-template" });
  });

  it("파일이 존재하지 않으면 EXIT_PARAM_ERROR", () => {
    dir = mkdtempSync(join(tmpdir(), "ncs-helpers-test-"));
    const missing = join(dir, "does-not-exist.json");

    try {
      readJsonPayload(missing);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toMatchObject({ exitCode: EXIT_PARAM_ERROR });
    }
  });

  it("JSON 파싱에 실패하면 EXIT_PARAM_ERROR", () => {
    dir = mkdtempSync(join(tmpdir(), "ncs-helpers-test-"));
    const file = join(dir, "invalid.json");
    writeFileSync(file, "{not valid json", "utf-8");

    try {
      readJsonPayload(file);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toMatchObject({ exitCode: EXIT_PARAM_ERROR });
    }
  });
});
