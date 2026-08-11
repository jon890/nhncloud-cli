import { readFile } from "node:fs/promises";
import { resolveIaasTokenContext, type IaasResolverOpts } from "../iaas.js";
import { NksClient } from "../../services/nks/client.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_API_ERROR, EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

/**
 * profile 해석 → iaas 자격증명 로드 → region override → Keystone 토큰 교환 → NksClient 생성.
 * spinner 시작 *전* (파라미터 검증·자격증명 로드 단계) 에 호출한다.
 */
export async function resolveNksClient(
  opts: IaasResolverOpts,
): Promise<{ client: NksClient; profileName: string }> {
  const { profileName, tokenId, nksEndpoint } = await resolveIaasTokenContext(opts);
  return { client: new NksClient(tokenId, nksEndpoint), profileName };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * 클러스터 이름을 UUID 로 바꾼다.
 *
 * 대부분의 NKS 엔드포인트는 이름과 UUID 를 모두 받지만 이벤트 엔드포인트는 UUID 만 받는다.
 * 이름을 그대로 넘기면 `unable to convert to uuid` 400 이 나서, 사용자는 자기 입력이
 * 잘못됐다고 오해한다 (이슈 #79). 다른 명령과 인수 규약을 맞추려고 CLI 가 대신 해석한다.
 *
 * 이미 UUID 형식이면 추가 호출 없이 그대로 돌려준다.
 */
export async function resolveClusterUuid(client: NksClient, cluster: string): Promise<string> {
  if (isUuid(cluster)) return cluster;

  const detail = await client.getCluster(cluster);
  const uuid = detail.uuid;
  if (typeof uuid !== "string" || uuid === "") {
    throw new NhnCloudCliError(
      `클러스터 "${cluster}" 의 UUID 를 확인할 수 없습니다 — 응답에 uuid 필드가 없습니다.`,
      EXIT_API_ERROR,
    );
  }
  return uuid;
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

export async function readTextFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf-8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new NhnCloudCliError(`파일을 읽을 수 없습니다: ${path} (${message})`, EXIT_PARAM_ERROR);
  }
}

export function parsePositiveInteger(value: string, optionName: string): number {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new NhnCloudCliError(`${optionName} 는 양의 정수여야 합니다: ${JSON.stringify(value)}`, EXIT_PARAM_ERROR);
  }
  return Number(value);
}

export function parseNonNegativeInteger(value: string, optionName: string): number {
  if (!/^\d+$/.test(value)) {
    throw new NhnCloudCliError(`${optionName} 는 0 이상의 정수여야 합니다: ${JSON.stringify(value)}`, EXIT_PARAM_ERROR);
  }
  return Number(value);
}
