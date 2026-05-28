import { NhnCloudCliError } from "./errors.js";
import { EXIT_PARAM_ERROR } from "./exit-codes.js";

/**
 * Date → 로컬 타임존 오프셋 포함 ISO8601 문자열 조립.
 * Date.toISOString() 은 UTC(Z) 만 반환하므로 getTimezoneOffset 기반으로 수동 조립.
 */
function toLocalISOString(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absOffset = Math.abs(offsetMinutes);
  const offsetHH = String(Math.floor(absOffset / 60)).padStart(2, "0");
  const offsetMM = String(absOffset % 60).padStart(2, "0");

  const yyyy = String(date.getFullYear());
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");

  return `${yyyy}-${mo}-${dd}T${hh}:${mm}:${ss}${sign}${offsetHH}:${offsetMM}`;
}

/**
 * 시간 입력을 ISO8601 (로컬 오프셋 포함) 으로 정규화.
 *
 * - "now" → 현재 시각
 * - "30m" / "1h" / "2d" 형식 → 현재 기준 과거 시각
 * - 이미 ISO8601 형식이면 그대로 반환
 * - 파싱 불가 시 NhnCloudCliError
 */
export function resolveTime(input: string): string {
  const trimmed = input.trim();

  if (trimmed === "now") {
    return toLocalISOString(new Date());
  }

  const relativeMatch = trimmed.match(/^(\d+)(m|h|d)$/);
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2];
    const now = new Date();
    switch (unit) {
      case "m":
        now.setMinutes(now.getMinutes() - amount);
        break;
      case "h":
        now.setHours(now.getHours() - amount);
        break;
      case "d":
        now.setDate(now.getDate() - amount);
        break;
    }
    return toLocalISOString(now);
  }

  // ISO8601 형식 검증 (기본 패턴: YYYY-MM-DD 또는 YYYY-MM-DDTHH:mm... 포함)
  const isoPattern = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)?)?$/;
  if (isoPattern.test(trimmed)) {
    return trimmed;
  }

  throw new NhnCloudCliError(
    `시간 형식 오류: "${input}" — ISO8601 (예: 2024-01-01T00:00:00+09:00) 또는 상대시간 (예: 1h, 30m, 2d, now) 을 사용하세요.`,
    EXIT_PARAM_ERROR,
  );
}

/**
 * 검색 범위 사전 검증.
 * - from > to: 에러
 * - 범위 > 31일: 에러
 * - from 이 90일 이전: 에러
 */
export function assertSearchRange(fromIso: string, toIso: string): void {
  const from = new Date(fromIso);
  const to = new Date(toIso);

  if (from > to) {
    throw new NhnCloudCliError("from 이 to 보다 늦습니다.", EXIT_PARAM_ERROR);
  }

  const rangeMs = to.getTime() - from.getTime();
  const msPerDay = 24 * 60 * 60 * 1000;
  if (rangeMs > 31 * msPerDay) {
    throw new NhnCloudCliError("검색 범위는 31일 이하여야 합니다.", EXIT_PARAM_ERROR);
  }

  const ninetyDaysAgo = new Date(Date.now() - 90 * msPerDay);
  if (from < ninetyDaysAgo) {
    throw new NhnCloudCliError("검색 시작은 최근 90일 이내여야 합니다.", EXIT_PARAM_ERROR);
  }
}
