import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import type { RdsMysqlList } from "../../services/rds-mysql/types.js";
import { parseIntegerOption } from "../parse-options.js";
import { parseUuidArgument } from "./helpers.js";

/** 보안 그룹, 사용자 그룹, 알림 그룹, 모니터링, 이벤트 명령이 함께 쓰는 입력 해석이다 (ADR-054). */

export function fail(message: string): never {
  throw new NhnCloudCliError(message, EXIT_PARAM_ERROR);
}

/** 이름은 1자 이상 max 자 이하여야 한다. */
export function checkLength(value: string, flag: string, max: number): string {
  const length = [...value].length;
  if (length < 1 || length > max) fail(`${flag}은 1자 이상 ${max}자 이하여야 합니다 (입력 길이: ${length}).`);
  return value;
}

export function checkOptionalLength(value: string | undefined, flag: string, max: number): string | undefined {
  if (value === undefined) return undefined;
  if ([...value].length > max) fail(`${flag}은 ${max}자 이하여야 합니다.`);
  return value;
}

/** 반복 지정한 UUID 옵션을 검사하고 중복을 지운다. */
export function parseUuidList(values: string[] | undefined, flag: string): string[] {
  return [...new Set((values ?? []).map((value) => parseUuidArgument(value, flag)))];
}

/** 현재 목록에 더하고 뺀 결과를 돌려준다. 이미 있는 것을 더하거나 없는 것을 빼면 무시한다. */
export function mergeList(current: readonly string[], add: readonly string[], remove: readonly string[]): string[] {
  const removed = new Set(remove);
  const merged = [...current, ...add.filter((value) => !current.includes(value))];
  return merged.filter((value) => !removed.has(value));
}

export function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value) => b.includes(value));
}

/** 같은 값을 더하면서 빼는 지정은 모순이라 막는다. */
export function assertNoOverlap(add: readonly string[], remove: readonly string[], addFlag: string, removeFlag: string): void {
  const overlap = add.filter((value) => remove.includes(value));
  if (overlap.length > 0) fail(`${addFlag}와 ${removeFlag}에 같은 값이 있습니다: ${overlap.join(", ")}`);
}

/** 양쪽 플래그(--x, --no-x)가 모두 없으면 undefined 다. */
export function resolveSwitch(
  enable: boolean | undefined,
  disable: boolean | undefined,
  enableFlag: string,
  disableFlag: string,
): boolean | undefined {
  if (enable === true && disable === true) fail(`${enableFlag}와 ${disableFlag}는 함께 쓸 수 없습니다.`);
  if (enable === true) return true;
  if (disable === true) return false;
  return undefined;
}

const MAX_PAGES = 50;

/** 페이지 목록을 끝까지 읽는다. 서버가 전체 개수를 알리지 않으면 마지막 페이지가 비거나 작을 때 멈춘다. */
export async function fetchAllPages<T>(fetchPage: (page: number) => Promise<RdsMysqlList<T>>, pageSize = 100): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const list = await fetchPage(page);
    all.push(...list.items);
    const done = list.totalCounts !== null ? all.length >= list.totalCounts : list.items.length < pageSize;
    if (done || list.items.length === 0) return all;
  }
  return all;
}

/**
 * 삭제가 반영됐는지 목록으로 확인한다. 전체를 읽지 못해 판단할 수 없으면 오류를 던진다(호출 쪽이 알 수 없음으로 처리한다).
 */
export async function isAbsentFromList<T>(
  fetchPage: (page: number) => Promise<RdsMysqlList<T>>,
  idOf: (item: T) => string,
  id: string,
): Promise<boolean> {
  const all = await fetchAllPages(fetchPage);
  return all.every((item) => idOf(item) !== id);
}

// ---------------------------------------------------------------------------
// 시간 범위
// ---------------------------------------------------------------------------

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 시각을 항상 +09:00 형식으로 쓴다. 서버는 콜론 없는 시간대(+0900)를 받지 못한다 (실호출 확인). */
export function formatKst(timeMs: number): string {
  const shifted = new Date(timeMs + KST_OFFSET_MS).toISOString();
  return `${shifted.slice(0, 19)}+09:00`;
}

/** 시간대가 있는 ISO 8601 만 받는다. +0900 처럼 콜론이 없는 시간대도 받아 +09:00 으로 바꿔 보낸다. */
export function parseIsoInstant(value: string, flag: string): number {
  if (!ISO_WITH_OFFSET.test(value)) {
    fail(`${flag}은 시간대가 있는 ISO 8601 형식이어야 합니다 (예: 2026-01-31T09:00:00+09:00, 입력: ${JSON.stringify(value)}).`);
  }
  const normalized = value.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const time = Date.parse(normalized);
  if (Number.isNaN(time)) fail(`${flag}에 올바른 시각이 아닙니다 (입력: ${JSON.stringify(value)}).`);
  return time;
}

const DURATION_PATTERN = /^(\d+)([mhd])$/;
const DURATION_UNIT_MS: Readonly<Record<string, number>> = { m: 60_000, h: 3_600_000, d: 86_400_000 };

export function parseDuration(value: string, flag: string): number {
  const match = DURATION_PATTERN.exec(value);
  const amount = match === null ? 0 : Number(match[1]);
  if (match === null || amount < 1) fail(`${flag}은 30m, 6h, 1d 처럼 숫자와 단위(m|h|d)여야 합니다 (입력: ${JSON.stringify(value)}).`);
  return amount * DURATION_UNIT_MS[match![2] as string]!;
}

export interface TimeRangeOptions {
  from?: string;
  to?: string;
  last?: string;
}

/**
 * --from/--to 나 --last 로 조회 범위를 정한다. --to 가 없으면 지금이다.
 * 시작이 종료보다 늦으면 요청 전에 종료 코드 3 이다.
 */
export function resolveTimeRange(opts: TimeRangeOptions, now: number = Date.now()): { from: string; to: string } {
  if (opts.last !== undefined && opts.from !== undefined) fail("--last와 --from은 함께 쓸 수 없습니다.");
  const to = opts.to === undefined ? now : parseIsoInstant(opts.to, "--to");
  let from: number;
  if (opts.last !== undefined) {
    from = to - parseDuration(opts.last, "--last");
  } else if (opts.from !== undefined) {
    from = parseIsoInstant(opts.from, "--from");
  } else {
    return fail("--from(시작 시각) 또는 --last(예: 1h)를 지정해야 합니다.");
  }
  if (from >= to) fail("시작 시각은 종료 시각보다 앞이어야 합니다.");
  return { from: formatKst(from), to: formatKst(to) };
}

export function parsePageOptions(opts: { page?: string; size?: string }): { page?: number; size?: number } {
  return {
    page: opts.page === undefined ? undefined : parseIntegerOption(opts.page, "--page", { min: 1 }),
    size: opts.size === undefined ? undefined : parseIntegerOption(opts.size, "--size", { min: 1, max: 100 }),
  };
}

/** 전체 개수가 보인 개수보다 크면 이어서 조회하라고 안내한다. */
export function noticeTruncated(totalCounts: number | null, shown: number): void {
  if (totalCounts !== null && totalCounts > shown) {
    process.stderr.write(`안내: 전체 ${totalCounts}개 중 ${shown}개를 보였습니다. --page, --size 로 이어서 조회합니다.\n`);
  }
}
