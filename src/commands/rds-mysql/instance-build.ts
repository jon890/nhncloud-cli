import type { Command } from "commander";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { collectOption, parseIntegerOption } from "../parse-options.js";
import { parseUuidArgument } from "./helpers.js";

/**
 * DB 인스턴스 생성과 복제가 같이 쓰는 옵션과 요청 본문 조립이다 (API v4.0 의 network, storage, backup 객체).
 * 생성은 필수인 항목을 복제는 선택으로 받는다.
 */

const BACKUP_WINDOWS: Readonly<Record<string, string>> = {
  "30m": "HALF_AN_HOUR",
  "1h": "ONE_HOUR",
  "1h30m": "ONE_HOUR_AND_HALF",
  "2h": "TWO_HOURS",
  "2h30m": "TWO_HOURS_AND_HALF",
  "3h": "THREE_HOURS",
};

const BACKUP_REGIONS: ReadonlySet<string> = new Set(["KR1", "KR2", "JP1"]);

export interface BuildOptions {
  availabilityZone?: string;
  publicAccess?: boolean;
  storageType?: string;
  storageSize?: string;
  autoscale?: boolean;
  autoscaleThreshold?: string;
  autoscaleMaxSize?: string;
  autoscaleCooldown?: string;
  backupPeriod?: string;
  backupRetryCount?: string;
  ftwrlWaitTimeout?: string;
  backupRegion?: string;
  backupLock?: boolean;
  backupSchedule?: string[];
}

function fail(message: string): never {
  throw new NhnCloudCliError(message, EXIT_PARAM_ERROR);
}

/** 스토리지, 네트워크, 백업 옵션을 붙인다. */
export function addBuildOptions(command: Command): Command {
  return command
    .option("--public-access", "외부 접속을 허용한다 (기본 허용 안 함)")
    .option("--storage-type <type>", "데이터 스토리지 유형 (storage types 로 조회, 예: General SSD)")
    .option("--storage-size <gb>", "데이터 스토리지 크기 (GB, 20 이상)")
    .option("--autoscale", "스토리지 자동 확장을 쓴다")
    .option("--autoscale-threshold <percent>", "자동 확장 조건 (50~95, --autoscale 와 함께)")
    .option("--autoscale-max-size <gb>", "자동 확장 최대 크기 (GB, 4096 이하, --autoscale 와 함께)")
    .option("--autoscale-cooldown <min>", "자동 확장 쿨다운 (분, 10~1440, --autoscale 와 함께)")
    .option("--backup-period <days>", "백업 보관 기간 (일, 0~730)")
    .option("--backup-retry-count <n>", "백업 재시도 횟수 (0~10)")
    .option("--ftwrl-wait-timeout <sec>", "백업 쿼리 지연 대기 시간 (초, 0~21600)")
    .option("--backup-region <region>", "백업 복제 리전 (KR1|KR2|JP1)")
    .option("--no-backup-lock", "백업에 테이블 잠금을 쓰지 않는다")
    .option(
      "--backup-schedule <HH:MM[:SS]@window>",
      `백업 시작 시간과 윈도우 (window: ${Object.keys(BACKUP_WINDOWS).join("|")}, 예: 02:00@1h). 여러 번 지정할 수 있다`,
      collectOption,
      [] as string[],
    );
}

function parseSchedule(value: string): { backupWndBgnTime: string; backupWndDuration: string } {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?@(.+)$/.exec(value);
  const duration = match?.[4] !== undefined && Object.hasOwn(BACKUP_WINDOWS, match[4]) ? BACKUP_WINDOWS[match[4]] : undefined;
  if (match === null || duration === undefined) {
    fail(
      `--backup-schedule 은 HH:MM[:SS]@window 형식이어야 합니다 (window: ${Object.keys(BACKUP_WINDOWS).join("|")}, 입력: ${JSON.stringify(value)}).`,
    );
  }
  const [hour, minute, second] = [Number(match[1]), Number(match[2]), Number(match[3] ?? "0")];
  if (hour > 23 || minute > 59 || second > 59) fail(`--backup-schedule 의 시간이 올바르지 않습니다 (입력: ${JSON.stringify(value)}).`);
  return {
    backupWndBgnTime: `${match[1]}:${match[2]}:${match[3] ?? "00"}`,
    backupWndDuration: duration,
  };
}

export function buildNetwork(opts: BuildOptions): Record<string, unknown> {
  return {
    ...(opts.publicAccess === true ? { usePublicAccess: true } : {}),
    availabilityZone: opts.availabilityZone,
  };
}

/** 스토리지 옵션이 하나도 없으면 undefined 다. 생성은 호출하는 쪽이 필수 항목을 따로 검사한다. */
export function buildStorage(opts: BuildOptions): Record<string, unknown> | undefined {
  const autoscaleFlags = [opts.autoscaleThreshold, opts.autoscaleMaxSize, opts.autoscaleCooldown];
  if (opts.autoscale !== true && autoscaleFlags.some((v) => v !== undefined)) {
    fail("--autoscale-threshold, --autoscale-max-size, --autoscale-cooldown 은 --autoscale 와 함께 씁니다.");
  }
  let storageAutoscale: Record<string, unknown> | undefined;
  if (opts.autoscale === true) {
    if (autoscaleFlags.some((v) => v === undefined)) {
      fail("--autoscale 는 --autoscale-threshold, --autoscale-max-size, --autoscale-cooldown 을 모두 지정해야 합니다.");
    }
    storageAutoscale = {
      useStorageAutoscale: true,
      threshold: parseIntegerOption(opts.autoscaleThreshold as string, "--autoscale-threshold", { min: 50, max: 95 }),
      maxStorageSize: parseIntegerOption(opts.autoscaleMaxSize as string, "--autoscale-max-size", { min: 1, max: 4096 }),
      cooldownTime: parseIntegerOption(opts.autoscaleCooldown as string, "--autoscale-cooldown", { min: 10, max: 1440 }),
    };
  }
  const storage: Record<string, unknown> = {
    ...(opts.storageType === undefined ? {} : { storageType: opts.storageType }),
    ...(opts.storageSize === undefined ? {} : { storageSize: parseIntegerOption(opts.storageSize, "--storage-size", { min: 20 }) }),
    ...(storageAutoscale === undefined ? {} : { storageAutoscale }),
  };
  return Object.keys(storage).length === 0 ? undefined : storage;
}

export function buildBackup(opts: BuildOptions): Record<string, unknown> | undefined {
  let replicationRegion: string | undefined;
  if (opts.backupRegion !== undefined) {
    replicationRegion = opts.backupRegion.toUpperCase();
    if (!BACKUP_REGIONS.has(replicationRegion)) fail(`--backup-region 은 KR1, KR2, JP1 중 하나여야 합니다 (입력: ${JSON.stringify(opts.backupRegion)}).`);
  }
  const schedules = (opts.backupSchedule ?? []).map(parseSchedule);
  const backup: Record<string, unknown> = {
    ...(opts.backupPeriod === undefined ? {} : { backupPeriod: parseIntegerOption(opts.backupPeriod, "--backup-period", { min: 0, max: 730 }) }),
    ...(opts.backupRetryCount === undefined ? {} : { backupRetryCount: parseIntegerOption(opts.backupRetryCount, "--backup-retry-count", { min: 0, max: 10 }) }),
    ...(opts.ftwrlWaitTimeout === undefined ? {} : { ftwrlWaitTimeout: parseIntegerOption(opts.ftwrlWaitTimeout, "--ftwrl-wait-timeout", { min: 0, max: 21600 }) }),
    ...(replicationRegion === undefined ? {} : { replicationRegion }),
    // --no-backup-lock 만 값이 있다. 기본(true)은 서버에 맡긴다.
    ...(opts.backupLock === false ? { useBackupLock: false } : {}),
    ...(schedules.length === 0 ? {} : { backupSchedules: schedules }),
  };
  return Object.keys(backup).length === 0 ? undefined : backup;
}

/** 반복 옵션으로 받은 UUID 목록을 검사한다. */
export function parseUuidList(values: string[] | undefined, flag: string): string[] | undefined {
  if (values === undefined || values.length === 0) return undefined;
  return values.map((value) => parseUuidArgument(value, flag));
}

export function checkNameLength(value: string, flag: string, max: number, min = 1): void {
  const length = [...value].length;
  if (length < min || length > max) fail(`${flag} 은 ${min}자 이상 ${max}자 이하여야 합니다 (입력 길이: ${length}).`);
}

export function parsePort(value: string, flag = "--port"): number {
  return parseIntegerOption(value, flag, { min: 3306, max: 43306 });
}
