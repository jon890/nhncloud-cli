const SYNC_FLOOR_MS = 600_000;

export let DEFAULT_TIMEOUT_MS = 30_000;
export let SYNC_TIMEOUT_MS = SYNC_FLOOR_MS;

export function setRequestTimeoutMs(ms: number): void {
  DEFAULT_TIMEOUT_MS = ms;
  // 긴 바이너리 전송의 기존 상한은 전역 값을 낮춰도 줄이지 않는다.
  SYNC_TIMEOUT_MS = Math.max(ms, SYNC_FLOOR_MS);
}

export function getRequestTimeoutMs(): number {
  return DEFAULT_TIMEOUT_MS;
}
