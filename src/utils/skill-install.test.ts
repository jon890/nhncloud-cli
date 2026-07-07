import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, symlink, writeFile, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  skillSourceFrom,
  isNpxRuntime,
  getSkillStatus,
  installSkillSymlink,
  uninstallSkill,
} from "./skill-install.js";
import { NhnCloudCliError } from "./errors.js";

let dir: string;
let src: string;
let dst: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "ncc-skill-"));
  src = path.join(dir, "src-skill");
  dst = path.join(dir, "claude", "skills", "nhncloud-cli");
  await mkdir(src, { recursive: true });
  await writeFile(path.join(src, "SKILL.md"), "# skill");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("skillSourceFrom", () => {
  it("번들 디렉터리 기준 ../skills/nhncloud-cli 로 해석한다", () => {
    expect(skillSourceFrom("/pkg/dist")).toBe("/pkg/skills/nhncloud-cli");
  });
});

describe("isNpxRuntime", () => {
  it("_npx 경로를 npx 로 판별한다", () => {
    expect(isNpxRuntime("/Users/x/.npm/_npx/abc/node_modules/@bifos/nhncloud-cli/dist")).toBe(true);
  });
  it("전역 설치 경로는 npx 가 아니다", () => {
    expect(isNpxRuntime("/usr/local/lib/node_modules/@bifos/nhncloud-cli/dist")).toBe(false);
  });
});

describe("getSkillStatus", () => {
  it("대상이 없으면 not-installed", async () => {
    expect((await getSkillStatus(dst)).state).toBe("not-installed");
  });

  it("유효한 심링크면 installed-link", async () => {
    await mkdir(path.dirname(dst), { recursive: true });
    await symlink(src, dst);
    const status = await getSkillStatus(dst);
    expect(status.state).toBe("installed-link");
  });

  it("원본이 사라진 심링크면 broken-link", async () => {
    await mkdir(path.dirname(dst), { recursive: true });
    await symlink(path.join(dir, "gone"), dst);
    expect((await getSkillStatus(dst)).state).toBe("broken-link");
  });

  it("실제 디렉터리면 installed-copy", async () => {
    await mkdir(dst, { recursive: true });
    expect((await getSkillStatus(dst)).state).toBe("installed-copy");
  });
});

describe("installSkillSymlink", () => {
  it("최초 설치는 linked + 심링크 생성", async () => {
    const result = await installSkillSymlink(src, dst, false);
    expect(result).toBe("linked");
    expect((await lstat(dst)).isSymbolicLink()).toBe(true);
  });

  it("기존 심링크가 있으면 relinked", async () => {
    await installSkillSymlink(src, dst, false);
    expect(await installSkillSymlink(src, dst, false)).toBe("relinked");
  });

  it("원본이 없으면 EXIT_PARAM_ERROR", async () => {
    await expect(installSkillSymlink(path.join(dir, "nope"), dst, false)).rejects.toBeInstanceOf(
      NhnCloudCliError,
    );
  });

  it("실제 디렉터리는 force 없이 거부", async () => {
    await mkdir(dst, { recursive: true });
    await expect(installSkillSymlink(src, dst, false)).rejects.toBeInstanceOf(NhnCloudCliError);
  });

  it("실제 디렉터리도 force 면 심링크로 교체", async () => {
    await mkdir(dst, { recursive: true });
    expect(await installSkillSymlink(src, dst, true)).toBe("relinked");
    expect((await lstat(dst)).isSymbolicLink()).toBe(true);
  });
});

describe("uninstallSkill", () => {
  it("심링크를 제거하면 removed", async () => {
    await installSkillSymlink(src, dst, false);
    expect(await uninstallSkill(dst)).toBe("removed");
    expect((await getSkillStatus(dst)).state).toBe("not-installed");
  });

  it("설치가 없으면 absent", async () => {
    expect(await uninstallSkill(dst)).toBe("absent");
  });

  it("실제 디렉터리는 제거하지 않고 거부", async () => {
    await mkdir(dst, { recursive: true });
    await expect(uninstallSkill(dst)).rejects.toBeInstanceOf(NhnCloudCliError);
  });
});
