import { getIaasToken } from "../api/keystone.js";
import { getIaasCredential, resolveProfileName } from "../config/credentials.js";

export interface IaasResolverOpts {
  profile?: string;
  region?: string;
}

export interface IaasTokenContext {
  profileName: string;
  tokenId: string;
  computeEndpoint: string;
  imageEndpoint: string;
  networkEndpoint: string;
  blockStorageEndpoint: string;
  nksEndpoint: string;
}

export async function resolveIaasTokenContext(
  opts: IaasResolverOpts,
): Promise<IaasTokenContext> {
  const profileName = await resolveProfileName(opts.profile);
  const iaas = await getIaasCredential(profileName);
  const effectiveIaas = opts.region ? { ...iaas, region: opts.region } : iaas;

  const tokenContext = await getIaasToken(profileName, effectiveIaas);
  return { profileName, ...tokenContext };
}
