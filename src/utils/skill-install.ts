import { homedir } from "node:os";
import path from "node:path";
import { lstat, readlink, access, mkdir, rm, symlink } from "node:fs/promises";
import { NhnCloudCliError } from "./errors.js";
import { EXIT_PARAM_ERROR } from "./exit-codes.js";

/** ~/.claude/skills 아래 설치되는 공개 skill 디렉터리 이름. */
export const SKILL_NAME = "nhncloud-cli";

/** ~/.claude 디렉터리 경로. */
export function claudeDir(): string {
  return path.join(homedir(), ".claude");
}

/** ~/.claude/skills/nhncloud-cli 설치 대상 경로. */
export function skillDestPath(): string {
  return path.join(claudeDir(), "skills", SKILL_NAME);
}

/**
 * 번들 위치(`__dirname`)를 기준으로 패키지에 동봉된 skill 원본 경로를 구한다.
 * npm 패키지는 `dist/` 와 `skills/` 가 루트 동일 레벨이라 `dist/../skills/nhncloud-cli` 로 해석된다.
 */
export function skillSourceFrom(bundleDir: string): string {
  return path.resolve(bundleDir, "..", "skills", SKILL_NAME);
}

/**
 * npx 로 실행 중인지 판별한다.
 * npx 는 일회성 임시 디렉터리라 심링크 원본이 사라지므로 설치 대상이 아니다(전역 설치 유도).
 */
export function isNpxRuntime(bundleDir: string): boolean {
  return /_npx[/\\]/.test(bundleDir) || /\.npm[/\\]_npx/.test(bundleDir) || /npx-/.test(bundleDir);
}

export type SkillStatus =
  | { state: "installed-link"; target: string }
  | { state: "broken-link"; target: string }
  | { state: "installed-copy" }
  | { state: "not-installed" };

/**
 * 설치 대상 경로의 현재 상태를 조사한다.
 * IO 만 수행하고 출력·프롬프트는 하지 않아 단위 테스트가 가능하다.
 */
export async function getSkillStatus(dst: string): Promise<SkillStatus> {
  let stat;
  try {
    stat = await lstat(dst);
  } catch {
    return { state: "not-installed" };
  }

  if (!stat.isSymbolicLink()) {
    return { state: "installed-copy" };
  }

  const raw = await readlink(dst);
  const target = path.isAbsolute(raw) ? raw : path.resolve(path.dirname(dst), raw);
  const targetExists = await access(target).then(() => true).catch(() => false);
  return targetExists ? { state: "installed-link", target } : { state: "broken-link", target };
}

export type InstallResult = "linked" | "relinked" | "replaced-copy";

/**
 * skill 원본을 설치 대상에 심링크한다.
 * 기존 심링크는 조용히 갱신하고, 심링크가 아닌 실제 항목은 `force` 없이는 건드리지 않는다(사용자 데이터 보호).
 * 반환값으로 설치 유형을 알려 호출부가 파괴적 교체(`replaced-copy`)를 사용자에게 경고할 수 있게 한다.
 */
export async function installSkillSymlink(src: string, dst: string, force: boolean): Promise<InstallResult> {
  const srcExists = await access(src).then(() => true).catch(() => false);
  if (!srcExists) {
    throw new NhnCloudCliError(`skill 원본을 찾을 수 없습니다: ${src}`, EXIT_PARAM_ERROR);
  }

  const status = await getSkillStatus(dst);
  if (status.state === "installed-copy" && !force) {
    throw new NhnCloudCliError(
      `${dst} 에 심볼릭 링크가 아닌 실제 항목이 있습니다. --force 로 덮어쓰세요.`,
      EXIT_PARAM_ERROR,
    );
  }

  let result: InstallResult = "linked";
  if (status.state === "installed-copy") {
    // force === true 가 보장된 경로(위에서 throw). 실제 디렉터리라 재귀 삭제한다.
    await rm(dst, { recursive: true, force: true });
    result = "replaced-copy";
  } else if (status.state !== "not-installed") {
    // 심링크/깨진 링크 — 링크 자체만 제거(재귀 불필요, 원본 보호).
    await rm(dst, { force: true });
    result = "relinked";
  }

  await mkdir(path.dirname(dst), { recursive: true });
  await symlink(src, dst);
  return result;
}

/**
 * 설치된 skill 심링크를 제거한다.
 * 심링크가 아닌 실제 디렉터리는 제거하지 않고 에러를 던진다(사용자 데이터 보호).
 */
export async function uninstallSkill(dst: string): Promise<"removed" | "absent"> {
  const status = await getSkillStatus(dst);
  if (status.state === "not-installed") {
    return "absent";
  }
  if (status.state === "installed-copy") {
    throw new NhnCloudCliError(
      `${dst} 는 심볼릭 링크가 아니라 실제 디렉터리입니다. 직접 확인 후 제거하세요.`,
      EXIT_PARAM_ERROR,
    );
  }
  await rm(dst, { force: true });
  return "removed";
}
