import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rename as fsRename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NhnCloudCliError } from "../utils/errors.js";
import type { SkillManagerContext } from "./context.js";
import { MANIFEST_FILE_NAME } from "./manifest.js";
import {
  inspectSkill,
  installSkill,
  type SkillManagerOperations,
  uninstallSkill,
} from "./manager.js";

let root: string;
let context: SkillManagerContext;

function sourceRoot(): string {
  return path.join(context.packageRoot, "skills", "nhncloud-cli");
}

function destination(): string {
  return path.join(context.homeDir, ".claude", "skills", "nhncloud-cli");
}

async function writeSource(content = "# NHN Cloud CLI\n", reference = "guide\n"): Promise<void> {
  const source = sourceRoot();
  await mkdir(path.join(source, "references"), { recursive: true });
  await writeFile(path.join(source, "SKILL.md"), content);
  await writeFile(path.join(source, "references", "guide.md"), reference);
}

async function replaceDestinationWithLink(target: string): Promise<void> {
  await rm(destination(), { recursive: true, force: true });
  await mkdir(path.dirname(destination()), { recursive: true });
  await symlink(target, destination());
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "nhncloud-skill-manager-"));
  context = {
    homeDir: path.join(root, "home"),
    packageRoot: path.join(root, "package"),
    currentVersion: "1.0.0",
    dataRoot: path.join(root, "data"),
  };
  await writeSource();
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("inspectSkill", () => {
  it("설치 상태 객체에 status 필드와 공통 경로 정보를 제공한다", async () => {
    const status = await inspectSkill(context);

    expect(status).toEqual({
      schemaVersion: 1,
      status: "missing",
      destination: destination(),
      source: sourceRoot(),
      currentVersion: "1.0.0",
      managed: false,
    });
    expect(status).not.toHaveProperty("state");
  });

  it("관리 저장소의 정상·수정·손상 상태를 구분한다", async () => {
    const installed = await installSkill(context);
    expect((await inspectSkill(context)).status).toBe("current");

    await writeFile(path.join(installed.repositoryPath, "SKILL.md"), "사용자 수정\n");
    expect(await inspectSkill(context)).toMatchObject({ status: "modified", managed: true });

    await writeFile(path.join(installed.repositoryPath, MANIFEST_FILE_NAME), "{}\n");
    expect(await inspectSkill(context)).toMatchObject({ status: "corrupt", managed: true });
  });

  it("관리 저장소의 경로 이름이 손상되면 corrupt로 판정한다", async () => {
    const malformed = path.join(context.dataRoot, "skills", "bad-name");
    await mkdir(malformed, { recursive: true });
    await replaceDestinationWithLink(malformed);

    expect(await inspectSkill(context)).toMatchObject({
      status: "corrupt",
      linkTarget: malformed,
      managed: true,
    });
  });

  it("관리형·기존 패키지 형태의 깨진 링크만 broken managed로 판정한다", async () => {
    const managedTarget = path.join(context.dataRoot, "skills", `0.9.0-${"a".repeat(64)}`);
    await replaceDestinationWithLink(managedTarget);
    expect(await inspectSkill(context)).toMatchObject({
      status: "broken",
      installedVersion: "0.9.0",
      managed: true,
    });

    const packageTarget = path.join(
      root,
      "node_modules",
      "@bifos",
      "nhncloud-cli",
      "skills",
      "nhncloud-cli",
    );
    await replaceDestinationWithLink(packageTarget);
    expect(await inspectSkill(context)).toMatchObject({ status: "broken", managed: true });

    await replaceDestinationWithLink(path.join(root, "unknown", "skills", "nhncloud-cli"));
    expect(await inspectSkill(context)).toMatchObject({ status: "unmanaged", managed: false });
  });

  it("package metadata가 일치하는 기존 직접 링크는 outdated managed로 판정한다", async () => {
    const legacyPackage = path.join(root, "legacy-package");
    const legacySkill = path.join(legacyPackage, "skills", "nhncloud-cli");
    await mkdir(path.join(legacySkill, "references"), { recursive: true });
    await writeFile(
      path.join(legacyPackage, "package.json"),
      JSON.stringify({ name: "@bifos/nhncloud-cli", version: "0.9.0" }),
    );
    await writeFile(path.join(legacySkill, "SKILL.md"), "legacy\n");
    await replaceDestinationWithLink(legacySkill);

    expect(await inspectSkill(context)).toMatchObject({
      status: "outdated",
      installedVersion: "0.9.0",
      linkTarget: legacySkill,
      managed: true,
    });
  });

  it("실제 디렉터리와 알 수 없는 유효 링크는 unmanaged로 판정한다", async () => {
    await mkdir(destination(), { recursive: true });
    expect(await inspectSkill(context)).toMatchObject({ status: "unmanaged", managed: false });

    const unknown = path.join(root, "unknown-skill");
    await mkdir(unknown);
    await replaceDestinationWithLink(unknown);
    expect(await inspectSkill(context)).toMatchObject({ status: "unmanaged", managed: false });
  });
});

describe("installSkill", () => {
  it("install → source 변경 → outdated → update → current 상태 전이를 수행한다", async () => {
    const first = await installSkill(context);
    expect(first).toMatchObject({
      action: "installed",
      changed: true,
      previousStatus: { status: "missing" },
      status: { status: "current" },
    });
    expect(path.dirname(first.repositoryPath)).toBe(path.join(context.dataRoot, "skills"));
    expect(path.basename(first.repositoryPath)).toMatch(/^1\.0\.0-[0-9a-f]{64}$/);
    expect(await readlink(destination())).toBe(first.repositoryPath);

    await writeSource("# NHN Cloud CLI v2\n");
    context.currentVersion = "2.0.0";
    expect(await inspectSkill(context)).toMatchObject({
      status: "outdated",
      installedVersion: "1.0.0",
      managed: true,
    });

    const updated = await installSkill(context);
    expect(updated).toMatchObject({
      action: "updated",
      changed: true,
      previousStatus: { status: "outdated" },
      status: { status: "current", installedVersion: "2.0.0" },
    });
    expect(updated.repositoryPath).not.toBe(first.repositoryPath);
    expect((await lstat(first.repositoryPath)).isDirectory()).toBe(true);

    const unchanged = await installSkill(context);
    expect(unchanged).toMatchObject({ action: "unchanged", changed: false });
  });

  it("동시에 같은 canonical 저장소를 준비해도 하나의 정상 저장소를 재사용한다", async () => {
    const [left, right] = await Promise.all([installSkill(context), installSkill(context)]);

    expect(left.repositoryPath).toBe(right.repositoryPath);
    expect((await inspectSkill(context)).status).toBe("current");
    const entries = await readdir(path.join(context.dataRoot, "skills"));
    expect(entries.filter((entry) => !entry.startsWith(".staging-")).length).toBe(1);
    expect(entries.some((entry) => entry.startsWith(".staging-"))).toBe(false);
  });

  it("사용자 디렉터리는 force 없이 보존하고 force에서는 백업한다", async () => {
    await mkdir(destination(), { recursive: true });
    const userFile = path.join(destination(), "user.md");
    await writeFile(userFile, "사용자 내용\n");

    await expect(installSkill(context)).rejects.toBeInstanceOf(NhnCloudCliError);
    expect(await readFile(userFile, "utf8")).toBe("사용자 내용\n");

    const result = await installSkill(context, { force: true });
    expect(result.action).toBe("replaced");
    expect(result.backupPaths).toHaveLength(1);
    expect(await readFile(path.join(result.backupPaths[0], "user.md"), "utf8")).toBe("사용자 내용\n");
    expect((await inspectSkill(context)).status).toBe("current");
  });

  it("경로 구분자가 포함된 package version은 저장소 밖에 쓰지 않는다", async () => {
    context.currentVersion = "../outside";

    await expect(installSkill(context)).rejects.toBeInstanceOf(NhnCloudCliError);
    await expect(lstat(path.join(context.dataRoot, "outside"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("활성 링크 전환 실패 시 사용자 항목 백업을 원래 위치로 복원한다", async () => {
    await mkdir(destination(), { recursive: true });
    const userFile = path.join(destination(), "user.md");
    await writeFile(userFile, "복원할 내용\n");
    const operations: SkillManagerOperations = {
      async rename(oldPath, newPath) {
        if (
          typeof oldPath === "string" &&
          path.basename(oldPath).startsWith(".nhncloud-cli.link-") &&
          newPath === destination()
        ) {
          throw new Error("의도한 링크 전환 실패");
        }
        await fsRename(oldPath, newPath);
      },
    };

    await expect(installSkill(context, { force: true }, operations)).rejects.toThrow(
      "백업을 복원했습니다",
    );
    expect((await lstat(destination())).isDirectory()).toBe(true);
    expect(await readFile(userFile, "utf8")).toBe("복원할 내용\n");
  });

  it("손상된 canonical 저장소는 force에서 UTC 백업 후 복구한다", async () => {
    const installed = await installSkill(context);
    await writeFile(path.join(installed.repositoryPath, MANIFEST_FILE_NAME), "손상된 매니페스트\n");
    expect((await inspectSkill(context)).status).toBe("corrupt");

    await expect(installSkill(context)).rejects.toBeInstanceOf(NhnCloudCliError);
    const recovered = await installSkill(context, { force: true });

    expect(recovered.action).toBe("recovered");
    expect(recovered.backupPaths).toHaveLength(1);
    expect(path.basename(recovered.backupPaths[0])).toMatch(
      /\.backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-/,
    );
    expect(await readFile(path.join(recovered.backupPaths[0], MANIFEST_FILE_NAME), "utf8")).toBe(
      "손상된 매니페스트\n",
    );
    expect((await inspectSkill(context)).status).toBe("current");
  });

  it("수정된 canonical 저장소도 force 없이 보존하고 force에서 백업한다", async () => {
    const installed = await installSkill(context);
    const skillPath = path.join(installed.repositoryPath, "SKILL.md");
    await writeFile(skillPath, "사용자 수정본\n");

    await expect(installSkill(context)).rejects.toBeInstanceOf(NhnCloudCliError);
    expect(await readFile(skillPath, "utf8")).toBe("사용자 수정본\n");

    const recovered = await installSkill(context, { force: true });
    expect(recovered.backupPaths).toHaveLength(1);
    expect(await readFile(path.join(recovered.backupPaths[0], "SKILL.md"), "utf8")).toBe(
      "사용자 수정본\n",
    );
    expect((await inspectSkill(context)).status).toBe("current");
  });

  it("손상 저장소 교체 실패 시 기존 저장소를 복원한다", async () => {
    const installed = await installSkill(context);
    const skillPath = path.join(installed.repositoryPath, "SKILL.md");
    await writeFile(skillPath, "복원할 수정본\n");
    const operations: SkillManagerOperations = {
      async rename(oldPath, newPath) {
        if (
          typeof oldPath === "string" &&
          path.basename(oldPath).startsWith(".staging-") &&
          newPath === installed.repositoryPath
        ) {
          throw new Error("의도한 저장소 전환 실패");
        }
        await fsRename(oldPath, newPath);
      },
    };

    await expect(installSkill(context, { force: true }, operations)).rejects.toThrow(
      "백업을 복원했습니다",
    );
    expect(await readFile(skillPath, "utf8")).toBe("복원할 수정본\n");
    expect((await inspectSkill(context)).status).toBe("modified");
  });
});

describe("uninstallSkill", () => {
  it("활성 링크만 제거하고 관리 저장소는 보존한다", async () => {
    const installed = await installSkill(context);

    expect(await uninstallSkill(context)).toBe("removed");
    await expect(lstat(destination())).rejects.toMatchObject({ code: "ENOENT" });
    expect((await lstat(installed.repositoryPath)).isDirectory()).toBe(true);
    expect(await uninstallSkill(context)).toBe("absent");
  });

  it("실제 디렉터리는 제거하지 않는다", async () => {
    await mkdir(destination(), { recursive: true });

    await expect(uninstallSkill(context)).rejects.toBeInstanceOf(NhnCloudCliError);
    expect((await lstat(destination())).isDirectory()).toBe(true);
  });

  it("알 수 없는 유효 링크와 깨진 링크는 제거하지 않는다", async () => {
    const validTarget = path.join(root, "user-skill");
    await mkdir(validTarget);
    await replaceDestinationWithLink(validTarget);

    await expect(uninstallSkill(context)).rejects.toBeInstanceOf(NhnCloudCliError);
    expect(await readlink(destination())).toBe(validTarget);

    const brokenTarget = path.join(root, "missing-user-skill");
    await replaceDestinationWithLink(brokenTarget);

    await expect(uninstallSkill(context)).rejects.toBeInstanceOf(NhnCloudCliError);
    expect(await readlink(destination())).toBe(brokenTarget);
  });

  it("관리 저장소와 기존 패키지 형태의 깨진 링크는 제거한다", async () => {
    const managedTarget = path.join(context.dataRoot, "skills", `0.9.0-${"a".repeat(64)}`);
    await replaceDestinationWithLink(managedTarget);

    expect(await uninstallSkill(context)).toBe("removed");
    await expect(lstat(destination())).rejects.toMatchObject({ code: "ENOENT" });

    const packageTarget = path.join(
      root,
      "node_modules",
      "@bifos",
      "nhncloud-cli",
      "skills",
      "nhncloud-cli",
    );
    await replaceDestinationWithLink(packageTarget);

    expect(await uninstallSkill(context)).toBe("removed");
    await expect(lstat(destination())).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("패키지 metadata로 확인된 기존 직접 링크는 제거한다", async () => {
    const legacyPackage = path.join(root, "legacy-package");
    const legacySkill = path.join(legacyPackage, "skills", "nhncloud-cli");
    await mkdir(legacySkill, { recursive: true });
    await writeFile(
      path.join(legacyPackage, "package.json"),
      JSON.stringify({ name: "@bifos/nhncloud-cli", version: "0.9.0" }),
    );
    await replaceDestinationWithLink(legacySkill);

    expect(await uninstallSkill(context)).toBe("removed");
    await expect(lstat(destination())).rejects.toMatchObject({ code: "ENOENT" });
    expect((await lstat(legacySkill)).isDirectory()).toBe(true);
  });

  it("검사 후 제거 직전에 링크 대상이 바뀌면 새 링크를 보존한다", async () => {
    await installSkill(context);
    const unmanagedTarget = path.join(root, "replacement-skill");
    await mkdir(unmanagedTarget);
    let replaced = false;
    const operations: SkillManagerOperations = {
      async rename(oldPath, newPath) {
        if (!replaced && oldPath === destination()) {
          replaced = true;
          await replaceDestinationWithLink(unmanagedTarget);
        }
        await fsRename(oldPath, newPath);
      },
    };

    await expect(uninstallSkill(context, operations)).rejects.toBeInstanceOf(NhnCloudCliError);
    expect(await readlink(destination())).toBe(unmanagedTarget);
  });
});
