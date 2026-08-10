const SYNC_FLOOR_MS = 600_000;

export let DEFAULT_TIMEOUT_MS = 30_000;
export let SYNC_TIMEOUT_MS = SYNC_FLOOR_MS;

export function setRequestTimeoutMs(ms: number): void {
  // export 된 setter 라 호출부가 preAction 하나로 한정되지 않는다.
  // NaN 이면 이후 모든 요청이 즉시 끊기고 음수면 ky 동작이 정의되지 않으므로 진입점에서 막는다.
  if (!Number.isInteger(ms) || ms < 1) {
    throw new Error(`setRequestTimeoutMs: 1 이상의 정수여야 합니다 (입력: ${String(ms)}).`);
  }
  DEFAULT_TIMEOUT_MS = ms;
  // 긴 바이너리 전송의 기존 상한은 전역 값을 낮춰도 줄이지 않는다.
  SYNC_TIMEOUT_MS = Math.max(ms, SYNC_FLOOR_MS);
}

export function getRequestTimeoutMs(): number {
  return DEFAULT_TIMEOUT_MS;
}
