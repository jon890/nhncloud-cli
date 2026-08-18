import { describe, expect, it } from "vitest";
import { collectAppKeyOptionPaths } from "../appkey-option.test-helper.js";
import { getCommand } from "./get.js";
import { imagesCommand } from "./images.js";
import { listCommand } from "./list.js";
import { tagsCommand } from "./tags.js";

describe("ncr 명령 옵션", () => {
  it("모든 하위 명령에서 --app-key를 노출하지 않는다", () => {
    const commands = [listCommand, getCommand, imagesCommand, tagsCommand];

    expect(commands.flatMap((command) => collectAppKeyOptionPaths(command))).toEqual([]);
  });
});
