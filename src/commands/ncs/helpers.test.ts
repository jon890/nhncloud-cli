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

  it("디렉터리 경로가 주어지면 EXIT_PARAM_ERROR (isFile 가드)", () => {
    dir = mkdtempSync(join(tmpdir(), "ncs-helpers-test-"));

    try {
      readJsonPayload(dir);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toMatchObject({ exitCode: EXIT_PARAM_ERROR });
    }
  });

  it("파일 크기가 한도를 초과하면 EXIT_PARAM_ERROR (size 가드)", () => {
    dir = mkdtempSync(join(tmpdir(), "ncs-helpers-test-"));
    const file = join(dir, "too-big.json");
    // MAX_JSON_PAYLOAD_BYTES(1_000_000) 초과 — 실제 파싱 전에 statSync 크기 검사에서 차단돼야 한다.
    writeFileSync(file, "x".repeat(1_000_001), "utf-8");

    try {
      readJsonPayload(file);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toMatchObject({ exitCode: EXIT_PARAM_ERROR });
    }
  });
});
