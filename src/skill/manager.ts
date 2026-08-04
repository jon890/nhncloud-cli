import { randomUUID } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { NhnCloudCliError } from "../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../utils/exit-codes.js";
import type { SkillManagerContext } from "./context.js";
import {
  MANIFEST_FILE_NAME,
  calculateSkillContentDigest,
  createSkillManifest,
  readSkillManifest,
} from "./manifest.js";

const PACKAGE_NAME = "@bifos/nhncloud-cli";
const SKILL_NAME = "nhncloud-cli";
const DIGEST_HEX_PATTERN = /^[0-9a-f]{64}$/;

export type SkillStatusToken =
  | "current"
  | "missing"
  | "outdated"
  | "broken"
  | "unmanaged"
  | "modified"
  | "corrupt";

export interface SkillStatus {
  schemaVersion: 1;
  status: SkillStatusToken;
  destination: string;
  source: string;
  currentVersion: string;
  installedVersion?: string;
  linkTarget?: string;
  managed: boolean;
}

export type SkillInstallAction = "unchanged" | "installed" | "updated" | "recovered" | "replaced";

export interface SkillInstallResult {
  schemaVersion: 1;
  action: SkillInstallAction;
  changed: boolean;
  previousStatus: SkillStatus;
  status: SkillStatus;
  repositoryPath: string;
  backupPaths: string[];
}

export interface SkillManagerOperations {
  rename: typeof rename;
}

interface RepositoryName {
  version: string;
  digest: `sha256:${string}`;
}

interface LegacyPackageMetadata {
  installedVersion?: string;
}

type RepositoryInspection =
  | { status: "missing" }
  | { status: "valid"; installedVersion: string }
  | { status: "modified"; installedVersion?: string }
  | { status: "corrupt"; installedVersion?: string };

const defaultOperations: SkillManagerOperations = { rename };

function sourcePath(context: SkillManagerContext): string {
  return path.join(context.packageRoot, "skills", SKILL_NAME);
}

function destinationPath(context: SkillManagerContext): string {
  return path.join(context.homeDir, ".claude", "skills", SKILL_NAME);
}

function resolveLinkTarget(linkPath: string, rawTarget: string): string {
  return path.isAbsolute(rawTarget)
    ? path.normalize(rawTarget)
    : path.resolve(path.dirname(linkPath), rawTarget);
}

function repositoryRoot(context: SkillManagerContext): string {
  return path.join(context.dataRoot, "skills");
}

function isSafePathSegment(value: string): boolean {
  return value.length > 0 && value !== "." && value !== ".." && !value.includes("/") && !value.includes("\\");
}

function repositoryPath(context: SkillManagerContext, digest: string): string {
  if (!isSafePathSegment(context.currentVersion)) {
    throw managerError(`패키지 버전을 관리 저장소 경로로 사용할 수 없습니다: ${context.currentVersion}`);
  }
  return path.join(repositoryRoot(context), `${context.currentVersion}-${digest.slice("sha256:".length)}`);
}

function toReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNodeError(error: unknown, ...codes: string[]): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    codes.includes(error.code)
  );
}

function managerError(message: string, error?: unknown): NhnCloudCliError {
  const suffix = error === undefined ? "" : ` (${toReason(error)})`;
  return new NhnCloudCliError(`${message}${suffix}`, EXIT_PARAM_ERROR);
}

async function optionalLstat(targetPath: string) {
  try {
    return await lstat(targetPath);
  } catch (error) {
    if (isNodeError(error, "ENOENT")) {
      return undefined;
    }
    throw managerError(`스킬 경로를 확인할 수 없습니다: ${targetPath}`, error);
  }
}

function parseRepositoryName(targetPath: string): RepositoryName | undefined {
  const name = path.basename(targetPath);
  const digestHex = name.slice(-64);
  const separatorIndex = name.length - digestHex.length - 1;
  const version = name.slice(0, separatorIndex);

  if (
    separatorIndex <= 0 ||
    name[separatorIndex] !== "-" ||
    !isSafePathSegment(version) ||
    !DIGEST_HEX_PATTERN.test(digestHex)
  ) {
    return undefined;
  }

  return {
    version,
    digest: `sha256:${digestHex}`,
  };
}

function managedRepositoryName(context: SkillManagerContext, targetPath: string): RepositoryName | undefined {
  const resolvedRoot = path.resolve(repositoryRoot(context));
  const resolvedTarget = path.resolve(targetPath);
  if (path.dirname(resolvedTarget) !== resolvedRoot) {
    return undefined;
  }
  return parseRepositoryName(resolvedTarget);
}

function isManagedRepositoryLocation(context: SkillManagerContext, targetPath: string): boolean {
  return path.dirname(path.resolve(targetPath)) === path.resolve(repositoryRoot(context));
}

function isLegacyPackageTargetShape(targetPath: string): boolean {
  const segments = path.resolve(targetPath).split(path.sep);
  return (
    segments.length >= 5 &&
    segments.at(-1) === SKILL_NAME &&
    segments.at(-2) === "skills" &&
    segments.at(-3) === "nhncloud-cli" &&
    segments.at(-4) === "@bifos"
  );
}

async function readLegacyPackageMetadata(targetPath: string): Promise<LegacyPackageMetadata | undefined> {
  if (path.basename(targetPath) !== SKILL_NAME || path.basename(path.dirname(targetPath)) !== "skills") {
    return undefined;
  }

  const packagePath = path.join(targetPath, "..", "..", "package.json");
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(packagePath, "utf8"));
  } catch {
    return undefined;
  }

  if (
    typeof parsed === "object" &&
    parsed !== null &&
    !Array.isArray(parsed) &&
    "name" in parsed &&
    parsed.name === PACKAGE_NAME
  ) {
    return {
      installedVersion:
        "version" in parsed && typeof parsed.version === "string" ? parsed.version : undefined,
    };
  }
  return undefined;
}

async function inspectRepository(targetPath: string, expected?: RepositoryName): Promise<RepositoryInspection> {
  const targetStat = await optionalLstat(targetPath);
  if (!targetStat) {
    return { status: "missing" };
  }
  if (targetStat.isSymbolicLink() || !targetStat.isDirectory()) {
    return { status: "corrupt", installedVersion: expected?.version };
  }

  let manifest;
  try {
    manifest = readSkillManifest(targetPath);
  } catch {
    return { status: "corrupt", installedVersion: expected?.version };
  }

  if (
    expected &&
    (manifest.packageVersion !== expected.version || manifest.contentDigest !== expected.digest)
  ) {
    return { status: "corrupt", installedVersion: manifest.packageVersion };
  }

  let actualDigest: `sha256:${string}`;
  try {
    actualDigest = calculateSkillContentDigest(targetPath);
  } catch {
    return { status: "corrupt", installedVersion: manifest.packageVersion };
  }

  if (actualDigest !== manifest.contentDigest) {
    return { status: "modified", installedVersion: manifest.packageVersion };
  }

  return { status: "valid", installedVersion: manifest.packageVersion };
}

function statusBase(context: SkillManagerContext): Omit<SkillStatus, "status" | "managed"> {
  return {
    schemaVersion: 1,
    destination: destinationPath(context),
    source: sourcePath(context),
    currentVersion: context.currentVersion,
  };
}

export async function inspectSkill(context: SkillManagerContext): Promise<SkillStatus> {
  const base = statusBase(context);
  const destinationStat = await optionalLstat(base.destination);
  if (!destinationStat) {
    return { ...base, status: "missing", managed: false };
  }
  if (!destinationStat.isSymbolicLink()) {
    return { ...base, status: "unmanaged", managed: false };
  }

  let rawTarget: string;
  try {
    rawTarget = await readlink(base.destination);
  } catch (error) {
    throw managerError(`스킬 링크를 읽을 수 없습니다: ${base.destination}`, error);
  }
  const linkTarget = resolveLinkTarget(base.destination, rawTarget);
  const repositoryName = managedRepositoryName(context, linkTarget);
  const targetStat = await stat(linkTarget).catch((error: unknown) => {
    if (isNodeError(error, "ENOENT")) {
      return undefined;
    }
    throw managerError(`스킬 링크 대상을 확인할 수 없습니다: ${linkTarget}`, error);
  });

  if (!targetStat) {
    const managed = isManagedRepositoryLocation(context, linkTarget) || isLegacyPackageTargetShape(linkTarget);
    return {
      ...base,
      status: managed ? "broken" : "unmanaged",
      installedVersion: repositoryName?.version,
      linkTarget,
      managed,
    };
  }

  if (isManagedRepositoryLocation(context, linkTarget)) {
    if (!repositoryName) {
      return { ...base, status: "corrupt", linkTarget, managed: true };
    }

    const repository = await inspectRepository(linkTarget, repositoryName);
    if (repository.status === "modified" || repository.status === "corrupt") {
      return {
        ...base,
        status: repository.status,
        installedVersion: repository.installedVersion ?? repositoryName.version,
        linkTarget,
        managed: true,
      };
    }
    if (repository.status === "missing") {
      return {
        ...base,
        status: "broken",
        installedVersion: repositoryName.version,
        linkTarget,
        managed: true,
      };
    }

    const currentDigest = calculateSkillContentDigest(base.source);
    const expectedPath = repositoryPath(context, currentDigest);
    const isCurrent =
      repositoryName.version === context.currentVersion &&
      repositoryName.digest === currentDigest &&
      path.resolve(linkTarget) === path.resolve(expectedPath);
    return {
      ...base,
      status: isCurrent ? "current" : "outdated",
      installedVersion: repository.installedVersion,
      linkTarget,
      managed: true,
    };
  }

  const legacyPackage = targetStat.isDirectory()
    ? await readLegacyPackageMetadata(linkTarget)
    : undefined;
  if (legacyPackage) {
    return {
      ...base,
      status: "outdated",
      ...(legacyPackage.installedVersion
        ? { installedVersion: legacyPackage.installedVersion }
        : {}),
      linkTarget,
      managed: true,
    };
  }

  return { ...base, status: "unmanaged", linkTarget, managed: false };
}

function utcBackupSuffix(): string {
  return `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`;
}

async function backupPath(targetPath: string, operations: SkillManagerOperations): Promise<string> {
  const backup = `${targetPath}.backup-${utcBackupSuffix()}`;
  try {
    await operations.rename(targetPath, backup);
  } catch (error) {
    throw managerError(`기존 스킬 항목을 백업할 수 없습니다: ${targetPath}`, error);
  }
  return backup;
}

async function restoreBackup(
  backup: string,
  targetPath: string,
  operations: SkillManagerOperations,
  originalError: unknown,
): Promise<never> {
  try {
    await operations.rename(backup, targetPath);
  } catch (restoreError) {
    throw managerError(
      `스킬 전환에 실패했고 백업 복원도 실패했습니다: ${targetPath}; 전환 오류: ${toReason(originalError)}`,
      restoreError,
    );
  }
  throw managerError(`스킬 전환에 실패해 백업을 복원했습니다: ${targetPath}`, originalError);
}

async function createStagingRepository(
  context: SkillManagerContext,
  digest: `sha256:${string}`,
): Promise<string> {
  const root = repositoryRoot(context);
  await mkdir(root, { recursive: true });
  const staging = await mkdtemp(path.join(root, ".staging-"));

  try {
    const source = sourcePath(context);
    await cp(path.join(source, "SKILL.md"), path.join(staging, "SKILL.md"));
    await cp(path.join(source, "references"), path.join(staging, "references"), { recursive: true });
    const stagedDigest = calculateSkillContentDigest(staging);
    if (stagedDigest !== digest) {
      throw managerError("복사 중 스킬 원본이 변경되어 설치를 중단했습니다.");
    }
    const manifest = createSkillManifest(context.currentVersion, digest);
    await writeFile(path.join(staging, MANIFEST_FILE_NAME), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    return staging;
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    if (error instanceof NhnCloudCliError) {
      throw error;
    }
    throw managerError(`스킬 관리 저장소를 준비할 수 없습니다: ${staging}`, error);
  }
}

async function prepareRepository(
  context: SkillManagerContext,
  force: boolean,
  operations: SkillManagerOperations,
): Promise<{ repository: string; backupPaths: string[] }> {
  const source = sourcePath(context);
  const digest = calculateSkillContentDigest(source);
  const repository = repositoryPath(context, digest);
  const expected: RepositoryName = { version: context.currentVersion, digest };
  let existing = await inspectRepository(repository, expected);

  if (existing.status === "valid") {
    return { repository, backupPaths: [] };
  }
  if ((existing.status === "modified" || existing.status === "corrupt") && !force) {
    throw managerError(`관리 저장소가 ${existing.status === "modified" ? "수정" : "손상"}되었습니다. --force로 복구하세요: ${repository}`);
  }

  const staging = await createStagingRepository(context, digest);
  const backupPaths: string[] = [];
  try {
    if (existing.status === "missing") {
      try {
        await operations.rename(staging, repository);
        return { repository, backupPaths };
      } catch (error) {
        if (!isNodeError(error, "EEXIST", "ENOTEMPTY")) {
          throw error;
        }
        existing = await inspectRepository(repository, expected);
        if (existing.status === "valid") {
          return { repository, backupPaths };
        }
        if (!force) {
          throw managerError(`동시에 생성된 관리 저장소가 손상되었습니다. --force로 복구하세요: ${repository}`);
        }
      }
    }

    const backup = await backupPath(repository, operations);
    backupPaths.push(backup);
    try {
      await operations.rename(staging, repository);
    } catch (error) {
      return await restoreBackup(backup, repository, operations, error);
    }
    return { repository, backupPaths };
  } catch (error) {
    if (error instanceof NhnCloudCliError) {
      throw error;
    }
    throw managerError(`스킬 관리 저장소를 전환할 수 없습니다: ${repository}`, error);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

async function switchActiveLink(
  context: SkillManagerContext,
  repository: string,
  previousStatus: SkillStatus,
  force: boolean,
  operations: SkillManagerOperations,
): Promise<string[]> {
  const destination = destinationPath(context);
  const parent = path.dirname(destination);
  await mkdir(parent, { recursive: true });
  const temporaryLink = path.join(parent, `.${SKILL_NAME}.link-${randomUUID()}`);
  const backupPaths: string[] = [];
  await symlink(repository, temporaryLink);

  try {
    if (previousStatus.status === "unmanaged") {
      if (!force) {
        throw managerError(`관리되지 않은 스킬 항목이 있습니다. --force로 백업 후 교체하세요: ${destination}`);
      }
      const backup = await backupPath(destination, operations);
      backupPaths.push(backup);
      try {
        await operations.rename(temporaryLink, destination);
      } catch (error) {
        return await restoreBackup(backup, destination, operations, error);
      }
      return backupPaths;
    }

    try {
      await operations.rename(temporaryLink, destination);
    } catch (error) {
      throw managerError(`활성 스킬 링크를 전환할 수 없습니다: ${destination}`, error);
    }
    return backupPaths;
  } finally {
    await rm(temporaryLink, { force: true });
  }
}

function installAction(status: SkillStatusToken): SkillInstallAction {
  switch (status) {
    case "missing":
      return "installed";
    case "outdated":
      return "updated";
    case "unmanaged":
      return "replaced";
    case "broken":
    case "modified":
    case "corrupt":
      return "recovered";
    case "current":
      return "unchanged";
  }
}

async function installSkillInternal(
  context: SkillManagerContext,
  options: { force?: boolean } = {},
  operations: SkillManagerOperations = defaultOperations,
): Promise<SkillInstallResult> {
  const force = options.force ?? false;
  const previousStatus = await inspectSkill(context);
  const sourceDigest = calculateSkillContentDigest(sourcePath(context));
  const expectedRepository = repositoryPath(context, sourceDigest);

  if (previousStatus.status === "current") {
    return {
      schemaVersion: 1,
      action: "unchanged",
      changed: false,
      previousStatus,
      status: previousStatus,
      repositoryPath: expectedRepository,
      backupPaths: [],
    };
  }
  if (
    (previousStatus.status === "unmanaged" ||
      previousStatus.status === "modified" ||
      previousStatus.status === "corrupt") &&
    !force
  ) {
    throw managerError(`스킬 상태가 ${previousStatus.status}입니다. --force로 백업 후 교체하세요: ${previousStatus.destination}`);
  }

  const prepared = await prepareRepository(context, force, operations);
  const linkBackups = await switchActiveLink(context, prepared.repository, previousStatus, force, operations);
  const status = await inspectSkill(context);
  if (status.status !== "current") {
    throw managerError(`스킬 설치 후 상태가 current가 아닙니다: ${status.status}`);
  }

  return {
    schemaVersion: 1,
    action: installAction(previousStatus.status),
    changed: true,
    previousStatus,
    status,
    repositoryPath: prepared.repository,
    backupPaths: [...prepared.backupPaths, ...linkBackups],
  };
}

export async function installSkill(
  context: SkillManagerContext,
  options: { force?: boolean } = {},
  operations: SkillManagerOperations = defaultOperations,
): Promise<SkillInstallResult> {
  try {
    return await installSkillInternal(context, options, operations);
  } catch (error) {
    if (error instanceof NhnCloudCliError) {
      throw error;
    }
    throw managerError("스킬을 설치할 수 없습니다.", error);
  }
}

async function restoreUninstallCandidate(
  candidate: string,
  destination: string,
  operations: SkillManagerOperations,
  originalError: unknown,
): Promise<never> {
  if (await optionalLstat(destination)) {
    throw managerError(
      `활성 스킬 경로가 동시에 변경되어 제거하지 않았습니다. 이동된 항목을 보존했습니다: ${candidate}`,
      originalError,
    );
  }

  try {
    await operations.rename(candidate, destination);
  } catch (restoreError) {
    throw managerError(
      `활성 스킬 링크를 제거하지 못했고 원래 위치로 복원하지 못했습니다. 이동된 항목: ${candidate}; 제거 오류: ${toReason(originalError)}`,
      restoreError,
    );
  }
  throw managerError(`활성 스킬 링크를 제거하지 않고 원래 위치로 복원했습니다: ${destination}`, originalError);
}

export async function uninstallSkill(
  context: SkillManagerContext,
  operations: SkillManagerOperations = defaultOperations,
): Promise<"removed" | "absent"> {
  const destination = destinationPath(context);
  const status = await inspectSkill(context);
  if (status.status === "missing") {
    return "absent";
  }
  if (!status.managed || !status.linkTarget) {
    throw managerError(`관리되지 않은 스킬 항목이므로 제거하지 않았습니다: ${destination}`);
  }

  const candidate = path.join(path.dirname(destination), `.${SKILL_NAME}.uninstall-${randomUUID()}`);
  try {
    await operations.rename(destination, candidate);
  } catch (error) {
    if (isNodeError(error, "ENOENT")) {
      return "absent";
    }
    throw managerError(`활성 스킬 링크를 제거용 임시 경로로 이동할 수 없습니다: ${destination}`, error);
  }

  let candidateTarget: string;
  try {
    const candidateStat = await lstat(candidate);
    if (!candidateStat.isSymbolicLink()) {
      return await restoreUninstallCandidate(
        candidate,
        destination,
        operations,
        new Error("검사 후 활성 경로가 심볼릭 링크가 아닌 항목으로 변경되었습니다."),
      );
    }
    candidateTarget = resolveLinkTarget(destination, await readlink(candidate));
  } catch (error) {
    if (error instanceof NhnCloudCliError) {
      throw error;
    }
    return await restoreUninstallCandidate(candidate, destination, operations, error);
  }

  if (candidateTarget !== status.linkTarget) {
    return await restoreUninstallCandidate(
      candidate,
      destination,
      operations,
      new Error("검사 후 활성 스킬 링크 대상이 변경되었습니다."),
    );
  }

  try {
    await rm(candidate);
  } catch (error) {
    return await restoreUninstallCandidate(candidate, destination, operations, error);
  }
  return "removed";
}
