import ky, { HTTPError } from "ky";
import { rdsMysqlHost } from "../../api/endpoints.js";
import { readHttpErrorBody, toNhnCloudCliError } from "../../api/httpError.js";
import { DEFAULT_TIMEOUT_MS } from "../../api/timeout.js";
import type { CloudEnvironment } from "../../config/types.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_API_ERROR } from "../../utils/exit-codes.js";
import { RdsMysqlApiError } from "./errors.js";
import {
  classifyJobStatus,
  isRdsMysqlBackup,
  isRdsMysqlAvailabilityZone,
  isRdsMysqlBackupDetail,
  isRdsMysqlBackupInfo,
  isRdsMysqlCertificate,
  isRdsMysqlLogFile,
  isRdsMysqlRestorationInfo,
  isRdsMysqlBinLog,
  isRdsMysqlDbFlavor,
  isRdsMysqlDbInstance,
  isRdsMysqlDbInstanceDetail,
  isRdsMysqlDbSchema,
  isRdsMysqlDbUser,
  isRdsMysqlDbVersion,
  isRdsMysqlHaInfo,
  isRdsMysqlJob,
  isRdsMysqlMaintenance,
  isRdsMysqlNetworkInfo,
  isRdsMysqlParameterGroup,
  isRdsMysqlParameterGroupDetail,
  isRdsMysqlProjectMember,
  isRdsMysqlRegion,
  isRdsMysqlStorageInfo,
  isRdsMysqlSubnet,
  type RdsMysqlAvailabilityZone,
  type RdsMysqlBackup,
  type RdsMysqlBackupInfo,
  type RdsMysqlBinLog,
  type RdsMysqlCertificate,
  type RdsMysqlLogFile,
  type RdsMysqlRestorationInfo,
  type RdsMysqlDbFlavor,
  type RdsMysqlDbInstance,
  type RdsMysqlDbInstanceDetail,
  type RdsMysqlDbSchema,
  type RdsMysqlDbUser,
  type RdsMysqlDbUserCreateInput,
  type RdsMysqlDbUserUpdateInput,
  type RdsMysqlDbVersion,
  type RdsMysqlHaInfo,
  type RdsMysqlJob,
  type RdsMysqlList,
  type RdsMysqlMaintenance,
  type RdsMysqlNetworkInfo,
  type RdsMysqlParameterGroup,
  type RdsMysqlParameterGroupDetail,
  type RdsMysqlProjectMember,
  type RdsMysqlRegion,
  type RdsMysqlStorageInfo,
  type RdsMysqlSubnet,
} from "./types.js";

/** 작업 상태 조회 간격 기본값 (ADR-047). */
const DEFAULT_JOB_POLL_INTERVAL_MS = 3000;

type HttpMethod = "get" | "post" | "put" | "delete";

type Guard<T> = (value: unknown) => value is T;

type Envelope = Record<string, unknown> & { header: Record<string, unknown> & { isSuccessful: boolean } };

export interface RdsMysqlJobWaitResult {
  outcome: "completed" | "failed" | "uncertain" | "timeout";
  job: RdsMysqlJob | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** 성공 판정에 쓰는 header.isSuccessful 이 있는 봉투인지 검사한다 (ADR-006, ADR-046). */
function isEnvelope(value: unknown): value is Envelope {
  if (!isRecord(value)) return false;
  const header = value["header"];
  return isRecord(header) && typeof header["isSuccessful"] === "boolean";
}

function arrayOf<T>(guard: Guard<T>): Guard<T[]> {
  return (value: unknown): value is T[] => Array.isArray(value) && value.every(guard);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function envelopeError(header: Record<string, unknown>, httpStatus?: number, readRequest = false): RdsMysqlApiError {
  const code = header["resultCode"];
  const message = header["resultMessage"];
  return new RdsMysqlApiError(
    typeof code === "number" || typeof code === "string" ? code : String(code),
    typeof message === "string" ? message : "",
    httpStatus,
    { readRequest },
  );
}

/**
 * HTTP 4xx·5xx 응답 본문이 봉투면 결과 코드를 담은 RdsMysqlApiError 로, 아니면 공용 변환 결과로 바꾼다.
 * 요청 본문(비밀번호)은 오류 메시지에 넣지 않는다.
 */
async function toRdsMysqlError(err: unknown): Promise<NhnCloudCliError> {
  if (!(err instanceof HTTPError)) return toNhnCloudCliError(err);
  const body = await readHttpErrorBody(err);
  if (isEnvelope(body)) return envelopeError(body.header, err.response.status);
  return toNhnCloudCliError(err);
}

function formatError(field: string): NhnCloudCliError {
  return new NhnCloudCliError(`RDS for MySQL 응답 형식 오류: ${field}`, EXIT_API_ERROR);
}

/** header 키를 뺀 나머지 키를 원래 순서대로 담는다. 출력 단계가 봉투를 다시 보지 않게 한다. */
function withoutHeader(response: Envelope): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(response)) {
    if (key !== "header") result[key] = value;
  }
  return result;
}

/**
 * RDS for MySQL API v4.0 클라이언트 (ADR-051).
 * 요청마다 appkey 와 공통 UAK 로 교환한 토큰을 `X-NHN-AUTHORIZATION: Bearer` 로 보낸다.
 * 결과는 body 가 아니라 header 옆의 이름 있는 필드로 온다.
 */
export class RdsMysqlClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(appKey: string, accessToken: string, region: string, environment: CloudEnvironment) {
    this.baseUrl = `https://${rdsMysqlHost(region, environment)}/v4.0`;
    this.headers = {
      "X-TC-APP-KEY": appKey,
      "X-NHN-AUTHORIZATION": `Bearer ${accessToken}`,
    };
  }

  /**
   * 요청을 보내고 성공 봉투를 반환한다.
   * 쓰기 요청이 중복 실행되지 않게 재시도하지 않는다.
   * 문서가 응답 본문이 없다고 한 요청은 빈 본문도 성공으로 본다(allowEmptyBody).
   */
  private async send(
    method: HttpMethod,
    path: string,
    opts: { json?: unknown; query?: Record<string, string | number | boolean | undefined>; allowEmptyBody?: boolean } = {},
  ): Promise<Envelope> {
    const searchParams = Object.fromEntries(Object.entries(opts.query ?? {}).filter(([, value]) => value !== undefined));
    let response: unknown;
    try {
      const request = ky[method](`${this.baseUrl}${path}`, {
        headers: this.headers,
        ...(opts.json === undefined ? {} : { json: opts.json }),
        ...(Object.keys(searchParams).length === 0 ? {} : { searchParams: searchParams as Record<string, string> }),
        retry: 0,
        timeout: DEFAULT_TIMEOUT_MS,
      });
      if (opts.allowEmptyBody === true) {
        const text = await request.text();
        if (text.trim() === "") return { header: { isSuccessful: true } };
        response = JSON.parse(text) as unknown;
      } else {
        response = await request.json<unknown>();
      }
    } catch (err) {
      throw await toRdsMysqlError(err);
    }

    if (!isEnvelope(response)) throw formatError("header");
    if (!response.header.isSuccessful) throw envelopeError(response.header, undefined, method === "get");
    return response;
  }

  /** 이름 있는 필드 하나를 가드로 검사해 반환한다. 목록이 배열이 아니면 빈 배열로 숨기지 않고 형식 오류로 끝낸다. */
  private async field<T>(
    method: HttpMethod,
    path: string,
    field: string,
    guard: Guard<T>,
    json?: unknown,
    query?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    const value = (await this.send(method, path, { json, query }))[field];
    if (!guard(value)) throw formatError(field);
    return value;
  }

  /** header 를 뺀 최상위 객체를 가드로 검사해 반환한다. */
  private async topLevel<T>(path: string, name: string, guard: Guard<T>): Promise<T> {
    const value = withoutHeader(await this.send("get", path));
    if (!guard(value)) throw formatError(name);
    return value;
  }

  private instancePath(dbInstanceId: string): string {
    return `/db-instances/${encodeURIComponent(dbInstanceId)}`;
  }

  private userPath(dbInstanceId: string, dbUserId: string): string {
    return `${this.instancePath(dbInstanceId)}/db-users/${encodeURIComponent(dbUserId)}`;
  }

  listDbInstances(): Promise<RdsMysqlDbInstance[]> {
    return this.field("get", "/db-instances", "dbInstances", arrayOf(isRdsMysqlDbInstance));
  }

  getDbInstance(dbInstanceId: string): Promise<RdsMysqlDbInstanceDetail> {
    return this.topLevel(this.instancePath(dbInstanceId), "dbInstance", isRdsMysqlDbInstanceDetail);
  }

  listDbSchemas(dbInstanceId: string): Promise<RdsMysqlDbSchema[]> {
    return this.field("get", `${this.instancePath(dbInstanceId)}/db-schemas`, "dbSchemas", arrayOf(isRdsMysqlDbSchema));
  }

  createDbSchema(dbInstanceId: string, dbSchemaName: string): Promise<string> {
    return this.field("post", `${this.instancePath(dbInstanceId)}/db-schemas`, "jobId", isString, { dbSchemaName });
  }

  listDbUsers(dbInstanceId: string): Promise<RdsMysqlDbUser[]> {
    return this.field("get", `${this.instancePath(dbInstanceId)}/db-users`, "dbUsers", arrayOf(isRdsMysqlDbUser));
  }

  createDbUser(dbInstanceId: string, input: RdsMysqlDbUserCreateInput): Promise<string> {
    return this.field("post", `${this.instancePath(dbInstanceId)}/db-users`, "jobId", isString, input);
  }

  /** 값이 undefined 인 키는 본문에서 뺀다. */
  updateDbUser(dbInstanceId: string, dbUserId: string, input: RdsMysqlDbUserUpdateInput): Promise<string> {
    const body = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
    return this.field("put", this.userPath(dbInstanceId, dbUserId), "jobId", isString, body);
  }

  deleteDbUser(dbInstanceId: string, dbUserId: string): Promise<string> {
    return this.field("delete", this.userPath(dbInstanceId, dbUserId), "jobId", isString);
  }

  /** 목록 필드와 totalCounts 를 함께 돌려준다. totalCounts 가 없거나 숫자가 아니면 null 이다. */
  private async listField<T>(
    path: string,
    field: string,
    guard: Guard<T>,
    query?: Record<string, string | number | boolean | undefined>,
  ): Promise<RdsMysqlList<T>> {
    const response = await this.send("get", path, { query });
    const items = response[field];
    if (!arrayOf(guard)(items)) throw formatError(field);
    const total = response["totalCounts"];
    // 숫자가 문자열로 올 수 있어(Deploy 응답과 같은 패턴) 숫자 문자열은 바꿔 받는다.
    const totalCounts =
      typeof total === "number" ? total : typeof total === "string" && /^\d+$/.test(total) ? Number(total) : null;
    return { items, totalCounts };
  }

  listParameterGroups(query: {
    parameterGroupName?: string;
    dbVersion?: string;
    page?: number;
    size?: number;
  }): Promise<RdsMysqlList<RdsMysqlParameterGroup>> {
    return this.listField("/parameter-groups", "parameterGroups", isRdsMysqlParameterGroup, query);
  }

  getParameterGroup(parameterGroupId: string): Promise<RdsMysqlParameterGroupDetail> {
    return this.topLevel(
      `/parameter-groups/${encodeURIComponent(parameterGroupId)}`,
      "parameterGroup",
      isRdsMysqlParameterGroupDetail,
    );
  }

  /** 복사본의 parameterGroupId 를 돌려준다. 작업(jobId)이 아니라 바로 만들어진다. */
  copyParameterGroup(
    parameterGroupId: string,
    input: { parameterGroupName: string; description?: string },
  ): Promise<string> {
    return this.field("post", `/parameter-groups/${encodeURIComponent(parameterGroupId)}/copy`, "parameterGroupId", isString, input);
  }

  /** 응답 본문이 없는 요청이다. 값만 바꾸고 DB 인스턴스에는 적용하지 않는다. */
  async updateParameters(parameterGroupId: string, modifiedParameters: { parameterId: string; value: string }[]): Promise<void> {
    await this.send("put", `/parameter-groups/${encodeURIComponent(parameterGroupId)}/parameters`, {
      json: { modifiedParameters },
      allowEmptyBody: true,
    });
  }

  async resetParameterGroup(parameterGroupId: string): Promise<void> {
    await this.send("put", `/parameter-groups/${encodeURIComponent(parameterGroupId)}/reset`, { allowEmptyBody: true });
  }

  /** DB 인스턴스에 연결할 파라미터 그룹만 바꾼다. 다른 수정 항목은 본문에 넣지 않는다. */
  setInstanceParameterGroup(dbInstanceId: string, parameterGroupId: string): Promise<string> {
    return this.field("put", this.instancePath(dbInstanceId), "jobId", isString, { parameterGroupId });
  }

  async listBinLogs(dbInstanceId: string, deletable: boolean): Promise<RdsMysqlBinLog[]> {
    return (
      await this.listField(`${this.instancePath(dbInstanceId)}/binlogs`, "binLogs", isRdsMysqlBinLog, { deletable })
    ).items;
  }

  /** `lastBinLogFileName` 직전 파일까지 지운다. 응답 본문이 없어 작업 대기 대상이 아니다. */
  async purgeBinLogs(dbInstanceId: string, lastBinLogFileName: string): Promise<void> {
    await this.send("post", `${this.instancePath(dbInstanceId)}/binlogs/purge`, {
      json: { lastBinLogFileName },
      allowEmptyBody: true,
    });
  }

  getStorageInfo(dbInstanceId: string): Promise<RdsMysqlStorageInfo> {
    return this.topLevel(`${this.instancePath(dbInstanceId)}/storage-info`, "storageInfo", isRdsMysqlStorageInfo);
  }

  updateStorageInfo(dbInstanceId: string, body: { storageSize: number; storageAutoscale?: Record<string, unknown> }): Promise<string> {
    return this.field("put", `${this.instancePath(dbInstanceId)}/storage-info`, "jobId", isString, body);
  }

  getBackupInfo(dbInstanceId: string): Promise<RdsMysqlBackupInfo> {
    return this.topLevel(`${this.instancePath(dbInstanceId)}/backup-info`, "backupInfo", isRdsMysqlBackupInfo);
  }

  listBackups(query: {
    backupType?: string;
    dbInstanceId?: string;
    dbVersion?: string;
    page?: number;
    size?: number;
  }): Promise<RdsMysqlList<RdsMysqlBackup>> {
    return this.listField("/backups", "backups", isRdsMysqlBackup, query);
  }

  /** 응답의 `backup` 객체를 그대로 돌려준다. */
  getBackup(backupId: string): Promise<Record<string, unknown>> {
    return this.field("get", `/backups/${encodeURIComponent(backupId)}`, "backup", isRdsMysqlBackupDetail);
  }

  createBackup(body: Record<string, unknown>): Promise<string> {
    return this.field("post", "/backups", "jobId", isString, body);
  }

  deleteBackup(backupId: string): Promise<string> {
    return this.field("delete", `/backups/${encodeURIComponent(backupId)}`, "jobId", isString);
  }

  exportBackup(backupId: string, body: Record<string, unknown>): Promise<string> {
    return this.field("post", `/backups/${encodeURIComponent(backupId)}/export`, "jobId", isString, body);
  }

  restoreBackup(backupId: string, body: Record<string, unknown>): Promise<string> {
    return this.field("post", `/backups/${encodeURIComponent(backupId)}/restore`, "jobId", isString, body);
  }

  updateBackupInfo(dbInstanceId: string, body: Record<string, unknown>): Promise<string> {
    return this.field("put", `${this.instancePath(dbInstanceId)}/backup-info`, "jobId", isString, body);
  }

  getRestorationInfo(dbInstanceId: string): Promise<RdsMysqlRestorationInfo> {
    return this.topLevel(`${this.instancePath(dbInstanceId)}/restoration-info`, "restorationInfo", isRdsMysqlRestorationInfo);
  }

  /** 시점 복원과 바이너리 로그 복원이다. 새 DB 인스턴스를 만든다. */
  restoreDbInstance(dbInstanceId: string, body: Record<string, unknown>): Promise<string> {
    return this.field("post", `${this.instancePath(dbInstanceId)}/restore`, "jobId", isString, body);
  }

  restoreFromObjectStorage(body: Record<string, unknown>): Promise<string> {
    return this.field("post", "/db-instances/restore-from-obs", "jobId", isString, body);
  }

  listCertificates(dbInstanceId: string): Promise<RdsMysqlCertificate[]> {
    return this.field("get", `${this.instancePath(dbInstanceId)}/certificates`, "certificates", arrayOf(isRdsMysqlCertificate));
  }

  /** 경로가 `/certificates/upload` 다. 문서의 기능 이름은 내보내기다. */
  exportCertificates(dbInstanceId: string, body: Record<string, unknown>): Promise<string> {
    return this.field("post", `${this.instancePath(dbInstanceId)}/certificates/upload`, "jobId", isString, body);
  }

  listLogFiles(dbInstanceId: string, logFileTypes: string[] | undefined): Promise<RdsMysqlLogFile[]> {
    const query = logFileTypes === undefined || logFileTypes.length === 0 ? undefined : { logFileTypes: logFileTypes.join(",") };
    return this.field("get", `${this.instancePath(dbInstanceId)}/log-files`, "logFiles", arrayOf(isRdsMysqlLogFile), undefined, query);
  }

  /** 로그 내용은 최대 65533 바이트까지만 온다. */
  getLogFileContent(dbInstanceId: string, logFileName: string, logFileType: string): Promise<string> {
    return this.field(
      "get",
      `${this.instancePath(dbInstanceId)}/log-files/${encodeURIComponent(logFileName)}`,
      "content",
      isString,
      undefined,
      { logFileType },
    );
  }

  exportLogFiles(dbInstanceId: string, body: Record<string, unknown>): Promise<string> {
    return this.field("post", `${this.instancePath(dbInstanceId)}/log-files/export`, "jobId", isString, body);
  }

  getHaInfo(dbInstanceId: string): Promise<RdsMysqlHaInfo> {
    return this.topLevel(`${this.instancePath(dbInstanceId)}/high-availability`, "highAvailability", isRdsMysqlHaInfo);
  }

  haAction(dbInstanceId: string, action: "pause" | "resume" | "repair" | "split"): Promise<string> {
    return this.field("post", `${this.instancePath(dbInstanceId)}/high-availability/${action}`, "jobId", isString);
  }

  rebuildDbInstance(dbInstanceId: string): Promise<string> {
    return this.field("post", `${this.instancePath(dbInstanceId)}/rebuild`, "jobId", isString);
  }

  /** 본문 필드는 호출하는 쪽이 만든다. 생성과 복제는 응답에 작업만 있다. */
  createDbInstance(body: Record<string, unknown>): Promise<string> {
    return this.field("post", "/db-instances", "jobId", isString, body);
  }

  replicateDbInstance(dbInstanceId: string, body: Record<string, unknown>): Promise<string> {
    return this.field("post", `${this.instancePath(dbInstanceId)}/replicate`, "jobId", isString, body);
  }

  /** 삭제 요청은 본문에 자동 백업 삭제 여부를 싣는다. */
  deleteDbInstance(dbInstanceId: string, deleteAutoBackup: boolean): Promise<string> {
    return this.field("delete", this.instancePath(dbInstanceId), "jobId", isString, { deleteAutoBackup });
  }

  startDbInstance(dbInstanceId: string): Promise<string> {
    return this.field("post", `${this.instancePath(dbInstanceId)}/start`, "jobId", isString);
  }

  stopDbInstance(dbInstanceId: string): Promise<string> {
    return this.field("post", `${this.instancePath(dbInstanceId)}/stop`, "jobId", isString);
  }

  restartDbInstance(dbInstanceId: string, body: Record<string, boolean>): Promise<string> {
    return this.field("post", `${this.instancePath(dbInstanceId)}/restart`, "jobId", isString, body);
  }

  /** 응답 본문이 없는 요청이다. 작업 대기 대상이 아니다. */
  async forceRestartDbInstance(dbInstanceId: string): Promise<void> {
    await this.send("post", `${this.instancePath(dbInstanceId)}/force-restart`, { allowEmptyBody: true });
  }

  promoteDbInstance(dbInstanceId: string): Promise<string> {
    return this.field("post", `${this.instancePath(dbInstanceId)}/promote`, "jobId", isString);
  }

  /** 수정할 필드만 본문에 담는다. parameterGroupId 는 setInstanceParameterGroup 이 맡는다. */
  modifyDbInstance(dbInstanceId: string, body: Record<string, unknown>): Promise<string> {
    return this.field("put", this.instancePath(dbInstanceId), "jobId", isString, body);
  }

  /** 응답 본문이 없는 요청이다. */
  async setDeletionProtection(dbInstanceId: string, useDeletionProtection: boolean): Promise<void> {
    await this.send("put", `${this.instancePath(dbInstanceId)}/deletion-protection`, {
      json: { useDeletionProtection },
      allowEmptyBody: true,
    });
  }

  getNetworkInfo(dbInstanceId: string): Promise<RdsMysqlNetworkInfo> {
    return this.topLevel(`${this.instancePath(dbInstanceId)}/network-info`, "networkInfo", isRdsMysqlNetworkInfo);
  }

  updateNetworkInfo(dbInstanceId: string, usePublicAccess: boolean): Promise<string> {
    return this.field("put", `${this.instancePath(dbInstanceId)}/network-info`, "jobId", isString, { usePublicAccess });
  }

  async listMaintenances(
    dbInstanceId: string,
    query: { type?: string; statuses?: string; category?: string },
  ): Promise<RdsMysqlList<RdsMysqlMaintenance>> {
    return this.listField(`${this.instancePath(dbInstanceId)}/maintenances`, "maintenances", isRdsMysqlMaintenance, query);
  }

  listDbFlavors(): Promise<RdsMysqlDbFlavor[]> {
    return this.field("get", "/db-flavors", "dbFlavors", arrayOf(isRdsMysqlDbFlavor));
  }

  listDbVersions(): Promise<RdsMysqlDbVersion[]> {
    return this.field("get", "/db-versions", "dbVersions", arrayOf(isRdsMysqlDbVersion));
  }

  listStorageTypes(): Promise<string[]> {
    return this.field("get", "/storage-types", "storageTypes", arrayOf(isString));
  }

  listSubnets(): Promise<RdsMysqlSubnet[]> {
    return this.field("get", "/network/subnets", "subnets", arrayOf(isRdsMysqlSubnet));
  }

  listAvailabilityZones(): Promise<RdsMysqlAvailabilityZone[]> {
    return this.field("get", "/availability-zones", "availabilityZones", arrayOf(isRdsMysqlAvailabilityZone));
  }

  listRegions(): Promise<RdsMysqlRegion[]> {
    return this.field("get", "/project/regions", "regions", arrayOf(isRdsMysqlRegion));
  }

  listProjectMembers(): Promise<RdsMysqlProjectMember[]> {
    return this.field("get", "/project/members", "members", arrayOf(isRdsMysqlProjectMember));
  }

  getJob(jobId: string): Promise<RdsMysqlJob> {
    return this.topLevel(`/jobs/${encodeURIComponent(jobId)}`, "job", isRdsMysqlJob);
  }

  /**
   * 작업이 끝날 때까지 상태를 조회한다 (ADR-047).
   * 상한을 넘기면 마지막으로 받은 작업과 함께 timeout 을 돌려준다. 조회 오류는 잡지 않고 그대로 던진다.
   */
  async waitForJob(jobId: string, opts: { timeoutMs: number; intervalMs?: number }): Promise<RdsMysqlJobWaitResult> {
    const intervalMs = opts.intervalMs ?? DEFAULT_JOB_POLL_INTERVAL_MS;
    const deadline = Date.now() + opts.timeoutMs;
    let lastJob: RdsMysqlJob | null = null;

    while (Date.now() < deadline) {
      const job = await this.getJob(jobId);
      lastJob = job;

      const outcome = classifyJobStatus(job.jobStatus);
      if (outcome !== "running") return { outcome, job };

      const remaining = deadline - Date.now();
      if (remaining <= 0) break;

      await new Promise<void>((resolve) => setTimeout(resolve, Math.min(intervalMs, remaining)));
    }

    return { outcome: "timeout", job: lastJob };
  }
}
