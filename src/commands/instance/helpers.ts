import { resolveProfileName, getIaasCredential } from "../../config/credentials.js";
import { getIaasToken } from "../../api/keystone.js";
import { InstanceClient } from "../../services/instance/client.js";

/**
 * profile 해석 → iaas 자격증명 로드 → region override → Keystone 토큰 교환 → InstanceClient 생성.
 * spinner 시작 *전* (파라미터 검증·자격증명 로드 단계) 에 호출한다.
 */
export async function resolveInstanceClient(opts: {
  profile?: string;
  region?: string;
}): Promise<{ client: InstanceClient; profileName: string }> {
  const profileName = await resolveProfileName(opts.profile);
  const iaas = await getIaasCredential(profileName);

  // --region flag 가 있으면 자격증명의 region 을 덮어쓴다
  const effectiveIaas = opts.region ? { ...iaas, region: opts.region } : iaas;

  const { tokenId, computeEndpoint, imageEndpoint } = await getIaasToken(profileName, effectiveIaas);
  return { client: new InstanceClient(tokenId, computeEndpoint, imageEndpoint), profileName };
}
