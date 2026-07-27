import { resolveIaasTokenContext, type IaasResolverOpts } from "../iaas.js";
import { LoadBalancerClient } from "../../services/loadbalancer/client.js";
import type {
  IpAclAction,
  IpAclGroup,
  LoadBalancer,
} from "../../services/loadbalancer/types.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

type LoadBalancerResolverClient = Pick<
  LoadBalancerClient,
  "listLoadBalancers" | "listIpAclGroups"
>;

export function requireResourceInput(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new NhnCloudCliError(`${label} 이름 또는 UUID가 필요합니다.`, EXIT_PARAM_ERROR);
  }
  return normalized;
}

export function optionalTrimmed(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return value.trim();
}

export function requireYes(yes: boolean | undefined, operation: string): true {
  if (!yes) {
    throw new NhnCloudCliError(
      `${operation}에는 --yes 플래그가 필요합니다.`,
      EXIT_PARAM_ERROR,
    );
  }
  return true;
}

export function parseIpAclAction(value: string): IpAclAction {
  if (value !== "ALLOW" && value !== "DENY") {
    throw new NhnCloudCliError(
      `--action은 ALLOW 또는 DENY여야 합니다: ${JSON.stringify(value)}`,
      EXIT_PARAM_ERROR,
    );
  }
  return value;
}

export function collectOption(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

export function requireResourceInputs(values: string[], label: string): string[] {
  if (values.length === 0) {
    throw new NhnCloudCliError(`${label}을(를) 한 개 이상 지정해야 합니다.`, EXIT_PARAM_ERROR);
  }
  return values.map((value) => requireResourceInput(value, label));
}

function resolvedId(resource: { id: string }, label: string): string {
  const id = resource.id.trim();
  if (!id) {
    throw new NhnCloudCliError(`${label} 조회 결과의 UUID가 비어 있습니다.`, EXIT_PARAM_ERROR);
  }
  return id;
}

function resolveFromList<T extends { id: string; name: string }>(
  resources: T[],
  input: string,
  label: string,
): string {
  const exactId = resources.find((resource) => resource.id === input);
  if (exactId) return resolvedId(exactId, label);

  const nameMatches = resources.filter((resource) => resource.name === input);
  if (nameMatches.length === 1) return resolvedId(nameMatches[0], label);
  if (nameMatches.length === 0) {
    throw new NhnCloudCliError(
      `${label}을(를) 찾을 수 없습니다: ${JSON.stringify(input)}`,
      EXIT_PARAM_ERROR,
    );
  }

  const candidateIds = nameMatches.map((resource) => resolvedId(resource, label)).sort();
  throw new NhnCloudCliError(
    `${label} 이름이 중복됩니다: ${JSON.stringify(input)} (후보 UUID: ${candidateIds.join(", ")})`,
    EXIT_PARAM_ERROR,
  );
}

export async function resolveLoadBalancerId(
  client: Pick<LoadBalancerResolverClient, "listLoadBalancers">,
  value: string,
): Promise<string> {
  const input = requireResourceInput(value, "Load Balancer");
  const resources: LoadBalancer[] = await client.listLoadBalancers();
  return resolveFromList(resources, input, "Load Balancer");
}

export async function resolveIpAclGroupId(
  client: Pick<LoadBalancerResolverClient, "listIpAclGroups">,
  value: string,
): Promise<string> {
  const input = requireResourceInput(value, "IP ACL 그룹");
  const resources: IpAclGroup[] = await client.listIpAclGroups();
  return resolveFromList(resources, input, "IP ACL 그룹");
}

export async function resolveIpAclGroups(
  client: Pick<LoadBalancerResolverClient, "listIpAclGroups">,
  values: string[],
): Promise<IpAclGroup[]> {
  const inputs = requireResourceInputs(values, "IP ACL 그룹");
  const resources = await client.listIpAclGroups();
  return inputs.map((input) => {
    const id = resolveFromList(resources, input, "IP ACL 그룹");
    const group = resources.find((resource) => resource.id === id);
    if (!group) {
      throw new NhnCloudCliError(
        `IP ACL 그룹 조회 결과에서 UUID를 찾을 수 없습니다: ${JSON.stringify(id)}`,
        EXIT_PARAM_ERROR,
      );
    }
    return group;
  });
}

export async function resolveLoadBalancerClient(
  opts: IaasResolverOpts,
): Promise<{ client: LoadBalancerClient; profileName: string }> {
  const { profileName, tokenId, networkEndpoint } = await resolveIaasTokenContext(opts);
  return {
    client: new LoadBalancerClient(tokenId, networkEndpoint),
    profileName,
  };
}
