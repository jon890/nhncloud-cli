import { getIaasToken } from "../../api/keystone.js";
import { getIaasCredential, resolveProfileName } from "../../config/credentials.js";
import { NksClient } from "../../services/nks/client.js";

/**
 * profile 해석 → iaas 자격증명 로드 → region override → Keystone 토큰 교환 → NksClient 생성.
 * spinner 시작 *전* (파라미터 검증·자격증명 로드 단계) 에 호출한다.
 */
export async function resolveNksClient(opts: {
  profile?: string;
  region?: string;
}): Promise<{ client: NksClient; profileName: string }> {
  const profileName = await resolveProfileName(opts.profile);
  const iaas = await getIaasCredential(profileName);

  const effectiveIaas = opts.region ? { ...iaas, region: opts.region } : iaas;

  const { tokenId, nksEndpoint } = await getIaasToken(profileName, effectiveIaas);
  return { client: new NksClient(tokenId, nksEndpoint), profileName };
}
