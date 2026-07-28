import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeNcsTimeRange, readJsonPayload } from "./helpers.js";
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

describe("normalizeNcsTimeRange", () => {
  const now = new Date("2026-07-28T12:34:56.987Z");

  it("시간대 오프셋과 Z 입력을 UTC 초 단위로 정규화한다", () => {
    expect(
      normalizeNcsTimeRange(
        "2026-07-28T21:34:56+09:00",
        "2026-07-28T12:35:00Z",
        now,
      ),
    ).toEqual({
      from: "2026-07-28T12:34:56Z",
      to: "2026-07-28T12:35:00Z",
    });
  });

  it("소수 초를 제거하고 윤년 2월 29일을 허용한다", () => {
    expect(
      normalizeNcsTimeRange("2024-02-29T23:59:59.987654Z", undefined, now),
    ).toEqual({ from: "2024-02-29T23:59:59Z" });
  });

  it.each([
    ["30m", "2026-07-28T12:04:56Z"],
    ["1h", "2026-07-28T11:34:56Z"],
    ["2d", "2026-07-26T12:34:56Z"],
    ["now", "2026-07-28T12:34:56Z"],
  ])("%s 상대시간을 고정 기준 시각에서 계산한다", (input, expected) => {
    expect(normalizeNcsTimeRange(input, "now", now)).toEqual({
      from: expected,
      to: "2026-07-28T12:34:56Z",
    });
  });

  it("두 값 생략과 한쪽 입력만 보존한다", () => {
    expect(normalizeNcsTimeRange(undefined, undefined, now)).toEqual({});
    expect(normalizeNcsTimeRange(undefined, "now", now)).toEqual({
      to: "2026-07-28T12:34:56Z",
    });
  });

  it.each([
    ["--from", "2023-02-29T00:00:00Z"],
    ["--from", "2026-07-28T12:34Z"],
    ["--from", "2026-07-28T24:00:00Z"],
    ["--from", "2026-07-28T12:34:56+24:00"],
    ["--from", "2026-07-28T12:34:56+09:60"],
    ["--from", "-1h"],
    ["--from", "1.5h"],
    ["--from", "1w"],
    ["--from", "9007199254740992m"],
    ["--to", "9007199254740991m"],
  ])("%s의 잘못된 입력 %s를 EXIT_PARAM_ERROR로 거부한다", (option, input) => {
    try {
      normalizeNcsTimeRange(
        option === "--from" ? input : undefined,
        option === "--to" ? input : undefined,
        now,
      );
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toMatchObject({ exitCode: EXIT_PARAM_ERROR });
      expect(String(err)).toContain(option);
    }
  });

  it("유효한 Date 범위를 벗어난 상대시간을 거부한다", () => {
    expect(() =>
      normalizeNcsTimeRange(
        "100000000d",
        undefined,
        new Date("9999-12-31T23:59:59Z"),
      ),
    ).toThrow(expect.objectContaining({ exitCode: EXIT_PARAM_ERROR }));
  });

  it("from이 to보다 늦으면 EXIT_PARAM_ERROR로 거부한다", () => {
    expect(() =>
      normalizeNcsTimeRange("now", "30m", now),
    ).toThrow(expect.objectContaining({ exitCode: EXIT_PARAM_ERROR }));
  });

  it("잘못된 입력의 제어 문자를 오류 메시지에서 이스케이프한다", () => {
    try {
      normalizeNcsTimeRange("bad\n\u001b[31m", undefined, now);
      throw new Error("should have thrown");
    } catch (err) {
      const message = String(err);
      expect(message).not.toContain("\n");
      expect(message).not.toContain("\u001b");
      expect(message).toContain("\\n\\u001b");
    }
  });
});
