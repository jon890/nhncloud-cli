import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";
import { NhnCloudCliError } from "../utils/errors.js";
import { configureCommanderExitCodes } from "./commander-errors.js";

interface CapturedTree {
  root: Command;
  output: () => { stdout: string; stderr: string };
}

function createCapturedTree(configureLeaf?: (leaf: Command) => void): CapturedTree {
  let stdout = "";
  let stderr = "";
  const output = {
    writeOut: (text: string) => {
      stdout += text;
    },
    writeErr: (text: string) => {
      stderr += text;
    },
  };

  const leaf = new Command("leaf");
  configureLeaf?.(leaf);

  const group = new Command("group").addCommand(leaf);
  const root = new Command("nhncloud")
    .version("1.0.0")
    .addCommand(group);

  for (const command of [root, group, leaf]) {
    command.configureOutput(output);
  }
  configureCommanderExitCodes(root);

  return { root, output: () => ({ stdout, stderr }) };
}

describe("configureCommanderExitCodes", () => {
  it("2단계 하위 명령의 필수 옵션 누락을 exit 3으로 바꾼다", async () => {
    const { root, output } = createCapturedTree((leaf) => {
      leaf.requiredOption("--name <name>");
    });

    await expect(root.parseAsync(["group", "leaf"], { from: "user" })).rejects.toMatchObject({
      code: "commander.missingMandatoryOptionValue",
      exitCode: EXIT_PARAM_ERROR,
    });
    expect(output().stderr).toBe("error: required option '--name <name>' not specified\n");
    expect(output().stderr).not.toContain("오류:");
  });

  it("root 명령에도 필수 옵션 종료 코드 정책을 적용한다", async () => {
    let stderr = "";
    const root = new Command("nhncloud")
      .requiredOption("--profile <name>")
      .configureOutput({ writeErr: (text) => { stderr += text; } });
    configureCommanderExitCodes(root);

    await expect(root.parseAsync([], { from: "user" })).rejects.toMatchObject({
      code: "commander.missingMandatoryOptionValue",
      exitCode: EXIT_PARAM_ERROR,
    });
    expect(stderr).toBe("error: required option '--profile <name>' not specified\n");
  });

  it("알 수 없는 옵션은 기존 code와 exit 1을 유지한다", async () => {
    const { root, output } = createCapturedTree((leaf) => {
      leaf.requiredOption("--name <name>");
    });

    await expect(root.parseAsync(
      ["group", "leaf", "--name", "example", "--unknown"],
      { from: "user" },
    )).rejects.toMatchObject({
      code: "commander.unknownOption",
      exitCode: 1,
    });
    expect(output().stderr).toBe("error: unknown option '--unknown'\n");
  });

  it("도움말과 버전은 exit 0을 유지한다", async () => {
    const helpTree = createCapturedTree();
    await expect(helpTree.root.parseAsync(["--help"], { from: "user" })).rejects.toMatchObject({
      code: "commander.helpDisplayed",
      exitCode: 0,
    });
    expect(helpTree.output().stdout).toContain("Usage: nhncloud");
    expect(helpTree.output().stderr).toBe("");

    const versionTree = createCapturedTree();
    await expect(versionTree.root.parseAsync(["--version"], { from: "user" })).rejects.toMatchObject({
      code: "commander.version",
      exitCode: 0,
    });
    expect(versionTree.output()).toEqual({ stdout: "1.0.0\n", stderr: "" });
  });

  it("action의 NhnCloudCliError를 바꾸거나 가로채지 않는다", async () => {
    const expected = new NhnCloudCliError("입력 오류", EXIT_PARAM_ERROR);
    const { root } = createCapturedTree((leaf) => {
      leaf.action(() => {
        throw expected;
      });
    });

    await expect(root.parseAsync(["group", "leaf"], { from: "user" })).rejects.toBe(expected);
  });
});
