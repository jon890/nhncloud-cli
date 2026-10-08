import type { Command } from "commander";

/** 완성된 Commander 트리 전체에서 하위 명령 도움말이 루트 전역 옵션을 보여 주게 한다. */
export function configureGlobalOptionsHelp(root: Command): void {
  root.configureHelp({ showGlobalOptions: true });
  for (const child of root.commands) {
    configureGlobalOptionsHelp(child);
  }
}
