import { readFile } from "node:fs/promises";
import { getIaasToken } from "../../api/keystone.js";
import { getIaasCredential, resolveProfileName } from "../../config/credentials.js";
import { NksClient } from "../../services/nks/client.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

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

export async function readJsonFile(path: string): Promise<Record<string, unknown>> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new NhnCloudCliError(`JSON 파일을 읽을 수 없습니다: ${path} (${message})`, EXIT_PARAM_ERROR);
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("top-level JSON object required");
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new NhnCloudCliError(`JSON 파일 형식이 올바르지 않습니다: ${path} (${message})`, EXIT_PARAM_ERROR);
  }
}

export function parsePositiveInteger(value: string, optionName: string): number {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new NhnCloudCliError(`${optionName} 는 양의 정수여야 합니다: ${JSON.stringify(value)}`, EXIT_PARAM_ERROR);
  }
  return Number(value);
}
