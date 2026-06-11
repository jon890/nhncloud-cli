import { resolveProfileName, getIaasCredential } from "../../config/credentials.js";
import { getIaasToken } from "../../api/keystone.js";
import { NetworkClient } from "../../services/network/client.js";

/**
 * profile 해석 → iaas 자격증명 로드 → region override → Keystone 토큰 교환 → NetworkClient 생성.
 * Keystone 토큰·endpoint 해석은 instance 와 공유한다 (새 토큰 발급 없음).
 * spinner 시작 *전* (파라미터 검증·자격증명 로드 단계) 에 호출한다.
 */
export async function resolveNetworkClient(opts: {
  profile?: string;
  region?: string;
}): Promise<{ client: NetworkClient; profileName: string }> {
  const profileName = await resolveProfileName(opts.profile);
  const iaas = await getIaasCredential(profileName);

  // --region flag 가 있으면 자격증명의 region 을 덮어쓴다 (instance 와 같은 방식)
  const effectiveIaas = opts.region ? { ...iaas, region: opts.region } : iaas;

  const { tokenId, networkEndpoint } = await getIaasToken(profileName, effectiveIaas);
  return { client: new NetworkClient(tokenId, networkEndpoint), profileName };
}
