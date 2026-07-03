import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeKubeconfigFile } from "./cluster.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

const tempDirs: string[] = [];

describe("nks cluster command helpers", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function tempFile(name: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "nhncloud-cli-nks-"));
    tempDirs.push(dir);
    return join(dir, name);
  }

  it("writeKubeconfigFile() overwrites with --force and leaves mode 0600", async () => {
    const path = await tempFile("config");
    await writeFile(path, "old\n", { mode: 0o644 });
    await chmod(path, 0o644);

    await writeKubeconfigFile(path, "new\n", true);

    await expect(readFile(path, "utf-8")).resolves.toBe("new\n");
    const info = await stat(path);
    expect(info.mode & 0o777).toBe(0o600);
  });

  it("writeKubeconfigFile() rejects an existing file without --force", async () => {
    const path = await tempFile("config");
    await writeFile(path, "old\n", { mode: 0o600 });

    await expect(writeKubeconfigFile(path, "new\n")).rejects.toMatchObject({
      exitCode: EXIT_PARAM_ERROR,
    });
    await expect(readFile(path, "utf-8")).resolves.toBe("old\n");
  });
});
