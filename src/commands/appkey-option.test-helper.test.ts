import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { collectAppKeyOptionPaths, collectOptionPaths } from "./appkey-option.test-helper.js";

/**
 * 이 파일은 헬퍼 자체의 양성 대조다.
 *
 * 네 서비스의 회귀 테스트는 `collectAppKeyOptionPaths(...)` 가 `[]` 임을 단언한다.
 * 부정 단언이라 헬퍼가 아무것도 찾지 못하게 망가지면 넷 다 조용히 통과한다 —
 * 실측으로 확인했다. 그래서 "찾아야 할 것을 실제로 찾는다" 를 여기서 한 번 고정한다.
 */
describe("appkey-option 테스트 헬퍼", () => {
  function tree(): Command {
    const leaf = new Command("leaf").option("--app-key <k>", "노출된 오버라이딩 옵션");
    const child = new Command("child").option("--artifact-id <id>", "좌표");
    child.addCommand(leaf);
    const root = new Command("root");
    root.addCommand(child);
    return root;
  }

  it("--app-key 를 노출하는 명령 경로를 전체 깊이에서 찾는다", () => {
    expect(collectAppKeyOptionPaths(tree())).toEqual(["root child leaf"]);
  });

  it("임의의 long 옵션도 같은 방식으로 찾는다", () => {
    expect(collectOptionPaths(tree(), "--artifact-id")).toEqual(["root child"]);
  });

  it("노출하지 않는 트리에서는 빈 배열이다", () => {
    expect(collectAppKeyOptionPaths(new Command("root"))).toEqual([]);
  });
});
