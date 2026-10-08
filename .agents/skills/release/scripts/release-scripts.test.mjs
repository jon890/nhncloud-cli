import { describe, expect, it } from "vitest";
import { extractTargets, findMissing } from "./doc-sync-check.mjs";
import { countEscapeResidue } from "./verify-release.mjs";

describe("extractTargets", () => {
  it("추가된 줄에서 명령 이름과 긴 옵션을 뽑고 삭제 줄과 머리 줄은 무시한다", () => {
    const diff = [
      "--- a/src/commands/foo.ts",
      "+++ b/src/commands/foo.ts",
      "@@ -1,0 +1,4 @@",
      '+export const fooCommand = new Command("foo")',
      '+  .option("-y, --yes", "확인 생략")',
      '+  .option("--dry-run")',
      '+  .requiredOption("--name <name>")',
      '-  .option("--removed")',
      '+++ 가짜 머리 줄 "new Command(\\"ignored\\")"',
    ].join("\n");
    expect(extractTargets(diff).sort()).toEqual(["--dry-run", "--name", "--yes", "foo"]);
  });

  it("requiredOption 다음 줄에 있는 플래그 문자열도 뽑는다", () => {
    const diff = [
      "+++ b/src/commands/lb.ts",
      "+  .requiredOption(",
      '+    "--listener-id <id>",',
      '+    "리스너 ID",',
      "+  )",
    ].join("\n");
    expect(extractTargets(diff)).toEqual(["--listener-id"]);
  });

  it("추가된 줄이 없으면 빈 배열이다", () => {
    expect(extractTargets("")).toEqual([]);
  });
});

describe("findMissing", () => {
  it("어느 파일에도 없는 대상만 남긴다", () => {
    const files = new Map([
      ["README.md", ["nhncloud foo --yes"]],
      ["skills/a.md", ["--dry-run 설명"]],
    ]);
    expect(findMissing(["foo", "--yes", "--dry-run", "--absent"], files)).toEqual(["--absent"]);
  });
});

describe("countEscapeResidue", () => {
  const bt = String.fromCharCode(96);
  const bs = String.fromCharCode(92);

  it("백틱이나 $ 앞의 백슬래시가 든 줄을 센다", () => {
    const body = [`bad ${bs}${bt}x${bs}${bt}`, `bad ${bs}$HOME`, "정상 줄"].join("\n");
    expect(countEscapeResidue(body)).toBe(2);
  });

  it("정상 백틱 코드와 줄 끝 백슬래시는 세지 않는다", () => {
    const body = [`${bt}code${bt}`, `curl -X POST ${bs}`, "  --data x"].join("\n");
    expect(countEscapeResidue(body)).toBe(0);
  });
});
