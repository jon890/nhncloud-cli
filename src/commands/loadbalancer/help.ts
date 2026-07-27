import type { Command } from "commander";

export function configureLoadBalancerHelp(command: Command): void {
  command.configureHelp({ showGlobalOptions: true });
  for (const child of command.commands) {
    configureLoadBalancerHelp(child);
  }
}
