import { resolveProfileName, getUserAccessKey, getServiceCredential } from "../../config/credentials.js";
import { getAccessToken } from "../../api/oauth.js";
import { NcsClient } from "../../services/ncs/client.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_CONFIG_ERROR } from "../../utils/exit-codes.js";

/**
 * NCS appKey 를 해석한다.
 * 우선순위: --app-key 옵션 > profile 의 ncs.appkey.
 * 둘 다 없으면 EXIT_CONFIG_ERROR + 설정 안내(2-4 회피 — 빈문자열 fallback 금지).
 *
 * 안내 문구 주의: `configure` 마법사는 아직 ncs 를 지원하지 않는다(src/commands/configure.ts 에
 * ncs 블록 없음). 존재하지 않는 `--ncs-appkey` 플래그를 안내하지 않는다 — --app-key 옵션 또는
 * ~/.nhncloud/credentials.json 의 profiles.<profile>.ncs.appkey 수기 편집을 안내한다.
 */
export async function resolveNcsAppKey(
  profileName: string,
  appKeyOpt?: string,
): Promise<string> {
  if (appKeyOpt) return appKeyOpt;

  // profile 의 ncs 블록에서 appkey 조회.
  // ncs 블록 부재(EXIT_CONFIG_ERROR)만 친절한 안내로 변환하고,
  // profile 자체 부재·credentials.json 파싱 오류 등은 원인을 보존해 rethrow.
  let cred: { appkey?: string; secret?: string } | undefined;
  try {
    cred = await getServiceCredential("ncs", profileName);
  } catch (err) {
    if (!(err instanceof NhnCloudCliError) || err.exitCode !== EXIT_CONFIG_ERROR) {
      throw err;
    }
  }

  if (!cred?.appkey) {
    throw new NhnCloudCliError(
      "NCS appKey 가 없습니다. --app-key 옵션으로 지정하거나\n" +
        "~/.nhncloud/credentials.json 의 profiles.<profile>.ncs.appkey 를 직접 추가하세요.\n" +
        "(nhncloud configure 는 아직 ncs 를 지원하지 않습니다.)",
      EXIT_CONFIG_ERROR,
    );
  }

  return cred.appkey;
}

/**
 * profile 해석 → 공통 UAK 로드 → Deploy OAuth 토큰(profile 캐시 재사용) 발급 → appKey 해석 → NcsClient 생성.
 * spinner 시작 *전* (파라미터 검증·자격증명 로드 단계) 에 호출한다.
 */
export async function resolveNcsClient(opts: {
  profile?: string;
  region?: string;
  appKey?: string;
}): Promise<{ client: NcsClient; profileName: string }> {
  const profileName = await resolveProfileName(opts.profile);
  const uak = await getUserAccessKey(profileName);
  const accessToken = await getAccessToken(profileName, uak.id, uak.secret);
  const appKey = await resolveNcsAppKey(profileName, opts.appKey);
  const region = opts.region ?? "kr1";
  return { client: new NcsClient(accessToken, region, appKey), profileName };
}
