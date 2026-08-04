import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { NhnCloudCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

const PACKAGE_NAME = "@bifos/nhncloud-cli";

export interface SkillManagerContext {
  homeDir: string;
  packageRoot: string;
  currentVersion: string;
  dataRoot: string;
}

function isPackageMetadata(value: unknown): value is { name: string; version: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "name" in value &&
    value.name === PACKAGE_NAME &&
    "version" in value &&
    typeof value.version === "string" &&
    value.version.length > 0
  );
}

function parsePackageMetadata(packageRoot: string): unknown {
  const packagePath = path.join(packageRoot, "package.json");

  try {
    return JSON.parse(readFileSync(packagePath, "utf8"));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new NhnCloudCliError(
      `패키지 메타데이터를 읽을 수 없습니다: ${packagePath} (${reason})`,
      EXIT_PARAM_ERROR,
    );
  }
}

function findPackageRoot(bundleDir: string): string {
  let candidate = path.resolve(bundleDir);

  while (true) {
    const packagePath = path.join(candidate, "package.json");
    if (existsSync(packagePath)) {
      const metadata = parsePackageMetadata(candidate);
      if (isPackageMetadata(metadata)) {
        return candidate;
      }
    }

    const parent = path.dirname(candidate);
    if (parent === candidate) {
      throw new NhnCloudCliError(
        `${PACKAGE_NAME} 패키지 루트를 찾을 수 없습니다: ${bundleDir}`,
        EXIT_PARAM_ERROR,
      );
    }
    candidate = parent;
  }
}

export function resolveSkillDataRoot(homeDir: string, xdgDataHome?: string): string {
  if (xdgDataHome && path.isAbsolute(xdgDataHome)) {
    return path.join(xdgDataHome, "nhncloud-cli");
  }
  return path.join(homeDir, ".local", "share", "nhncloud-cli");
}

export function readPackageVersion(packageRoot: string): string {
  const metadata = parsePackageMetadata(packageRoot);
  if (!isPackageMetadata(metadata)) {
    throw new NhnCloudCliError(
      `package.json의 name과 version이 올바르지 않습니다: ${path.join(packageRoot, "package.json")}`,
      EXIT_PARAM_ERROR,
    );
  }
  return metadata.version;
}

export function createSkillManagerContext(): SkillManagerContext {
  const homeDir = homedir();
  const packageRoot = findPackageRoot(__dirname);

  return {
    homeDir,
    packageRoot,
    currentVersion: readPackageVersion(packageRoot),
    dataRoot: resolveSkillDataRoot(homeDir, process.env.XDG_DATA_HOME),
  };
}
