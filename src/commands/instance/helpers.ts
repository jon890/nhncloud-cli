import { resolveIaasTokenContext, type IaasResolverOpts } from "../iaas.js";
import { InstanceClient } from "../../services/instance/client.js";

/**
 * profile 해석 → iaas 자격증명 로드 → region override → Keystone 토큰 교환 → InstanceClient 생성.
 * spinner 시작 *전* (파라미터 검증·자격증명 로드 단계) 에 호출한다.
 */
export async function resolveInstanceClient(
  opts: IaasResolverOpts,
): Promise<{ client: InstanceClient; profileName: string }> {
  const { profileName, tokenId, computeEndpoint, imageEndpoint } = await resolveIaasTokenContext(opts);
  return { client: new InstanceClient(tokenId, computeEndpoint, imageEndpoint), profileName };
}
