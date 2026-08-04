import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { NhnCloudCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

export const MANIFEST_FILE_NAME = ".nhncloud-skill.json";

const HASH_PREFIX = Buffer.from("nhncloud-skill-content-v1\0", "utf8");
const PACKAGE_NAME = "@bifos/nhncloud-cli";
const SKILL_NAME = "nhncloud-cli";
const CONTENT_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

export interface NhnCloudSkillManifest {
  schemaVersion: 1;
  skillName: "nhncloud-cli";
  packageName: "@bifos/nhncloud-cli";
  packageVersion: string;
  contentDigest: `sha256:${string}`;
  installedAt: string;
  managedBy: "@bifos/nhncloud-cli";
}

function isUtcIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

export function isNhnCloudSkillManifest(value: unknown): value is NhnCloudSkillManifest {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "schemaVersion" in value &&
    value.schemaVersion === 1 &&
    "skillName" in value &&
    value.skillName === SKILL_NAME &&
    "packageName" in value &&
    value.packageName === PACKAGE_NAME &&
    "packageVersion" in value &&
    typeof value.packageVersion === "string" &&
    value.packageVersion.length > 0 &&
    "contentDigest" in value &&
    typeof value.contentDigest === "string" &&
    CONTENT_DIGEST_PATTERN.test(value.contentDigest) &&
    "installedAt" in value &&
    isUtcIsoTimestamp(value.installedAt) &&
    "managedBy" in value &&
    value.managedBy === PACKAGE_NAME
  );
}

export function createSkillManifest(
  packageVersion: string,
  contentDigest: string,
  installedAt = new Date().toISOString(),
): NhnCloudSkillManifest {
  const candidate = {
    schemaVersion: 1,
    skillName: SKILL_NAME,
    packageName: PACKAGE_NAME,
    packageVersion,
    contentDigest,
    installedAt,
    managedBy: PACKAGE_NAME,
  };

  if (!isNhnCloudSkillManifest(candidate)) {
    throw new NhnCloudCliError("스킬 매니페스트 값이 올바르지 않습니다.", EXIT_PARAM_ERROR);
  }
  return candidate;
}

export function readSkillManifest(skillRoot: string): NhnCloudSkillManifest {
  const manifestPath = path.join(skillRoot, MANIFEST_FILE_NAME);
  let parsed: unknown;

  try {
    parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new NhnCloudCliError(
      `스킬 매니페스트를 읽을 수 없습니다: ${manifestPath} (${reason})`,
      EXIT_PARAM_ERROR,
    );
  }

  if (!isNhnCloudSkillManifest(parsed)) {
    throw new NhnCloudCliError(`스킬 매니페스트 형식이 올바르지 않습니다: ${manifestPath}`, EXIT_PARAM_ERROR);
  }
  return parsed;
}

function compareByCodePoint(left: string, right: string): number {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0) ?? 0);
  const limit = Math.min(leftPoints.length, rightPoints.length);

  for (let index = 0; index < limit; index += 1) {
    const difference = leftPoints[index] - rightPoints[index];
    if (difference !== 0) {
      return difference;
    }
  }
  return leftPoints.length - rightPoints.length;
}

function ensureRegularFile(filePath: string): void {
  let stat;
  try {
    stat = lstatSync(filePath);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new NhnCloudCliError(`스킬 파일을 확인할 수 없습니다: ${filePath} (${reason})`, EXIT_PARAM_ERROR);
  }

  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new NhnCloudCliError(`스킬 콘텐츠는 정규 파일이어야 합니다: ${filePath}`, EXIT_PARAM_ERROR);
  }
}

function collectReferenceFiles(referencesRoot: string, currentDir: string, files: string[]): void {
  let entries;
  try {
    entries = readdirSync(currentDir, { withFileTypes: true });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new NhnCloudCliError(
      `스킬 references를 읽을 수 없습니다: ${currentDir} (${reason})`,
      EXIT_PARAM_ERROR,
    );
  }

  for (const entry of entries) {
    const entryPath = path.join(currentDir, entry.name);
    let stat;
    try {
      stat = lstatSync(entryPath);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new NhnCloudCliError(`스킬 콘텐츠를 확인할 수 없습니다: ${entryPath} (${reason})`, EXIT_PARAM_ERROR);
    }

    if (stat.isSymbolicLink()) {
      throw new NhnCloudCliError(`스킬 콘텐츠에 심볼릭 링크를 사용할 수 없습니다: ${entryPath}`, EXIT_PARAM_ERROR);
    }
    if (stat.isDirectory()) {
      collectReferenceFiles(referencesRoot, entryPath, files);
      continue;
    }
    if (!stat.isFile()) {
      throw new NhnCloudCliError(`스킬 콘텐츠는 정규 파일 또는 디렉터리여야 합니다: ${entryPath}`, EXIT_PARAM_ERROR);
    }

    files.push(`references/${path.relative(referencesRoot, entryPath).split(path.sep).join("/")}`);
  }
}

function writeLength(hash: ReturnType<typeof createHash>, length: number): void {
  const encodedLength = Buffer.alloc(8);
  encodedLength.writeBigUInt64BE(BigInt(length));
  hash.update(encodedLength);
}

export function calculateSkillContentDigest(skillRoot: string): `sha256:${string}` {
  const skillPath = path.join(skillRoot, "SKILL.md");
  const referencesRoot = path.join(skillRoot, "references");
  ensureRegularFile(skillPath);

  let referencesStat;
  try {
    referencesStat = lstatSync(referencesRoot);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new NhnCloudCliError(
      `스킬 references를 확인할 수 없습니다: ${referencesRoot} (${reason})`,
      EXIT_PARAM_ERROR,
    );
  }
  if (referencesStat.isSymbolicLink() || !referencesStat.isDirectory()) {
    throw new NhnCloudCliError(`스킬 references는 실제 디렉터리여야 합니다: ${referencesRoot}`, EXIT_PARAM_ERROR);
  }

  const relativePaths = ["SKILL.md"];
  collectReferenceFiles(referencesRoot, referencesRoot, relativePaths);
  relativePaths.sort(compareByCodePoint);

  const hash = createHash("sha256");
  hash.update(HASH_PREFIX);

  for (const relativePath of relativePaths) {
    const pathBytes = Buffer.from(relativePath, "utf8");
    const content = readFileSync(path.join(skillRoot, ...relativePath.split("/")));
    writeLength(hash, pathBytes.length);
    hash.update(pathBytes);
    writeLength(hash, content.length);
    hash.update(content);
  }

  return `sha256:${hash.digest("hex")}`;
}
