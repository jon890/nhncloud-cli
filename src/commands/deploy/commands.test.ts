import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EXIT_CONFIG_ERROR, EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { NhnCloudCliError } from "../../utils/errors.js";

const mocks = vi.hoisted(() => ({
  resolveProfileName: vi.fn(),
  getUserAccessKey: vi.fn(),
  getServiceCredential: vi.fn(),
  getAccessToken: vi.fn(),
  artifacts: vi.fn(),
  startSpinner: vi.fn(),
}));

vi.mock("../../config/credentials.js", () => ({
  resolveProfileName: mocks.resolveProfileName,
  getUserAccessKey: mocks.getUserAccessKey,
  getServiceCredential: mocks.getServiceCredential,
}));
vi.mock("../../api/oauth.js", () => ({ getAccessToken: mocks.getAccessToken }));
vi.mock("../../utils/spinner.js", () => ({
  startSpinner: mocks.startSpinner,
  stopSpinner: vi.fn(),
  setQuiet: vi.fn(),
}));
vi.mock("../../services/deploy/client.js", () => ({
  DeployClient: class {
    artifacts = mocks.artifacts;
  },
}));

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

/** 좌표를 옵션으로만 받으므로 deploy 명령에는 위치 인수가 없어야 한다 (ADR-033). */
function collectArgumentPaths(command: Command, parentPath = ""): string[] {
  const path = [parentPath, command.name()].filter(Boolean).join(" ");
  const ownPaths = command.registeredArguments.length > 0 ? [path] : [];
  return ownPaths.concat(command.commands.flatMap((child) => collectArgumentPaths(child, path)));
}

/**
 * 하위 명령을 실제로 실행한다.
 * action 핸들러는 공개 API 로 꺼낼 수 없어 원본 명령을 그대로 붙이고,
 * `optsWithGlobals` 가 읽는 전역 옵션만 최소로 재현한 부모를 씌운다.
 * 종료는 exitOverride 로 가로채 vitest 프로세스가 죽지 않게 한다.
 */
async function parseLeaf(command: Command, args: string[], globals: string[] = []): Promise<void> {
  const silent = { writeErr: () => {}, writeOut: () => {} };
  command.exitOverride().configureOutput(silent);
  const parent = new Command("deploy")
    .exitOverride()
    .configureOutput(silent)
    .option("--json", "JSON 출력")
    .option("--quiet", "식별자만 출력");
  parent.addCommand(command);

  await parent.parseAsync([...globals, command.name(), ...args], { from: "user" });
}

describe("deploy 명령 위치 인수", () => {
  it("8개 명령 모두 위치 인수를 노출하지 않는다", () => {
    expect(leafCommands.flatMap((command) => collectArgumentPaths(command))).toEqual([]);
  });
});

describe("deploy 좌표 옵션 검증", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.resolveProfileName.mockResolvedValue("p");
    mocks.getUserAccessKey.mockResolvedValue({ id: "<uak-id>", secret: "<uak-secret>" });
    mocks.getServiceCredential.mockResolvedValue({ appkey: "<appkey>" });
    mocks.getAccessToken.mockResolvedValue("access-token");
  });

  const requiresArtifactId: Array<[string, Command, string[]]> = [
    ["binaries", binariesCommand, ["--binary-group", "1"]],
    ["binary-groups", binaryGroupsCommand, []],
    ["download", downloadCommand, ["--binary-group", "1", "--binary-key", "1", "-o", "out.bin"]],
    ["histories", historiesCommand, []],
    ["server-groups", serverGroupsCommand, []],
    ["upload", uploadCommand, ["--file", "package.json", "--binary-group", "1"]],
  ];

  it.each(requiresArtifactId)(
    "%s 는 --artifact-id 없이 부르면 EXIT_PARAM_ERROR 로 거부한다",
    async (_name, command, args) => {
      await expect(parseLeaf(command, args)).rejects.toThrow(
        expect.objectContaining({ exitCode: EXIT_PARAM_ERROR }),
      );
      await expect(parseLeaf(command, args)).rejects.toThrow(/--artifact-id 가 필요합니다/);
    },
  );

  it.each([
    ["--artifact-id", []],
    ["--server-group-id", ["--artifact-id", "1"]],
    ["--scenario-ids", ["--artifact-id", "1", "--server-group-id", "2"]],
  ])("run 은 %s 가 없으면 EXIT_PARAM_ERROR 로 거부한다", async (flag, args) => {
    await expect(parseLeaf(runCommand, args)).rejects.toThrow(
      expect.objectContaining({ exitCode: EXIT_PARAM_ERROR }),
    );
    await expect(parseLeaf(runCommand, args)).rejects.toThrow(new RegExp(`${flag} 가 필요합니다`));
  });

  it("좌표 검증은 spinner 시작과 인증 체인보다 앞선다", async () => {
    await expect(parseLeaf(historiesCommand, [])).rejects.toThrow(
      expect.objectContaining({ exitCode: EXIT_PARAM_ERROR }),
    );

    expect(mocks.startSpinner).not.toHaveBeenCalled();
    expect(mocks.resolveProfileName).not.toHaveBeenCalled();
    expect(mocks.getAccessToken).not.toHaveBeenCalled();
  });

  it("artifacts 는 좌표 없이 동작한다", async () => {
    mocks.artifacts.mockResolvedValue({ artifactId: "1" });
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    await expect(parseLeaf(artifactsCommand, [], ["--json"])).resolves.toBeUndefined();

    expect(mocks.artifacts).toHaveBeenCalledWith("<appkey>");
    stdout.mockRestore();
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
