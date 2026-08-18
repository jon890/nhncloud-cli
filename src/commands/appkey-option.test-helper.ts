import type { Command } from "commander";

/**
 * 테스트 전용 유틸이다 — 프로덕션 코드에서 import 하지 않는다 (파일명에 test 를 넣어 드러낸다).
 * `*.test.ts` 가 아니라 vitest 가 테스트로 수집하지 않는다.
 */

/** 지정 long 옵션을 노출하는 명령 경로를 Commander 트리에서 모은다. */
export function collectOptionPaths(command: Command, long: string, parentPath = ""): string[] {
  const path = [parentPath, command.name()].filter(Boolean).join(" ");
  const ownPaths = command.options.some((option) => option.long === long) ? [path] : [];
  return ownPaths.concat(
    command.commands.flatMap((child) => collectOptionPaths(child, long, path)),
  );
}

/**
 * appkey 를 profile 로만 해석하는 서비스는 `--app-key` 를 노출하지 않아야 한다 (ADR-029·ADR-033).
 * 반환값이 빈 배열이 아니면 그 경로에 오버라이딩 옵션이 되살아났다는 뜻이다.
 */
export function collectAppKeyOptionPaths(command: Command): string[] {
  return collectOptionPaths(command, "--app-key");
}
