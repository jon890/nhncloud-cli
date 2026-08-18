import {
  resolveProfileName,
  getUserAccessKey,
  getServiceCredential,
} from "../../config/credentials.js";
import { getAccessToken } from "../../api/oauth.js";
import { DeployClient } from "../../services/deploy/client.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_CONFIG_ERROR, EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

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

/**
 * profile 의 deploy.appkey 에서 appKey 를 해석한다.
 * 없으면 EXIT_CONFIG_ERROR + 설정 안내 (빈문자열 fallback 금지).
 *
 * profileName 은 `createDeployClient` 의 반환값을 그대로 넘긴다 —
 * 여기서 다시 `resolveProfileName` 을 부르면 두 해석이 갈릴 수 있다.
 */
export async function resolveDeployAppKey(profileName: string): Promise<string> {
  // getServiceCredential 의 EXIT_CONFIG_ERROR 만 친절한 안내로 변환하고 나머지는 원인을 보존해 rethrow.
  // 그 코드에는 셋이 함께 들어온다 — deploy 블록 부재, profile 자체 부재, credentials.json 파싱 오류.
  // 뒤의 둘도 가리지 않는다. 다만 8개 명령 모두 바로 앞 줄이 createDeployClient 이고
  // 그 안의 getUserAccessKey 가 같은 둘을 먼저 던지므로 실제로 가려지지 않는다.
  // 앞 줄 호출 순서에 안전성이 의존하는 구조라, 네 서비스 공용 리졸버 추출 때 함께 정리한다.
  let cred: { appkey?: string; secret?: string } | undefined;
  try {
    cred = await getServiceCredential("deploy", profileName);
  } catch (err) {
    if (!(err instanceof NhnCloudCliError) || err.exitCode !== EXIT_CONFIG_ERROR) {
      throw err;
    }
  }

  if (!cred?.appkey) {
    throw new NhnCloudCliError(
      "Deploy appKey 가 없습니다.\n" +
        "nhncloud configure --deploy-appkey <key> 를 실행해 설정하세요.",
      EXIT_CONFIG_ERROR,
    );
  }

  return cred.appkey;
}

/**
 * 필수 좌표 옵션이 비어 있으면 입력 오류로 거부한다 (ADR-033).
 * spinner 시작·네트워크 호출 *전* 에 호출한다 — 빈 값으로 API 를 부르면
 * 서버 오류로 나타나 원인을 찾기 어렵다.
 */
export function requireCoordinate(value: string | undefined, flag: string): string {
  if (!value) {
    throw new NhnCloudCliError(`${flag} 가 필요합니다.`, EXIT_PARAM_ERROR);
  }
  return value;
}
