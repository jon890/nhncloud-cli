import { getIaasToken, type IaasTokenEndpoints } from "../api/keystone.js";
import { getIaasCredential, resolveProfileName } from "../config/credentials.js";

export interface IaasResolverOpts {
  profile?: string;
  region?: string;
}

export type IaasTokenContext = {
  profileName: string;
} & IaasTokenEndpoints;

export async function resolveIaasTokenContext(
  opts: IaasResolverOpts,
): Promise<IaasTokenContext> {
  const profileName = await resolveProfileName(opts.profile);
  const iaas = await getIaasCredential(profileName);
  const effectiveIaas = opts.region ? { ...iaas, region: opts.region } : iaas;

  const tokenContext = await getIaasToken(profileName, effectiveIaas);
  return { profileName, ...tokenContext };
}
