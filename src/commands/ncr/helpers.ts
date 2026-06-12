import { resolveProfileName, getUserAccessKey, getServiceCredential } from "../../config/credentials.js";
import { NcrClient } from "../../services/ncr/client.js";
import { HarborClient } from "../../services/ncr/harbor-client.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_CONFIG_ERROR, EXIT_API_ERROR } from "../../utils/exit-codes.js";

/**
 * profile 해석 → 공통 UAK 로드 → NcrClient 생성.
 * spinner 시작 *전* (파라미터 검증·자격증명 로드 단계) 에 호출한다.
 */
export async function createNcrClient(opts: {
  profile?: string;
  region?: string;
}): Promise<{ client: NcrClient; profileName: string }> {
  const profileName = await resolveProfileName(opts.profile);
  const uak = await getUserAccessKey(profileName);
  const region = opts.region ?? "kr1";
  return { client: new NcrClient(uak.id, uak.secret, region), profileName };
}

/**
 * NCR appKey 를 해석한다.
 * 우선순위: --app-key 옵션 > profile 의 ncr.appkey.
 * 둘 다 없으면 EXIT_CONFIG_ERROR + 설정 안내 (2-4 회피 — 빈문자열 fallback 금지).
 */
export async function resolveAppKey(
  profileName: string,
  appKeyOpt?: string,
): Promise<string> {
  if (appKeyOpt) return appKeyOpt;

  // profile 의 ncr 블록에서 appkey 조회.
  // ncr 블록 부재(EXIT_CONFIG_ERROR)만 친절한 안내로 변환하고,
  // profile 자체 부재·credentials.json 파싱 오류 등은 원인을 보존해 rethrow.
  let cred: { appkey?: string; secret?: string } | undefined;
  try {
    cred = await getServiceCredential("ncr", profileName);
  } catch (err) {
    if (!(err instanceof NhnCloudCliError) || err.exitCode !== EXIT_CONFIG_ERROR) {
      throw err;
    }
  }

  if (!cred?.appkey) {
    throw new NhnCloudCliError(
      "NCR appKey 가 없습니다. --app-key 옵션으로 지정하거나\n" +
        "nhncloud configure --ncr-appkey <key> 를 실행해 설정하세요.",
      EXIT_CONFIG_ERROR,
    );
  }

  return cred.appkey;
}

/**
 * registry 이름으로 데이터플레인 HarborClient 를 생성한다.
 *
 * 내부에서 ncr get(Management API)으로 registry.uri 를 조회한 뒤
 * host 를 추출해 HarborClient 를 생성한다 — spinner 시작 *전* 에 호출한다.
 */
export async function createHarborClient(
  opts: { profile?: string; region?: string; appKey?: string },
  registryArg: string,
): Promise<{ harbor: HarborClient; project: string }> {
  const { client: ncrClient, profileName } = await createNcrClient(opts);
  const appKey = await resolveAppKey(profileName, opts.appKey);
  const uak = await getUserAccessKey(profileName);
  const reg = await ncrClient.getRegistry(appKey, registryArg);
  const host = parseHarborHost(reg.uri);
  const project = typeof reg.name === "string" ? reg.name : registryArg;
  return { harbor: new HarborClient(uak.id, uak.secret, host), project };
}

/**
 * registry.uri 에서 데이터플레인 host 를 추출한다.
 * uri 는 "{host}/{registryName}" 형태(scheme 유무 무관) — 첫 '/' 앞이 host.
 * 단위테스트 대상이라 export 한다.
 */
export function parseHarborHost(uri?: string | null): string {
  if (!uri) {
    throw new NhnCloudCliError(
      "레지스트리 uri 가 없어 이미지 host 를 해석할 수 없습니다.",
      EXIT_API_ERROR,
    );
  }
  const noScheme = uri.replace(/^https?:\/\//, "");
  const host = noScheme.split("/")[0];
  if (!host) {
    throw new NhnCloudCliError(
      "레지스트리 uri 형식 오류 — host 추출 실패.",
      EXIT_API_ERROR,
    );
  }
  return host;
}
