import { describe, expect, it } from "vitest";
import { collectAppKeyOptionPaths } from "../appkey-option.test-helper.js";
import { malwareCommand } from "./malware.js";
import { templateCommand } from "./template.js";
import { workloadCommand } from "./workload.js";

describe("ncs 명령 옵션", () => {
  it("모든 하위 명령에서 --app-key를 노출하지 않는다", () => {
    const commands = [templateCommand, workloadCommand, malwareCommand];

    expect(commands.flatMap((command) => collectAppKeyOptionPaths(command))).toEqual([]);
  });
});
