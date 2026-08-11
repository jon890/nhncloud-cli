import { getAccessToken } from "../../api/oauth.js";
import {
  getServiceCredential,
  getUserAccessKey,
  resolveProfileName,
} from "../../config/credentials.js";
import { ApiGatewayClient } from "../../services/apigateway/client.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_CONFIG_ERROR } from "../../utils/exit-codes.js";

/** --app-key 옵션 > profile 의 apigateway.appkey 순서로 appKey를 해석한다. */
export async function resolveApiGatewayAppKey(
  profileName: string,
  appKeyOption?: string,
): Promise<string> {
  if (appKeyOption?.trim()) return appKeyOption.trim();

  let credential: { appkey?: string } | undefined;
  try {
    credential = await getServiceCredential("apigateway", profileName);
  } catch (err) {
    if (!(err instanceof NhnCloudCliError) || err.exitCode !== EXIT_CONFIG_ERROR) {
      throw err;
    }
  }

  if (!credential?.appkey) {
    throw new NhnCloudCliError(
      "API Gateway appKey가 없습니다. nhncloud configure --apigateway-appkey <key>로 설정하거나\n" +
        "--app-key로 직접 넘기세요.",
      EXIT_CONFIG_ERROR,
    );
  }
  return credential.appkey;
}

/** profile → 공통 UAK → OAuth token → appKey → API Gateway client 순서로 해석한다. */
export async function resolveApiGatewayClient(opts: {
  profile?: string;
  region?: string;
  appKey?: string;
}): Promise<{ client: ApiGatewayClient; profileName: string }> {
  const profileName = await resolveProfileName(opts.profile);
  const uak = await getUserAccessKey(profileName);
  const accessToken = await getAccessToken(profileName, uak.id, uak.secret);
  const appKey = await resolveApiGatewayAppKey(profileName, opts.appKey);
  return {
    client: new ApiGatewayClient(accessToken, opts.region ?? "kr1", appKey),
    profileName,
  };
}
