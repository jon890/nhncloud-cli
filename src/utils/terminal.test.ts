import { describe, it, expect } from "vitest";
import { sanitizeForTerminal, sanitizeMultilineForTerminal } from "./terminal.js";

// 소스에 제어 문자를 직접 넣지 않는다 — 편집기와 diff 에서 보이지 않아 사라져도 알 수 없다.
const ESC = String.fromCharCode(27);
const NUL = String.fromCharCode(0);

describe("sanitizeForTerminal", () => {
  it("ANSI escape 와 제어 문자를 치환한다", () => {
    expect(sanitizeForTerminal(`bad${ESC}[31mred${NUL}`)).toBe("bad?[31mred?");
  });

  it("개행도 치환한다 — 한 줄로 만드는 것이 이 함수의 계약이다", () => {
    expect(sanitizeForTerminal("a\nb")).toBe("a?b");
  });

  it("일반 문자는 그대로 둔다", () => {
    expect(sanitizeForTerminal("정상 메시지 (id=abc-123)")).toBe("정상 메시지 (id=abc-123)");
  });
});

describe("sanitizeMultilineForTerminal", () => {
  it("개행은 남기고 나머지 제어 문자를 치환한다", () => {
    expect(sanitizeMultilineForTerminal(`처음 줄\n새 줄${ESC}[31m${NUL}`)).toBe(
      "처음 줄\n새 줄?[31m?",
    );
  });

  it("캐리지 리턴과 탭은 치환한다 — 줄 덮어쓰기와 정렬 위장을 막는다", () => {
    expect(sanitizeMultilineForTerminal("a\rb\tc")).toBe("a?b?c");
  });

  it("여러 줄 안내 메시지는 그대로 보존한다", () => {
    const message =
      "API 호출 실패 (500): internal error\n검색 기간이 넓어 서버가 처리하지 못했을 수 있습니다.";
    expect(sanitizeMultilineForTerminal(message)).toBe(message);
  });
});
