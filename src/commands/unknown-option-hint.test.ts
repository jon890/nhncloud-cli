import { describe, expect, it } from "vitest";
import {
  buildUnknownOptionHint,
  findReferencedArgument,
  parseUnknownOptionName,
} from "./unknown-option-hint.js";

describe("parseUnknownOptionName", () => {
  it.each([
    ["error: unknown option '--instance-id'", "instance-id"],
    ["error: unknown option '--instance-id=x'", "instance-id"],
    ["error: unknown option '--regoin'\n(Did you mean --region?)", "regoin"],
    ["error: unknown option '-i'", undefined],
    ["error: required option '--name <name>' not specified", undefined],
  ])("%j 에서 %j 를 꺼낸다", (message, expected) => {
    expect(parseUnknownOptionName(message)).toBe(expected);
  });
});

describe("findReferencedArgument", () => {
  it.each([
    ["id", "nhncloud instance get", ["id"], "id"],
    ["volume-id", "nhncloud instance volume detach", ["id", "volumeId"], "volumeId"],
    ["instance", "nhncloud instance security-group add", ["instance-id", "group"], "instance-id"],
    ["instance-id", "nhncloud instance get", ["id"], "id"],
    ["template-id", "nhncloud ncs template version get", ["id", "version"], "id"],
    ["post", "nhncloud post get", ["post-number", "post-id"], undefined],
    ["x-id", "nhncloud x get", ["id", "x-id-name"], undefined],
    ["cluster-id", "nhncloud nks cluster get", ["cluster"], undefined],
    ["nhncloud-id", "nhncloud get", ["id"], undefined],
    ["version-id", "nhncloud ncs template version get", ["id", "version"], undefined],
    ["region", "nhncloud instance get", ["id"], undefined],
    ["id", "nhncloud instance list", [], undefined],
  ])("--%s 는 %s 에서 %j 를 가리킨다", (optionName, commandPath, argumentNames, expected) => {
    expect(findReferencedArgument(optionName, commandPath.split(" "), argumentNames)).toBe(expected);
  });
});

describe("buildUnknownOptionHint", () => {
  const getInput = {
    message: "error: unknown option '--instance-id'",
    commandPath: ["nhncloud", "instance", "get"],
    usage: "[options] <id>",
    arguments: [{ name: "id", required: true, variadic: false }],
  };

  it("위치 인수를 가리키면 안내 두 줄을 돌려준다", () => {
    expect(buildUnknownOptionHint(getInput)).toBe(
      "안내: --instance-id 는 옵션이 아닙니다. 위치 인수 <id> 로 전달하세요.\n" +
        "사용법: nhncloud instance get [options] <id>\n",
    );
  });

  it("선택 인수는 대괄호로 적는다", () => {
    const hint = buildUnknownOptionHint({
      ...getInput,
      message: "error: unknown option '--region'",
      arguments: [{ name: "region", required: false, variadic: false }],
    });
    expect(hint.split("\n")[0]).toContain("위치 인수 [region] 로");
  });

  it("가변 인수는 말줄임표를 붙인다", () => {
    const hint = buildUnknownOptionHint({
      ...getInput,
      message: "error: unknown option '--ids'",
      arguments: [{ name: "ids", required: true, variadic: true }],
    });
    expect(hint.split("\n")[0]).toContain("위치 인수 <ids...> 로");
  });

  it("맞는 인수가 없으면 빈 문자열이다", () => {
    expect(buildUnknownOptionHint({ ...getInput, message: "error: unknown option '--idd'" })).toBe("");
  });

  it("알 수 없는 옵션 오류가 아니면 빈 문자열이다", () => {
    expect(
      buildUnknownOptionHint({
        ...getInput,
        message: "error: required option '--name <name>' not specified",
      }),
    ).toBe("");
  });

  it("Commander가 비슷한 옵션을 제안했으면 빈 문자열이다", () => {
    const input = {
      message: "error: unknown option '--volume-id'\n(Did you mean --volume?)",
      commandPath: ["nhncloud", "instance", "volume", "attach"],
      usage: "[options] <id>",
      arguments: [{ name: "id", required: true, variadic: false }],
    };
    expect(findReferencedArgument("volume-id", input.commandPath, ["id"])).toBe("id");
    expect(buildUnknownOptionHint(input)).toBe("");
  });
});
