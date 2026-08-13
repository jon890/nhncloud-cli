/** 외부 문자열의 ANSI escape와 제어 문자를 터미널 출력 전에 치환한다. */
export function sanitizeForTerminal(value: string): string {
  return value.replace(/[\x00-\x1F\x7F]/g, "?");
}
