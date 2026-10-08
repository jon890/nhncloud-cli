import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { configureGlobalOptionsHelp } from "./help.js";

function buildTree(): { root: Command; leaf: Command } {
  const root = new Command("cli").option("--json", "JSON 출력");
  const group = new Command("group");
  const leaf = new Command("leaf").description("leaf command");
  group.addCommand(leaf);
  root.addCommand(group);
  return { root, leaf };
}

describe("configureGlobalOptionsHelp", () => {
  it("적용 전에는 하위 명령 도움말에 전역 옵션이 없다", () => {
    const { leaf } = buildTree();
    expect(leaf.helpInformation()).not.toContain("--json");
  });

  it("적용 후 두 단계 아래 하위 명령 도움말에도 Global Options 절이 나온다", () => {
    const { root, leaf } = buildTree();
    configureGlobalOptionsHelp(root);
    const help = leaf.helpInformation();
    expect(help).toContain("Global Options:");
    expect(help).toContain("--json");
  });
});
