/**
 * RDS for MySQL API v3 응답·요청 타입 (ADR-046).
 * 가드는 명령이 쓰는 필드만 필수로 본다. 표시만 하는 필드는 없거나 null 이어도 받고,
 * 명령이 쓰지 않는 필드는 검사하지 않는다. 문서가 nullable 여부를 밝히지 않아서다.
 */

export interface RdsMysqlDbInstance {
  dbInstanceId: string;
  dbInstanceName: string;
  dbInstanceStatus: string;
  dbVersion?: string | null;
  dbInstanceType?: string | null;
  progressStatus?: string | null;
  [key: string]: unknown;
}

export interface RdsMysqlDbInstanceDetail extends RdsMysqlDbInstance {
  /** 쓰는 쪽은 `=== false` 일 때만 미지원으로 본다. 가드는 검사하지 않는다. */
  supportAuthenticationPlugin?: boolean | null;
}

export interface RdsMysqlDbSchema {
  dbSchemaId: string;
  dbSchemaName: string;
  dbSchemaStatus: string;
  createdYmdt?: string | null;
  [key: string]: unknown;
}

export interface RdsMysqlDbUser {
  dbUserId: string;
  dbUserName: string;
  host: string;
  authorityType: string;
  dbUserStatus: string;
  authenticationPlugin?: string | null;
  tlsOption?: string | null;
  [key: string]: unknown;
}

export interface RdsMysqlResourceRelation {
  resourceType?: string | null;
  resourceId?: string | null;
  [key: string]: unknown;
}

export interface RdsMysqlJob {
  jobId: string;
  jobStatus: string;
  resourceRelations?: RdsMysqlResourceRelation[] | null;
  createdYmdt?: string | null;
  updatedYmdt?: string | null;
  [key: string]: unknown;
}

export type RdsMysqlAuthorityType = "READ" | "CRUD" | "DDL" | "ALL";
export type RdsMysqlAuthPlugin = "NATIVE" | "CACHING_SHA2" | "SHA256";
export type RdsMysqlTlsOption = "NONE" | "SSL" | "X509";

export interface RdsMysqlDbUserCreateInput {
  dbUserName: string;
  dbPassword: string;
  host: string;
  authorityType: RdsMysqlAuthorityType;
  authenticationPlugin?: RdsMysqlAuthPlugin;
  tlsOption?: RdsMysqlTlsOption;
}

/**
 * 권한 변경 요청 본문이다. tlsOption 은 서버가 준 현재 값을 그대로 되돌려 보내므로 string 으로 받는다.
 * authenticationPlugin 은 두지 않는다. 플러그인 변경은 비밀번호 변경이 함께 있어야 해서다 (ADR-047).
 */
export interface RdsMysqlDbUserUpdateInput {
  authorityType: RdsMysqlAuthorityType;
  tlsOption?: string;
}

export type RdsMysqlJobOutcome = "completed" | "failed" | "uncertain" | "running";

const FAILED_JOB_STATUSES: ReadonlySet<string> = new Set([
  "FAILED",
  "ERROR",
  "CANCELED",
  "INTERRUPTED",
  "CANNOT_PROGRESS",
  "FAIL_TO_READY",
  "FAIL_TO_REGISTER",
]);

/** 끝났지만 요청한 변경이 반영됐는지 단정할 수 없는 상태다 (ADR-047). */
const UNCERTAIN_JOB_STATUSES: ReadonlySet<string> = new Set(["COMPLETED_WITH_ERROR", "DELETED"]);

/**
 * 작업 상태를 대기 결과로 해석한다 (ADR-047).
 * 문서에 없는 값은 아직 진행 중으로 보고 대기 상한까지 계속 조회한다.
 */
export function classifyJobStatus(status: string): RdsMysqlJobOutcome {
  if (status === "COMPLETED") return "completed";
  if (FAILED_JOB_STATUSES.has(status)) return "failed";
  if (UNCERTAIN_JOB_STATUSES.has(status)) return "uncertain";
  return "running";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasStrings(obj: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => typeof obj[key] === "string");
}

/** 선택 필드는 없거나 null 이거나 string 이어야 한다. */
function hasOptionalStrings(obj: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => obj[key] === undefined || obj[key] === null || typeof obj[key] === "string");
}

export function isRdsMysqlDbInstance(value: unknown): value is RdsMysqlDbInstance {
  if (!isRecord(value)) return false;
  return (
    hasStrings(value, ["dbInstanceId", "dbInstanceName", "dbInstanceStatus"]) &&
    hasOptionalStrings(value, ["dbVersion", "dbInstanceType", "progressStatus"])
  );
}

/** 상세 응답의 추가 필드는 명령이 표시만 하거나 쓰는 쪽이 따로 해석하므로 목록 항목 가드와 같다. */
export function isRdsMysqlDbInstanceDetail(value: unknown): value is RdsMysqlDbInstanceDetail {
  return isRdsMysqlDbInstance(value);
}

export function isRdsMysqlDbSchema(value: unknown): value is RdsMysqlDbSchema {
  if (!isRecord(value)) return false;
  return (
    hasStrings(value, ["dbSchemaId", "dbSchemaName", "dbSchemaStatus"]) &&
    hasOptionalStrings(value, ["createdYmdt"])
  );
}

export function isRdsMysqlDbUser(value: unknown): value is RdsMysqlDbUser {
  if (!isRecord(value)) return false;
  return (
    hasStrings(value, ["dbUserId", "dbUserName", "host", "authorityType", "dbUserStatus"]) &&
    hasOptionalStrings(value, ["authenticationPlugin", "tlsOption"])
  );
}

function isRdsMysqlResourceRelation(value: unknown): value is RdsMysqlResourceRelation {
  return isRecord(value) && hasOptionalStrings(value, ["resourceType", "resourceId"]);
}

export function isRdsMysqlJob(value: unknown): value is RdsMysqlJob {
  if (!isRecord(value)) return false;
  const relations = value["resourceRelations"];
  return (
    hasStrings(value, ["jobId", "jobStatus"]) &&
    hasOptionalStrings(value, ["createdYmdt", "updatedYmdt"]) &&
    (relations === undefined ||
      relations === null ||
      (Array.isArray(relations) && relations.every(isRdsMysqlResourceRelation)))
  );
}

/** 파라미터 그룹 목록 항목이다. 상세와 달리 파라미터 목록이 없다. */
export interface RdsMysqlParameterGroup {
  parameterGroupId: string;
  parameterGroupName: string;
  /** 엔진 버전 계열(dbEngineVersionFamily)로 만든 그룹은 null 이다 (실호출 확인). */
  dbVersion?: string | null;
  dbEngineVersionFamily?: string | null;
  parameterGroupType?: string | null;
  parameterGroupStatus?: string | null;
  description?: string | null;
  createdYmdt?: string | null;
  updatedYmdt?: string | null;
  [key: string]: unknown;
}

export interface RdsMysqlParameter {
  parameterId: string;
  parameterName: string;
  value?: string | null;
  defaultValue?: string | null;
  allowedValue?: string | null;
  parameterFileGroup?: string | null;
  fileParameterName?: string | null;
  updateType?: string | null;
  applyType?: string | null;
  [key: string]: unknown;
}

export interface RdsMysqlParameterGroupDetail extends RdsMysqlParameterGroup {
  parameters: RdsMysqlParameter[];
}

export interface RdsMysqlList<T> {
  items: T[];
  /** 서버가 알려 준 전체 개수다. 없으면 null 이다. */
  totalCounts: number | null;
}

export interface RdsMysqlBinLog {
  binLogFileName: string;
  binLogFileSize: number;
  createdYmdt?: string | null;
  [key: string]: unknown;
}

export interface RdsMysqlStorageAutoscale {
  useStorageAutoscale?: boolean | null;
  threshold?: number | null;
  maxStorageSize?: number | null;
  cooldownTime?: number | null;
  [key: string]: unknown;
}

export interface RdsMysqlStorageInfo {
  storageType?: string | null;
  storageSize: number;
  storageStatus?: string | null;
  storageAutoscale?: RdsMysqlStorageAutoscale | null;
  [key: string]: unknown;
}

export interface RdsMysqlBackupInfo {
  backupPeriod?: number | null;
  [key: string]: unknown;
}

export interface RdsMysqlBackup {
  backupId: string;
  backupName: string;
  backupStatus: string;
  dbInstanceId?: string | null;
  dbVersion?: string | null;
  backupType?: string | null;
  backupSize?: number | null;
  createdYmdt?: string | null;
  [key: string]: unknown;
}

export interface RdsMysqlHaInfo {
  useHighAvailability: boolean;
  haStatus?: string | null;
  pingInterval?: number | null;
  pingType?: string | null;
  [key: string]: unknown;
}

function isOptionalNumber(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "number";
}

export function isRdsMysqlParameterGroup(value: unknown): value is RdsMysqlParameterGroup {
  if (!isRecord(value)) return false;
  return (
    hasStrings(value, ["parameterGroupId", "parameterGroupName"]) &&
    hasOptionalStrings(value, [
      "dbVersion",
      "dbEngineVersionFamily",
      "parameterGroupType",
      "parameterGroupStatus",
      "description",
    ])
  );
}

export function isRdsMysqlParameter(value: unknown): value is RdsMysqlParameter {
  if (!isRecord(value)) return false;
  return (
    hasStrings(value, ["parameterId", "parameterName"]) &&
    hasOptionalStrings(value, ["value", "defaultValue", "allowedValue", "updateType", "applyType"])
  );
}

export function isRdsMysqlParameterGroupDetail(value: unknown): value is RdsMysqlParameterGroupDetail {
  if (!isRdsMysqlParameterGroup(value)) return false;
  const parameters = (value as Record<string, unknown>)["parameters"];
  return Array.isArray(parameters) && parameters.every(isRdsMysqlParameter);
}

export function isRdsMysqlBinLog(value: unknown): value is RdsMysqlBinLog {
  if (!isRecord(value)) return false;
  return typeof value["binLogFileName"] === "string" && typeof value["binLogFileSize"] === "number";
}

export function isRdsMysqlStorageInfo(value: unknown): value is RdsMysqlStorageInfo {
  if (!isRecord(value)) return false;
  const autoscale = value["storageAutoscale"];
  return (
    typeof value["storageSize"] === "number" &&
    hasOptionalStrings(value, ["storageType", "storageStatus"]) &&
    (autoscale === undefined || autoscale === null || isRecord(autoscale))
  );
}

export function isRdsMysqlBackupInfo(value: unknown): value is RdsMysqlBackupInfo {
  return isRecord(value) && isOptionalNumber(value["backupPeriod"]);
}

export function isRdsMysqlBackup(value: unknown): value is RdsMysqlBackup {
  if (!isRecord(value)) return false;
  return (
    hasStrings(value, ["backupId", "backupName", "backupStatus"]) &&
    hasOptionalStrings(value, ["dbInstanceId", "dbVersion", "backupType"]) &&
    isOptionalNumber(value["backupSize"])
  );
}

export function isRdsMysqlHaInfo(value: unknown): value is RdsMysqlHaInfo {
  if (!isRecord(value)) return false;
  return typeof value["useHighAvailability"] === "boolean" && hasOptionalStrings(value, ["haStatus", "pingType"]);
}

/** DB 인스턴스 사양(flavor)이다. ram 은 MB 다. */
export interface RdsMysqlDbFlavor {
  dbFlavorId: string;
  dbFlavorName: string;
  ram?: number | null;
  vcpus?: number | null;
  [key: string]: unknown;
}

export interface RdsMysqlDbVersion {
  dbVersion: string;
  dbVersionName?: string | null;
  restorableFromObs?: boolean | null;
  [key: string]: unknown;
}

export interface RdsMysqlSubnet {
  subnetId: string;
  subnetName?: string | null;
  subnetCidr?: string | null;
  usingGateway?: boolean | null;
  availableIpCount?: number | null;
  [key: string]: unknown;
}

export interface RdsMysqlAvailabilityZone {
  availabilityZoneName: string;
  zoneState?: { available?: boolean | null; [key: string]: unknown } | null;
  [key: string]: unknown;
}

export interface RdsMysqlRegion {
  regionCode: string;
  isEnabled?: boolean | null;
  [key: string]: unknown;
}

export interface RdsMysqlProjectMember {
  memberId: string;
  memberName?: string | null;
  emailAddress?: string | null;
  phoneNumber?: string | null;
  [key: string]: unknown;
}

export interface RdsMysqlNetworkInfo {
  availabilityZone?: string | null;
  subnet?: Record<string, unknown> | null;
  endPoints?: Record<string, unknown>[] | null;
  [key: string]: unknown;
}

export interface RdsMysqlMaintenance {
  maintenanceId: string;
  type: string;
  status: string;
  category?: string | null;
  description?: string | null;
  required?: boolean | null;
  deadlineYmdt?: string | null;
  executionType?: string | null;
  addedYmdt?: string | null;
  [key: string]: unknown;
}

function isOptionalBoolean(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "boolean";
}

export function isRdsMysqlDbFlavor(value: unknown): value is RdsMysqlDbFlavor {
  return (
    isRecord(value) &&
    hasStrings(value, ["dbFlavorId", "dbFlavorName"]) &&
    isOptionalNumber(value["ram"]) &&
    isOptionalNumber(value["vcpus"])
  );
}

export function isRdsMysqlDbVersion(value: unknown): value is RdsMysqlDbVersion {
  return (
    isRecord(value) &&
    hasStrings(value, ["dbVersion"]) &&
    hasOptionalStrings(value, ["dbVersionName"]) &&
    isOptionalBoolean(value["restorableFromObs"])
  );
}

export function isRdsMysqlSubnet(value: unknown): value is RdsMysqlSubnet {
  return (
    isRecord(value) &&
    hasStrings(value, ["subnetId"]) &&
    hasOptionalStrings(value, ["subnetName", "subnetCidr"]) &&
    isOptionalBoolean(value["usingGateway"]) &&
    isOptionalNumber(value["availableIpCount"])
  );
}

export function isRdsMysqlAvailabilityZone(value: unknown): value is RdsMysqlAvailabilityZone {
  if (!isRecord(value) || !hasStrings(value, ["availabilityZoneName"])) return false;
  const state = value["zoneState"];
  return state === undefined || state === null || (isRecord(state) && isOptionalBoolean(state["available"]));
}

export function isRdsMysqlRegion(value: unknown): value is RdsMysqlRegion {
  return isRecord(value) && hasStrings(value, ["regionCode"]) && isOptionalBoolean(value["isEnabled"]);
}

export function isRdsMysqlProjectMember(value: unknown): value is RdsMysqlProjectMember {
  return isRecord(value) && hasStrings(value, ["memberId"]) && hasOptionalStrings(value, ["memberName", "emailAddress", "phoneNumber"]);
}

export function isRdsMysqlNetworkInfo(value: unknown): value is RdsMysqlNetworkInfo {
  if (!isRecord(value) || !hasOptionalStrings(value, ["availabilityZone"])) return false;
  const subnet = value["subnet"];
  const endPoints = value["endPoints"];
  return (
    (subnet === undefined || subnet === null || isRecord(subnet)) &&
    (endPoints === undefined || endPoints === null || (Array.isArray(endPoints) && endPoints.every(isRecord)))
  );
}

export function isRdsMysqlMaintenance(value: unknown): value is RdsMysqlMaintenance {
  return (
    isRecord(value) &&
    hasStrings(value, ["maintenanceId", "type", "status"]) &&
    hasOptionalStrings(value, ["category", "description", "deadlineYmdt", "executionType", "addedYmdt"]) &&
    isOptionalBoolean(value["required"])
  );
}
