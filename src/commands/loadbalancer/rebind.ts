import type { LoadBalancerClient } from "../../services/loadbalancer/client.js";

export interface IpAclBindingSnapshot {
  loadbalancer_id: string;
  ipacl_group_ids: string[];
}

export interface IpAclRebindFailure extends IpAclBindingSnapshot {
  error: string;
  retry_argv: string[];
  retry_command: string;
}

export interface IpAclRebindResult {
  skipped: boolean;
  succeeded: IpAclBindingSnapshot[];
  failed: IpAclRebindFailure[];
}

export interface IpAclRetryContext {
  profile?: string;
  region?: string;
}

type SnapshotClient = Pick<LoadBalancerClient, "getLoadBalancer">;
type RebindClient = Pick<LoadBalancerClient, "bindIpAclGroups">;

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function contextArgv(context: IpAclRetryContext): string[] {
  return [
    ...(context.profile === undefined ? [] : ["--profile", context.profile]),
    ...(context.region === undefined ? [] : ["--region", context.region]),
  ];
}

export function retryArgv(
  snapshot: IpAclBindingSnapshot,
  context: IpAclRetryContext = {},
): string[] {
  if (snapshot.ipacl_group_ids.length === 0) {
    return [
      "nhncloud",
      "loadbalancer",
      "clear-ipacl",
      snapshot.loadbalancer_id,
      ...contextArgv(context),
      "--yes",
      "--json",
    ];
  }
  return [
    "nhncloud",
    "loadbalancer",
    "set-ipacl",
    snapshot.loadbalancer_id,
    ...snapshot.ipacl_group_ids.flatMap((id) => ["--group", id]),
    ...contextArgv(context),
    "--yes",
    "--json",
  ];
}

export function retryCommand(argv: string[]): string {
  return argv.map(shellQuote).join(" ");
}

export async function snapshotIpAclBindings(
  client: SnapshotClient,
  loadBalancerIds: string[],
): Promise<IpAclBindingSnapshot[]> {
  const uniqueIds = [...new Set(loadBalancerIds)].sort();
  const snapshots: IpAclBindingSnapshot[] = [];
  for (const loadBalancerId of uniqueIds) {
    const loadBalancer = await client.getLoadBalancer(loadBalancerId);
    snapshots.push({
      loadbalancer_id: loadBalancer.id,
      ipacl_group_ids: loadBalancer.ipacl_groups.map((group) => group.ipacl_group_id),
    });
  }
  return snapshots;
}

export async function rebindIpAclSnapshots(
  client: RebindClient,
  snapshots: IpAclBindingSnapshot[],
  retryContext: IpAclRetryContext = {},
): Promise<IpAclRebindResult> {
  const succeeded: IpAclBindingSnapshot[] = [];
  const failed: IpAclRebindFailure[] = [];
  for (const snapshot of snapshots) {
    try {
      await client.bindIpAclGroups(
        snapshot.loadbalancer_id,
        snapshot.ipacl_group_ids,
      );
      succeeded.push(snapshot);
    } catch (error) {
      const argv = retryArgv(snapshot, retryContext);
      failed.push({
        ...snapshot,
        error: error instanceof Error ? error.message : String(error),
        retry_argv: argv,
        retry_command: retryCommand(argv),
      });
    }
  }
  return { skipped: false, succeeded, failed };
}

export function skippedRebindResult(): IpAclRebindResult {
  return { skipped: true, succeeded: [], failed: [] };
}
