import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SkillManagerContext } from "../skill/context.js";
import type {
  SkillInstallResult,
  SkillStatus,
  SkillsStatus,
  SkillUninstallResult,
} from "../skill/manager.js";
import {
  createSkillsCommand,
  type SkillCommandDependencies,
} from "./skills.js";
import { skillRecoveryCommand } from "./skills-output.js";

const context: SkillManagerContext = {
  homeDir: "/home/tester",
  packageRoot: "/package",
  currentVersion: "1.2.3",
  dataRoot: "/home/tester/.local/share/nhncloud-cli",
};

const outdatedStatus: SkillStatus = {
  schemaVersion: 1,
  status: "outdated",
  destination: "/home/tester/.claude/skills/nhncloud-cli",
  source: "/package/skills/nhncloud-cli",
  currentVersion: "1.2.3",
  installedVersion: "1.1.0",
  linkTarget: "/package-old/skills/nhncloud-cli",
  managed: true,
};

const currentStatus: SkillStatus = {
  ...outdatedStatus,
  status: "current",
  installedVersion: "1.2.3",
  linkTarget: "/home/tester/.local/share/nhncloud-cli/skills/1.2.3-digest",
};

function withAgents(status: SkillStatus): SkillsStatus {
  return {
    ...status,
    agents: {
      claude: status,
      codex: { ...status, destination: codexDestination },
    },
  };
}

const codexDestination = "/home/tester/.agents/skills/nhncloud-cli";

const outdatedSkills = withAgents(outdatedStatus);

const uninstallResult: SkillUninstallResult = {
  action: "removed",
  agents: {
    claude: { action: "removed", destination: outdatedStatus.destination },
    codex: { action: "absent", destination: codexDestination },
  },
};

const updatedResult: SkillInstallResult = {
  schemaVersion: 1,
  action: "updated",
  changed: true,
  previousStatus: withAgents(outdatedStatus),
  status: withAgents(currentStatus),
  repositoryPath: currentStatus.linkTarget ?? "",
  backupPaths: ["/home/tester/.claude/skills/nhncloud-cli.backup-test"],
};

let dependencies: SkillCommandDependencies;

function programWithSkills(): Command {
  return new Command("nhncloud")
    .exitOverride()
    .option("--json")
    .option("--quiet")
    .addCommand(createSkillsCommand(dependencies));
}

function stdoutText(): string {
  return vi.mocked(process.stdout.write).mock.calls.map(([value]) => String(value)).join("");
}

beforeEach(() => {
  dependencies = {
    createContext: vi.fn(() => context),
    inspect: vi.fn(async () => outdatedSkills),
    install: vi.fn(async () => updatedResult),
    uninstall: vi.fn(async () => uninstallResult),
  };
  vi.spyOn(process.stdout, "write").mockImplementation((() => true) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("skills status", () => {
  it("skills와 skills status가 같은 기본 상태 정보를 출력한다", async () => {
    await programWithSkills().parseAsync(["node", "nhncloud", "skills"]);
    const parentOutput = stdoutText();

    vi.mocked(process.stdout.write).mockClear();
    await programWithSkills().parseAsync(["node", "nhncloud", "skills", "status"]);

    expect(stdoutText()).toBe(parentOutput);
    expect(parentOutput).toContain("outdated");
    expect(parentOutput).toContain("1.2.3");
    expect(parentOutput).toContain("1.1.0");
    expect(parentOutput).toContain(outdatedStatus.destination);
    expect(parentOutput).toContain(outdatedStatus.linkTarget);
    expect(parentOutput).toContain("nhncloud skills update");
    expect(parentOutput).toContain("Claude Code 상태");
    expect(parentOutput).toContain("Codex 상태");
    expect(parentOutput).toContain(codexDestination);
    expect(dependencies.inspect).toHaveBeenCalledTimes(2);
  });

  it("--json은 상태 객체만 stdout에 출력한다", async () => {
    await programWithSkills().parseAsync([
      "node",
      "nhncloud",
      "skills",
      "status",
      "--json",
    ]);

    expect(JSON.parse(stdoutText())).toEqual({
      ...outdatedStatus,
      agents: {
        claude: outdatedStatus,
        codex: { ...outdatedStatus, destination: codexDestination },
      },
    });
  });

  it("--quiet은 상태 토큰 하나만 stdout에 출력한다", async () => {
    await programWithSkills().parseAsync([
      "node",
      "nhncloud",
      "skills",
      "status",
      "--quiet",
    ]);

    expect(stdoutText()).toBe("outdated\n");
  });

  it("--quiet은 경로별 상태가 달라도 합친 상태 토큰만 출력한다", async () => {
    vi.mocked(dependencies.inspect).mockResolvedValue({
      ...currentStatus,
      status: "missing",
      agents: {
        claude: currentStatus,
        codex: {
          ...currentStatus,
          status: "missing",
          destination: codexDestination,
          installedVersion: undefined,
          linkTarget: undefined,
          managed: false,
        },
      },
    });

    await programWithSkills().parseAsync([
      "node",
      "nhncloud",
      "skills",
      "status",
      "--quiet",
    ]);

    expect(stdoutText()).toBe("missing\n");
  });
});

describe("skills install/update/uninstall", () => {
  it.each(["install", "update"] as const)(
    "%s --force가 같은 설치기에 force=true를 전달한다",
    async (commandName) => {
      await programWithSkills().parseAsync([
        "node",
        "nhncloud",
        "skills",
        commandName,
        "--force",
        "--quiet",
      ]);

      expect(dependencies.install).toHaveBeenCalledWith(context, { force: true });
      expect(stdoutText()).toBe("current\n");
    },
  );

  it("--json은 상태 전이와 백업 경로를 포함한 설치 결과만 출력한다", async () => {
    await programWithSkills().parseAsync([
      "node",
      "nhncloud",
      "skills",
      "update",
      "--force",
      "--json",
    ]);

    expect(JSON.parse(stdoutText())).toEqual(updatedResult);
  });

  it("current 설치는 성공 no-op과 변경 없음을 기본 출력으로 보여준다", async () => {
    vi.mocked(dependencies.install).mockResolvedValue({
      ...updatedResult,
      action: "unchanged",
      changed: false,
      previousStatus: withAgents(currentStatus),
      backupPaths: [],
    });

    await programWithSkills().parseAsync(["node", "nhncloud", "skills", "install"]);

    expect(stdoutText()).toContain("이미 최신 상태");
    expect(stdoutText()).toContain("변경 없음");
    expect(stdoutText()).toContain("없음");
  });

  it("uninstall은 활성 링크만 제거하고 관리 저장소 보존을 출력한다", async () => {
    await programWithSkills().parseAsync([
      "node",
      "nhncloud",
      "skills",
      "uninstall",
      "--json",
    ]);

    expect(dependencies.uninstall).toHaveBeenCalledWith(context);
    expect(dependencies.inspect).not.toHaveBeenCalled();
    expect(JSON.parse(stdoutText())).toEqual({
      schemaVersion: 1,
      action: "removed",
      changed: true,
      status: "missing",
      destination: outdatedStatus.destination,
      repositoryPreserved: true,
      agents: {
        claude: { action: "removed", destination: outdatedStatus.destination },
        codex: { action: "absent", destination: codexDestination },
      },
    });
  });

  it("uninstall 기본 출력은 경로별 결과를 보여준다", async () => {
    await programWithSkills().parseAsync(["node", "nhncloud", "skills", "uninstall"]);

    const text = stdoutText();
    expect(text).toContain("Claude Code 결과");
    expect(text).toContain("활성 링크 제거");
    expect(text).toContain("Codex 결과");
    expect(text).toContain("활성 링크 없음");
    expect(text).toContain(codexDestination);
  });
});

describe("skillRecoveryCommand", () => {
  it("doctor와 상태 출력이 사용하는 복구 명령을 상태별로 고정한다", () => {
    expect(skillRecoveryCommand("current")).toBeUndefined();
    expect(skillRecoveryCommand("missing")).toBe("nhncloud skills install");
    expect(skillRecoveryCommand("outdated")).toBe("nhncloud skills update");
    expect(skillRecoveryCommand("broken")).toBe("nhncloud skills update");
    expect(skillRecoveryCommand("modified")).toBe("nhncloud skills update --force");
    expect(skillRecoveryCommand("corrupt")).toBe("nhncloud skills update --force");
    expect(skillRecoveryCommand("unmanaged")).toBe("nhncloud skills update --force");
  });
});
