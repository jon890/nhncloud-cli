import { resolveProfileName, getUserAccessKey } from "../../config/credentials.js";
import { getAccessToken } from "../../api/oauth.js";
import { DeployClient } from "../../services/deploy/client.js";

/**
 * profile 해석 → UAK 로드 → access_token 교환 → DeployClient 생성.
 * spinner 시작 *전* (파라미터 검증·자격증명 로드 단계) 에 호출한다.
 */
export async function createDeployClient(
  profileOpt?: string,
): Promise<{ client: DeployClient; profileName: string }> {
  const profileName = await resolveProfileName(profileOpt);
  const uak = await getUserAccessKey(profileName);
  const accessToken = await getAccessToken(profileName, uak.id, uak.secret);
  return { client: new DeployClient(accessToken), profileName };
}
