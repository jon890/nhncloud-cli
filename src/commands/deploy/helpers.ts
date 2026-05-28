import { resolveProfileName, getServiceCredential } from "../../config/credentials.js";
import { getAccessToken } from "../../api/oauth.js";
import { DeployClient } from "../../services/deploy/client.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_CONFIG_ERROR } from "../../utils/exit-codes.js";

/**
 * profile 해석 → UAK 로드 → access_token 교환 → DeployClient 생성.
 * spinner 시작 *전* (파라미터 검증·자격증명 로드 단계) 에 호출한다.
 */
export async function createDeployClient(
  profileOpt?: string,
): Promise<{ client: DeployClient; profileName: string }> {
  const profileName = await resolveProfileName(profileOpt);
  const cred = await getServiceCredential("deploy", profileName);

  if (!cred.uakId) {
    throw new NhnCloudCliError(
      `profile "${profileName}" 의 deploy 자격증명에 uakId 가 없습니다.\n` +
        `credentials.json 에 profiles.${profileName}.deploy.uakId 를 추가하세요.`,
      EXIT_CONFIG_ERROR,
    );
  }
  if (!cred.uakSecret) {
    throw new NhnCloudCliError(
      `profile "${profileName}" 의 deploy 자격증명에 uakSecret 이 없습니다.\n` +
        `credentials.json 에 profiles.${profileName}.deploy.uakSecret 를 추가하세요.`,
      EXIT_CONFIG_ERROR,
    );
  }

  const accessToken = await getAccessToken(profileName, cred.uakId, cred.uakSecret);
  return { client: new DeployClient(accessToken), profileName };
}
