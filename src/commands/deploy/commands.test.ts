import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EXIT_CONFIG_ERROR, EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { NhnCloudCliError } from "../../utils/errors.js";

const mocks = vi.hoisted(() => ({
  resolveProfileName: vi.fn(),
  getUserAccessKey: vi.fn(),
  getServiceCredential: vi.fn(),
  getDeployTarget: vi.fn(),
  getAccessToken: vi.fn(),
}));

vi.mock("../../config/credentials.js", () => ({
  resolveProfileName: mocks.resolveProfileName,
  getUserAccessKey: mocks.getUserAccessKey,
  getServiceCredential: mocks.getServiceCredential,
  getDeployTarget: mocks.getDeployTarget,
}));
vi.mock("../../api/oauth.js", () => ({ getAccessToken: mocks.getAccessToken }));

import { artifactsCommand } from "./artifacts.js";
import { binariesCommand } from "./binaries.js";
import { binaryGroupsCommand } from "./binary-groups.js";
import { downloadCommand } from "./download.js";
import { historiesCommand } from "./histories.js";
import { runCommand } from "./run.js";
import { serverGroupsCommand } from "./server-groups.js";
import { uploadCommand } from "./upload.js";
import { resolveDeployAppKey } from "./helpers.js";

const leafCommands = [
  artifactsCommand,
  binariesCommand,
  binaryGroupsCommand,
  downloadCommand,
  historiesCommand,
  runCommand,
  serverGroupsCommand,
  uploadCommand,
];

/** ncr/commands.test.ts 와 같은 형태 — 특정 long 옵션을 노출하는 명령 경로를 모은다. */
function collectOptionPaths(command: Command, long: string, parentPath = ""): string[] {
  const path = [parentPath, command.name()].filter(Boolean).join(" ");
  const ownPaths = command.options.some((option) => option.long === long) ? [path] : [];
  return ownPaths.concat(
    command.commands.flatMap((child) => collectOptionPaths(child, long, path)),
  );
}

describe("deploy 명령 옵션", () => {
  it("모든 하위 명령에서 --app-key 를 노출하지 않는다", () => {
    expect(leafCommands.flatMap((command) => collectOptionPaths(command, "--app-key"))).toEqual(
      [],
    );
  });

  it("좌표 옵션 --artifact-id 는 그대로 남는다", () => {
    // 좌표(artifactId 등)는 여전히 target 과 옵션에서 읽는다 — appkey 만 profile 로 옮겼다.
    expect(
      leafCommands.flatMap((command) => collectOptionPaths(command, "--artifact-id")),
    ).toEqual([
      "binaries",
      "binary-groups",
      "download",
      "histories",
      "run",
      "server-groups",
      "upload",
    ]);
  });

  it("--app-key 를 넘기면 알 수 없는 옵션으로 거부한다", () => {
    // Commander 는 unknown option 을 자체 에러로 처리한다 — 종료·출력은 테스트에서 가로챈다.
    // copyInheritedSettings 는 exitOverride·configureOutput 을 덮으므로 쓰지 않는다.
    const command = new Command("artifacts")
      .exitOverride()
      .configureOutput({ writeErr: () => {}, writeOut: () => {} });
    artifactsCommand.options.forEach((option) => command.addOption(option));

    expect(() => command.parse(["--app-key", "k"], { from: "user" })).toThrow(
      expect.objectContaining({ code: "commander.unknownOption" }),
    );
  });
});

describe("resolveDeployAppKey", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("profile 의 deploy.appkey 를 반환한다", async () => {
    mocks.getServiceCredential.mockResolvedValue({ appkey: "<appkey>" });

    await expect(resolveDeployAppKey("resolved-profile")).resolves.toBe("<appkey>");
    expect(mocks.getServiceCredential).toHaveBeenCalledWith("deploy", "resolved-profile");
  });

  it.each([undefined, ""])("appkey 가 %j 이면 EXIT_CONFIG_ERROR 와 설정 안내", async (appkey) => {
    mocks.getServiceCredential.mockResolvedValue({ appkey });

    await expect(resolveDeployAppKey("resolved-profile")).rejects.toThrow(
      expect.objectContaining({ exitCode: EXIT_CONFIG_ERROR }),
    );
    await expect(resolveDeployAppKey("resolved-profile")).rejects.toThrow(
      /configure --deploy-appkey/,
    );
  });

  it("deploy 블록 부재(EXIT_CONFIG_ERROR)는 설정 안내로 바꾼다", async () => {
    mocks.getServiceCredential.mockRejectedValue(
      new NhnCloudCliError('profile "p" 에 "deploy" 자격증명이 없습니다.', EXIT_CONFIG_ERROR),
    );

    await expect(resolveDeployAppKey("p")).rejects.toThrow(/configure --deploy-appkey/);
  });

  it("EXIT_CONFIG_ERROR 가 아닌 오류는 원인을 보존해 rethrow 한다", async () => {
    const cause = new NhnCloudCliError("자격증명 파일 파싱 실패", EXIT_PARAM_ERROR);
    mocks.getServiceCredential.mockRejectedValue(cause);

    await expect(resolveDeployAppKey("p")).rejects.toBe(cause);
  });

  it("NhnCloudCliError 가 아닌 오류도 그대로 rethrow 한다", async () => {
    const cause = new SyntaxError("Unexpected token in JSON");
    mocks.getServiceCredential.mockRejectedValue(cause);

    await expect(resolveDeployAppKey("p")).rejects.toBe(cause);
  });
});
