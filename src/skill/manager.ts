import { randomUUID } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  realpath,
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

export const SKILL_AGENTS = ["claude", "codex"] as const;
export type SkillAgent = (typeof SKILL_AGENTS)[number];
export const SKILL_AGENT_NAMES: Record<SkillAgent, string> = { claude: "Claude Code", codex: "Codex" };

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

export interface SkillsStatus extends SkillStatus {
  agents: Record<SkillAgent, SkillStatus>;
}

/** 두 에이전트 경로의 상태를 합칠 때 먼저 나오는 상태가 이긴다. */
const STATUS_PRIORITY: readonly SkillStatusToken[] = [
  "corrupt",
  "modified",
  "unmanaged",
  "broken",
  "outdated",
  "missing",
  "current",
];

/** force 없이는 바꾸지 않는 상태다. */
const PROTECTED_STATUSES: readonly SkillStatusToken[] = ["unmanaged", "modified", "corrupt"];

export type SkillInstallAction = "unchanged" | "installed" | "updated" | "recovered" | "replaced";

export interface SkillInstallResult {
  schemaVersion: 1;
  action: SkillInstallAction;
  changed: boolean;
  previousStatus: SkillsStatus;
  status: SkillsStatus;
  repositoryPath: string;
  backupPaths: string[];
}

export interface SkillManagerOperations {
  rename: typeof rename;
  rm?: typeof rm;
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

const defaultOperations: Required<SkillManagerOperations> = { rename, rm };

function sourcePath(context: SkillManagerContext): string {
  return path.join(context.packageRoot, "skills", SKILL_NAME);
}

function destinationPath(context: SkillManagerContext, agent: SkillAgent): string {
  return agent === "claude"
    ? path.join(context.homeDir, ".claude", "skills", SKILL_NAME)
    : path.join(context.homeDir, ".agents", "skills", SKILL_NAME);
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

function statusBase(
  context: SkillManagerContext,
  agent: SkillAgent,
): Omit<SkillStatus, "status" | "managed"> {
  return {
    schemaVersion: 1,
    destination: destinationPath(context, agent),
    source: sourcePath(context),
    currentVersion: context.currentVersion,
  };
}

type StatusBase = Omit<SkillStatus, "status" | "managed">;

/**
 * 관리 저장소 디렉터리를 가리키는 링크에 저장소 판정 규칙을 적용한다.
 * isExpectedPath 는 링크가 현재 소스의 기대 저장소 경로와 같은지 판단한다.
 */
async function managedRepositoryStatus(
  context: SkillManagerContext,
  base: StatusBase,
  linkTarget: string,
  repositoryLocation: string,
  isExpectedPath: (expectedPath: string) => Promise<boolean>,
): Promise<SkillStatus> {
  const repositoryName = parseRepositoryName(repositoryLocation);
  if (!repositoryName) {
    return { ...base, status: "corrupt", linkTarget, managed: true };
  }

  const repository = await inspectRepository(repositoryLocation, repositoryName);
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
  const isCurrent =
    repositoryName.version === context.currentVersion &&
    repositoryName.digest === currentDigest &&
    (await isExpectedPath(repositoryPath(context, currentDigest)));
  return {
    ...base,
    status: isCurrent ? "current" : "outdated",
    installedVersion: repository.installedVersion,
    linkTarget,
    managed: true,
  };
}

/** 실제 경로를 구한다. 경로가 없으면 undefined, 그 밖의 오류는 사용자 오류로 던진다. */
async function optionalRealpath(targetPath: string): Promise<string | undefined> {
  try {
    return await realpath(targetPath);
  } catch (error) {
    if (isNodeError(error, "ENOENT")) {
      return undefined;
    }
    throw managerError(`스킬 경로를 확인할 수 없습니다: ${targetPath}`, error);
  }
}

/**
 * 다른 링크를 거쳐 관리 저장소에 닿는 링크를 판정한다. 관리 저장소에 닿지 않으면 undefined 다.
 * macOS 임시 디렉터리처럼 /var 와 /private/var 가 섞이지 않게 양쪽 모두 realpath 로 비교한다.
 */
async function inspectIndirectManagedLink(
  context: SkillManagerContext,
  base: StatusBase,
  linkTarget: string,
): Promise<SkillStatus | undefined> {
  const realRoot = await optionalRealpath(repositoryRoot(context));
  if (!realRoot) {
    return undefined;
  }
  const realTarget = await optionalRealpath(linkTarget);
  if (!realTarget || path.dirname(realTarget) !== realRoot) {
    return undefined;
  }
  return managedRepositoryStatus(context, base, linkTarget, realTarget, async (expectedPath) => {
    const realExpected = await optionalRealpath(expectedPath);
    return realExpected !== undefined && realExpected === realTarget;
  });
}

export async function inspectAgentSkill(context: SkillManagerContext, agent: SkillAgent): Promise<SkillStatus> {
  const base = statusBase(context, agent);
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
    return managedRepositoryStatus(
      context,
      base,
      linkTarget,
      linkTarget,
      async (expectedPath) => path.resolve(linkTarget) === path.resolve(expectedPath),
    );
  }

  const indirect = await inspectIndirectManagedLink(context, base, linkTarget);
  if (indirect) {
    return indirect;
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

function aggregateStatus(statuses: SkillStatus[]): SkillStatusToken {
  return STATUS_PRIORITY.find((token) => statuses.some((status) => status.status === token)) ?? "current";
}

export async function inspectSkill(context: SkillManagerContext): Promise<SkillsStatus> {
  const claude = await inspectAgentSkill(context, "claude");
  const codex = await inspectAgentSkill(context, "codex");
  return { ...claude, status: aggregateStatus([claude, codex]), agents: { claude, codex } };
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

interface LinkSwitch {
  agents: SkillAgent[];
  destination: string;
  resolvedDestination: string;
  previous: SkillStatus;
  previousRawTarget?: string;
  temporaryLink: string;
  backup?: string;
  activated: boolean;
}

function temporaryLinkPath(destination: string): string {
  return path.join(path.dirname(destination), `.${SKILL_NAME}.link-${randomUUID()}`);
}

async function planLinkSwitches(context: SkillManagerContext, previous: SkillsStatus): Promise<LinkSwitch[]> {
  const switches: LinkSwitch[] = [];
  for (const agent of SKILL_AGENTS) {
    const agentStatus = previous.agents[agent];
    if (agentStatus.status === "current") {
      continue;
    }
    const destination = destinationPath(context, agent);
    const parent = path.dirname(destination);
    await mkdir(parent, { recursive: true });
    const resolvedDestination = path.join(await realpath(parent), path.basename(destination));
    const sameTarget = switches.find((entry) => entry.resolvedDestination === resolvedDestination);
    if (sameTarget) {
      sameTarget.agents.push(agent);
      continue;
    }

    let previousRawTarget: string | undefined;
    if (agentStatus.status !== "missing" && agentStatus.status !== "unmanaged") {
      try {
        previousRawTarget = await readlink(destination);
      } catch (error) {
        throw managerError(`스킬 링크를 읽을 수 없습니다: ${destination}`, error);
      }
    }
    switches.push({
      agents: [agent],
      destination,
      resolvedDestination,
      previous: agentStatus,
      previousRawTarget,
      temporaryLink: temporaryLinkPath(destination),
      activated: false,
    });
  }
  return switches;
}

/** 바꾼 경로를 역순으로 되돌리고 되돌리지 못한 경로와 남은 백업을 돌려준다. */
async function rollbackLinkSwitches(
  switches: LinkSwitch[],
  operations: SkillManagerOperations,
  temporaryLinks: string[],
): Promise<{ failed: string[]; preservedBackups: string[]; firstError?: unknown }> {
  const failed: string[] = [];
  const preservedBackups: string[] = [];
  let firstError: unknown;

  for (const entry of [...switches].reverse()) {
    try {
      if (entry.activated && entry.backup) {
        await rm(entry.destination, { force: true });
        await operations.rename(entry.backup, entry.destination);
      } else if (entry.activated && entry.previousRawTarget !== undefined) {
        const restoreLink = temporaryLinkPath(entry.destination);
        temporaryLinks.push(restoreLink);
        await symlink(entry.previousRawTarget, restoreLink);
        await operations.rename(restoreLink, entry.destination);
      } else if (entry.activated && entry.previous.status === "missing") {
        await rm(entry.destination, { force: true });
      } else if (!entry.activated && entry.backup) {
        await operations.rename(entry.backup, entry.destination);
      }
    } catch (error) {
      failed.push(entry.destination);
      if (entry.backup) {
        preservedBackups.push(entry.backup);
      }
      firstError ??= error;
    }
  }
  return { failed, preservedBackups, firstError };
}

/**
 * 상태가 current 가 아닌 에이전트 경로를 모두 새 저장소로 전환하고 사후 검사까지 한다.
 * 어느 단계에서든 실패하면 이미 바꾼 경로를 되돌려 두 경로가 다른 버전으로 갈라지지 않게 한다.
 */
async function switchActiveLinks(
  context: SkillManagerContext,
  repository: string,
  previous: SkillsStatus,
  operations: SkillManagerOperations,
): Promise<{ backupPaths: string[]; status: SkillsStatus }> {
  const switches = await planLinkSwitches(context, previous);
  const temporaryLinks = switches.map((entry) => entry.temporaryLink);
  const backupPaths: string[] = [];

  try {
    let failure: unknown;
    let failedAfterVerification = false;
    try {
      for (const entry of switches) {
        await symlink(repository, entry.temporaryLink);
      }
      for (const entry of switches) {
        if (entry.previous.status === "unmanaged") {
          entry.backup = await backupPath(entry.destination, operations);
          backupPaths.push(entry.backup);
        }
        await operations.rename(entry.temporaryLink, entry.destination);
        entry.activated = true;
      }
      const status = await inspectSkill(context);
      if (status.status === "current") {
        return { backupPaths, status };
      }
      failure = managerError(`스킬 설치 후 상태가 current가 아닙니다: ${status.status}`);
      failedAfterVerification = true;
    } catch (error) {
      failure = error;
    }

    const rollback = await rollbackLinkSwitches(switches, operations, temporaryLinks);
    if (rollback.failed.length > 0) {
      throw managerError(
        `스킬 전환에 실패했고 일부 경로를 되돌리지 못했습니다: ${rollback.failed.join(", ")}; 보존한 백업: ${rollback.preservedBackups.join(", ") || "없음"}; 전환 오류: ${toReason(failure)}`,
        rollback.firstError,
      );
    }
    if (failedAfterVerification) {
      throw failure;
    }
    throw managerError(
      `스킬 전환에 실패해 바꾼 경로를 이전 상태로 되돌렸습니다: ${switches.map((entry) => entry.destination).join(", ")}`,
      failure,
    );
  } finally {
    await Promise.all(temporaryLinks.map((link) => rm(link, { force: true })));
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
  if (!force) {
    for (const agent of SKILL_AGENTS) {
      const agentStatus = previousStatus.agents[agent];
      if (PROTECTED_STATUSES.includes(agentStatus.status)) {
        throw managerError(
          `${SKILL_AGENT_NAMES[agent]} 스킬 상태가 ${agentStatus.status}입니다. --force로 백업 후 교체하세요: ${agentStatus.destination}`,
        );
      }
    }
  }

  const prepared = await prepareRepository(context, force, operations);
  const switched = await switchActiveLinks(context, prepared.repository, previousStatus, operations);

  return {
    schemaVersion: 1,
    action: installAction(previousStatus.status),
    changed: true,
    previousStatus,
    status: switched.status,
    repositoryPath: prepared.repository,
    backupPaths: [...prepared.backupPaths, ...switched.backupPaths],
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

interface CandidateRestore {
  restored: boolean;
  error?: unknown;
  preserved?: string;
}

/** 제거용 임시 경로로 옮긴 항목을 원래 위치로 되돌린다. 원래 위치가 차 있으면 옮긴 항목을 그대로 둔다. */
async function tryRestoreCandidate(
  candidate: string,
  destination: string,
  operations: SkillManagerOperations,
): Promise<CandidateRestore> {
  try {
    if (await optionalLstat(destination)) {
      return { restored: false, preserved: candidate };
    }
    await operations.rename(candidate, destination);
    return { restored: true };
  } catch (error) {
    return { restored: false, error, preserved: candidate };
  }
}

async function restoreUninstallCandidate(
  candidate: string,
  destination: string,
  operations: SkillManagerOperations,
  originalError: unknown,
): Promise<never> {
  const result = await tryRestoreCandidate(candidate, destination, operations);
  if (result.restored) {
    throw managerError(`활성 스킬 링크를 제거하지 않고 원래 위치로 복원했습니다: ${destination}`, originalError);
  }
  if (result.error === undefined) {
    throw managerError(
      `활성 스킬 경로가 동시에 변경되어 제거하지 않았습니다. 이동된 항목을 보존했습니다: ${candidate}`,
      originalError,
    );
  }
  throw managerError(
    `활성 스킬 링크를 제거하지 못했고 원래 위치로 복원하지 못했습니다. 이동된 항목: ${candidate}; 제거 오류: ${toReason(originalError)}`,
    result.error,
  );
}

/** 이미 지운 활성 링크를 기록해 둔 원래 링크 값으로 되살린다. */
async function tryRestoreRemovedLink(
  destination: string,
  rawTarget: string,
  operations: SkillManagerOperations,
): Promise<CandidateRestore> {
  const restoreLink = temporaryLinkPath(destination);
  try {
    if (await optionalLstat(destination)) {
      return { restored: false };
    }
    await symlink(rawTarget, restoreLink);
    await operations.rename(restoreLink, destination);
    return { restored: true };
  } catch (error) {
    return { restored: false, error };
  } finally {
    await rm(restoreLink, { force: true });
  }
}

export type SkillUninstallAction = "removed" | "absent";

export interface SkillUninstallResult {
  action: SkillUninstallAction;
  agents: Record<SkillAgent, { action: SkillUninstallAction; destination: string }>;
}

interface UninstallTarget {
  agents: SkillAgent[];
  destination: string;
  resolvedDestination: string;
  linkTarget: string;
  candidate?: string;
  rawTarget?: string;
}

/** 실제 경로가 같은 에이전트 경로를 하나로 합친 제거 대상을 만든다. 없는 경로는 대상이 아니다. */
async function planUninstallTargets(context: SkillManagerContext): Promise<UninstallTarget[]> {
  const statuses: Array<{ agent: SkillAgent; status: SkillStatus }> = [];
  for (const agent of SKILL_AGENTS) {
    const status = await inspectAgentSkill(context, agent);
    if (status.status !== "missing" && (!status.managed || !status.linkTarget)) {
      throw managerError(`관리되지 않은 스킬 항목이므로 어느 경로도 제거하지 않았습니다: ${status.destination}`);
    }
    statuses.push({ agent, status });
  }

  const targets: UninstallTarget[] = [];
  for (const { agent, status } of statuses) {
    if (status.status === "missing" || !status.linkTarget) {
      continue;
    }
    const realParent = await optionalRealpath(path.dirname(status.destination));
    if (!realParent) {
      continue;
    }
    const resolvedDestination = path.join(realParent, path.basename(status.destination));
    const sameTarget = targets.find((entry) => entry.resolvedDestination === resolvedDestination);
    if (sameTarget) {
      sameTarget.agents.push(agent);
      continue;
    }
    targets.push({
      agents: [agent],
      destination: status.destination,
      resolvedDestination,
      linkTarget: status.linkTarget,
    });
  }
  return targets;
}

/** 되돌린 결과를 모아 메시지 하나로 실패한다. */
function uninstallRollbackError(
  results: Array<{ destination: string; result: CandidateRestore }>,
  originalError: unknown,
  handledLabel: string,
): NhnCloudCliError {
  const failed = results.filter(({ result }) => !result.restored);
  if (failed.length === 0) {
    return managerError(
      `스킬 제거에 실패해 ${handledLabel}를 이전 상태로 되돌렸습니다: ${results.map(({ destination }) => destination).join(", ")}`,
      originalError,
    );
  }
  const failedText = failed
    .map(({ destination, result }) =>
      result.preserved ? `${destination} (이동된 항목: ${result.preserved})` : destination,
    )
    .join(", ");
  return managerError(
    `스킬 제거에 실패했고 일부 경로를 되돌리지 못했습니다: ${failedText}; 제거 오류: ${toReason(originalError)}`,
    failed.find(({ result }) => result.error !== undefined)?.result.error,
  );
}

/** 이동한 candidate 들을 모두 원래 위치로 되돌린 뒤 실패한다. */
async function rollbackMovedCandidates(
  moved: UninstallTarget[],
  operations: SkillManagerOperations,
  originalError: unknown,
): Promise<never> {
  const results: Array<{ destination: string; result: CandidateRestore }> = [];
  for (const target of [...moved].reverse()) {
    if (target.candidate) {
      results.push({
        destination: target.destination,
        result: await tryRestoreCandidate(target.candidate, target.destination, operations),
      });
    }
  }
  throw uninstallRollbackError(results, originalError, "옮긴 경로");
}

/** 활성 링크를 candidate 로 옮기고 검사 때와 같은 링크인지 다시 확인한다. 이동 중 ENOENT 면 false 다. */
async function moveUninstallCandidate(
  target: UninstallTarget,
  moved: UninstallTarget[],
  operations: SkillManagerOperations,
): Promise<boolean> {
  const { destination } = target;
  const candidate = path.join(path.dirname(destination), `.${SKILL_NAME}.uninstall-${randomUUID()}`);
  try {
    await operations.rename(destination, candidate);
  } catch (error) {
    if (isNodeError(error, "ENOENT")) {
      return false;
    }
    const moveError = managerError(`활성 스킬 링크를 제거용 임시 경로로 이동할 수 없습니다: ${destination}`, error);
    if (moved.length === 0) {
      throw moveError;
    }
    return await rollbackMovedCandidates(moved, operations, moveError);
  }
  target.candidate = candidate;

  let verificationError: unknown;
  try {
    const candidateStat = await lstat(candidate);
    if (!candidateStat.isSymbolicLink()) {
      verificationError = new Error("검사 후 활성 경로가 심볼릭 링크가 아닌 항목으로 변경되었습니다.");
    } else {
      target.rawTarget = await readlink(candidate);
      if (resolveLinkTarget(destination, target.rawTarget) !== target.linkTarget) {
        verificationError = new Error("검사 후 활성 스킬 링크 대상이 변경되었습니다.");
      }
    }
  } catch (error) {
    verificationError = error;
  }

  if (verificationError !== undefined) {
    if (moved.length === 0) {
      return await restoreUninstallCandidate(candidate, destination, operations, verificationError);
    }
    return await rollbackMovedCandidates([...moved, target], operations, verificationError);
  }
  return true;
}

/** candidate 들을 지운다. 하나라도 실패하면 지운 경로와 남은 경로를 모두 이전 상태로 되돌린다. */
async function removeUninstallCandidates(
  moved: UninstallTarget[],
  operations: SkillManagerOperations,
): Promise<void> {
  const removeEntry = operations.rm ?? defaultOperations.rm;
  for (const [index, target] of moved.entries()) {
    try {
      await removeEntry(target.candidate as string, { force: true });
    } catch (originalError) {
      const results: Array<{ destination: string; result: CandidateRestore }> = [];
      for (const [restoreIndex, entry] of moved.entries()) {
        const result =
          restoreIndex < index
            ? await tryRestoreRemovedLink(entry.destination, entry.rawTarget as string, operations)
            : await tryRestoreCandidate(entry.candidate as string, entry.destination, operations);
        results.push({ destination: entry.destination, result });
      }
      throw uninstallRollbackError(results, originalError, "지운 경로");
    }
  }
}

/**
 * Claude Code 와 Codex 경로의 활성 링크를 한 단위로 제거한다.
 * 한 경로라도 관리하지 않는 항목이면 어느 경로도 지우지 않고(ADR-043),
 * 중간에 실패하면 이미 처리한 경로를 이전 상태로 되돌린다.
 */
export async function uninstallSkill(
  context: SkillManagerContext,
  operations: SkillManagerOperations = defaultOperations,
): Promise<SkillUninstallResult> {
  const targets = await planUninstallTargets(context);

  const moved: UninstallTarget[] = [];
  for (const target of targets) {
    if (await moveUninstallCandidate(target, moved, operations)) {
      moved.push(target);
    }
  }
  await removeUninstallCandidates(moved, operations);

  const agents = Object.fromEntries(
    SKILL_AGENTS.map((agent) => [
      agent,
      {
        action: moved.some((target) => target.agents.includes(agent)) ? "removed" : "absent",
        destination: destinationPath(context, agent),
      },
    ]),
  ) as SkillUninstallResult["agents"];
  return {
    action: SKILL_AGENTS.some((agent) => agents[agent].action === "removed") ? "removed" : "absent",
    agents,
  };
}
