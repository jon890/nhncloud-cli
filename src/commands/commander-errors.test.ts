import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
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

  describe("알 수 없는 옵션의 위치 인수 안내", () => {
    const hint =
      "안내: --instance-id 는 옵션이 아닙니다. 위치 인수 <id> 로 전달하세요.\n" +
      "사용법: nhncloud instance get [options] <id>\n";

    function createInstanceTree(configureGet?: (get: Command) => void) {
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
      const action = vi.fn();
      const get = new Command("get")
        .argument("<id>")
        .option("--region <region>")
        .action(action);
      configureGet?.(get);
      const instance = new Command("instance").addCommand(get);
      const root = new Command("nhncloud").option("--json").addCommand(instance);
      for (const command of [root, instance, get]) {
        command.configureOutput(output);
      }
      configureCommanderExitCodes(root);

      return { root, action, output: () => ({ stdout, stderr }) };
    }

    it("위치 인수 이름을 옵션으로 부르면 오류 줄 뒤에 안내를 붙인다", async () => {
      const { root, action, output } = createInstanceTree();

      await expect(root.parseAsync(
        ["instance", "get", "--instance-id", "x"],
        { from: "user" },
      )).rejects.toMatchObject({ code: "commander.unknownOption", exitCode: 1 });
      expect(output().stderr).toBe(`error: unknown option '--instance-id'\n${hint}`);
      expect(output().stdout).toBe("");
      expect(action).not.toHaveBeenCalled();
    });

    it("--json 을 함께 줘도 안내는 stderr에만 나온다", async () => {
      const { root, output } = createInstanceTree();

      await expect(root.parseAsync(
        ["instance", "get", "--instance-id", "x", "--json"],
        { from: "user" },
      )).rejects.toMatchObject({ code: "commander.unknownOption", exitCode: 1 });
      expect(output().stdout).toBe("");
      expect(output().stderr).toContain(hint);
    });

    it("옵션 이름 오타에는 Commander 제안만 남기고 안내를 붙이지 않는다", async () => {
      const { root, output } = createInstanceTree();

      await expect(root.parseAsync(
        ["instance", "get", "--regoin", "x"],
        { from: "user" },
      )).rejects.toMatchObject({ code: "commander.unknownOption", exitCode: 1 });
      expect(output().stderr).toContain("(Did you mean --region?)");
      expect(output().stderr).not.toContain("안내:");
    });

    it("Commander가 비슷한 옵션을 제안하면 안내를 붙이지 않는다", async () => {
      const { root, output } = createInstanceTree((get) => {
        get.option("--instance <name>");
      });

      await expect(root.parseAsync(
        ["instance", "get", "--instance-id", "x"],
        { from: "user" },
      )).rejects.toMatchObject({ code: "commander.unknownOption", exitCode: 1 });
      expect(output().stderr).toContain("(Did you mean --instance?)");
      expect(output().stderr).not.toContain("안내:");
    });

    it("위치 인수가 없는 그룹 명령의 알 수 없는 옵션에는 안내를 붙이지 않는다", async () => {
      const { root, output } = createInstanceTree();

      await expect(root.parseAsync(
        ["instance", "--foo"],
        { from: "user" },
      )).rejects.toMatchObject({ code: "commander.unknownOption", exitCode: 1 });
      expect(output().stderr).toBe("error: unknown option '--foo'\n");
    });
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
