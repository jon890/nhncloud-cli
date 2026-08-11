import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { sanitizeForTerminal } from "./helpers.js";
import { writeStageSwaggerFile } from "./stage.js";

const temporaryDirectories: string[] = [];

async function temporaryFilePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "nhncloud-apigateway-swagger-"));
  temporaryDirectories.push(directory);
  const nestedDirectory = join(directory, "nested");
  await mkdir(nestedDirectory);
  return join(nestedDirectory, "swagger.json");
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, {
    recursive: true,
    force: true,
  })));
});

describe("writeStageSwaggerFile", () => {
  it("사용자가 지정한 경로를 그대로 사용해 JSON을 저장하고 --force에서 덮어쓴다", async () => {
    const path = await temporaryFilePath();
    await writeFile(path, "old\n");

    await writeStageSwaggerFile(path, { arbitrary: { value: true } }, true);

    await expect(readFile(path, "utf-8")).resolves.toBe(
      '{\n  "arbitrary": {\n    "value": true\n  }\n}\n',
    );
  });

  it("기존 파일은 --force 없이는 경로와 EEXIST를 포함한 입력 오류로 거부한다", async () => {
    const path = await temporaryFilePath();
    await writeFile(path, "old\n");

    await expect(writeStageSwaggerFile(path, { openapi: "3.0.0" })).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
      message: expect.stringMatching(new RegExp(`${path}.*EEXIST`)),
    });
    await expect(readFile(path, "utf-8")).resolves.toBe("old\n");
  });
});

describe("sanitizeForTerminal", () => {
  it("API 문자열의 ANSI escape와 줄바꿈을 치환한다", () => {
    expect(sanitizeForTerminal("stage\u001b[31m\nnext")).toBe("stage?[31m?next");
  });
});
