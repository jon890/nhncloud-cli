import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { malwareCommand } from "./malware.js";
import { templateCommand } from "./template.js";
import { workloadCommand } from "./workload.js";

// 3곳째 복제다. 4곳째에는 공용 테스트 유틸로 추출한다.
function collectAppKeyOptionPaths(command: Command, parentPath = ""): string[] {
  const path = [parentPath, command.name()].filter(Boolean).join(" ");
  const ownPaths = command.options.some((option) => option.long === "--app-key")
    ? [path]
    : [];
  return ownPaths.concat(
    command.commands.flatMap((child) => collectAppKeyOptionPaths(child, path)),
  );
}

describe("ncs 명령 옵션", () => {
  it("모든 하위 명령에서 --app-key를 노출하지 않는다", () => {
    const commands = [templateCommand, workloadCommand, malwareCommand];

    expect(commands.flatMap((command) => collectAppKeyOptionPaths(command))).toEqual([]);
  });
});
