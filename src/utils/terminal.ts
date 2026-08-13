/** 외부 문자열의 ANSI escape와 제어 문자를 터미널 출력 전에 치환한다. */
export function sanitizeForTerminal(value: string): string {
  return value.replace(/[\x00-\x1F\x7F]/g, "?");
}

/**
 * 여러 줄 메시지를 정제한다 — 개행만 남기고 나머지 제어 문자를 치환한다.
 * 오류 메시지에는 CLI 가 만든 안내 줄과 서버가 준 문자열이 함께 담기므로,
 * 개행까지 지우면 안내가 한 줄로 뭉개진다.
 */
export function sanitizeMultilineForTerminal(value: string): string {
  return value.replace(/[\x00-\x09\x0B-\x1F\x7F]/g, "?");
}
