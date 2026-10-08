import { describe, expect, it } from "vitest";
import { checkVersion, findMissingPackedFiles } from "./verify-package.mjs";

describe("checkVersion", () => {
  it("같으면 빈 배열을 돌려준다", () => {
    expect(checkVersion("1.2.3", "1.2.3")).toEqual([]);
  });

  it("다르면 두 버전이 든 불일치 메시지를 돌려준다", () => {
    const failures = checkVersion("9.9.9", "0.18.0");
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("9.9.9");
    expect(failures[0]).toContain("0.18.0");
  });
});

describe("findMissingPackedFiles", () => {
  const tracked = ["skills/nhncloud-cli/SKILL.md", "skills/nhncloud-cli/references/a.md"];

  it("pack 목록에 없는 추적 파일을 돌려준다", () => {
    const packed = ["skills/nhncloud-cli/SKILL.md", "README.md", "dist/index.js"];
    expect(findMissingPackedFiles(tracked, packed, ["README.md", "dist/index.js"])).toEqual([
      "skills/nhncloud-cli/references/a.md",
    ]);
  });

  it("모두 있으면 빈 배열이다", () => {
    const packed = [...tracked, "README.md", "dist/index.js"];
    expect(findMissingPackedFiles(tracked, packed, ["README.md", "dist/index.js"])).toEqual([]);
  });

  it("필수 파일이 없으면 그 파일을 돌려준다", () => {
    expect(findMissingPackedFiles([], tracked, ["dist/index.js"])).toEqual(["dist/index.js"]);
  });

  it("추적 파일이 하나도 없으면 빈 배열이다", () => {
    expect(findMissingPackedFiles([], [], [])).toEqual([]);
  });
});
