import { readFile, stat } from "node:fs/promises";
import { getAccessToken } from "../../api/oauth.js";
import {
  getServiceCredential,
  getUserAccessKey,
  resolveProfileName,
} from "../../config/credentials.js";
import { ApiGatewayClient } from "../../services/apigateway/client.js";
import type { Resource } from "../../services/apigateway/types.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_CONFIG_ERROR, EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

const MAX_JSON_PAYLOAD_BYTES = 1_000_000;

/** 외부 API 문자열의 ANSI escape와 제어 문자를 터미널 출력 전에 치환한다. */
export function sanitizeForTerminal(value: string): string {
  return value.replace(/[\x00-\x1F\x7F]/g, "?");
}

function fileErrorReason(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = error.code;
    if (typeof code === "string") return code;
  }
  return error instanceof Error ? error.message : String(error);
}

export function requireYes(yes: boolean | undefined, operation: string): true {
  if (!yes) {
    throw new NhnCloudCliError(
      `${operation}에는 --yes 플래그가 필요합니다.`,
      EXIT_PARAM_ERROR,
    );
  }
  return true;
}

/** 플러그인 설정 JSON을 검증 전 unknown 값으로 읽는다. */
export async function readPluginConfigFile(path: string): Promise<unknown> {
  let fileStat: Awaited<ReturnType<typeof stat>>;
  try {
    fileStat = await stat(path);
  } catch (error) {
    const reason = fileErrorReason(error);
    throw new NhnCloudCliError(
      `플러그인 설정 파일을 읽을 수 없습니다: ${JSON.stringify(path)} (${JSON.stringify(reason)}).`,
      EXIT_PARAM_ERROR,
    );
  }

  if (!fileStat.isFile()) {
    const reason = fileStat.isDirectory() ? "EISDIR" : "EINVAL";
    throw new NhnCloudCliError(
      `플러그인 설정 경로가 일반 파일이 아닙니다: ${JSON.stringify(path)} (${reason}).`,
      EXIT_PARAM_ERROR,
    );
  }
  if (fileStat.size > MAX_JSON_PAYLOAD_BYTES) {
    throw new NhnCloudCliError(
      `플러그인 설정 파일이 너무 큽니다 (${fileStat.size} 바이트). JSON spec 한도 ${MAX_JSON_PAYLOAD_BYTES} 바이트.`,
      EXIT_PARAM_ERROR,
    );
  }

  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (error) {
    const reason = fileErrorReason(error);
    throw new NhnCloudCliError(
      `플러그인 설정 파일을 읽을 수 없습니다: ${JSON.stringify(path)} (${JSON.stringify(reason)}).`,
      EXIT_PARAM_ERROR,
    );
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    const reason = sanitizeForTerminal(
      error instanceof Error ? error.message : String(error),
    );
    throw new NhnCloudCliError(
      `플러그인 설정 JSON 형식이 올바르지 않습니다: ${JSON.stringify(path)} (${reason}).`,
      EXIT_PARAM_ERROR,
    );
  }
}

/** 대상 경로와 구분자 기준 하위 경로를 dry-run 영향 범위로 모은다. */
export function collectAffectedPaths(resources: Resource[], targetPath: string): Resource[] {
  if (targetPath === "/") return resources;
  const childPrefix = `${targetPath}/`;
  return resources.filter(
    (resource) => resource.path === targetPath || resource.path.startsWith(childPrefix),
  );
}

/** profile 의 apigateway.appkey에서 appKey를 해석한다. */
export async function resolveApiGatewayAppKey(profileName: string): Promise<string> {
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
      "API Gateway appKey가 없습니다. nhncloud configure --apigateway-appkey <key>로 설정하세요.",
      EXIT_CONFIG_ERROR,
    );
  }
  return credential.appkey;
}

/** profile → 공통 UAK → OAuth token → appKey → API Gateway client 순서로 해석한다. */
export async function resolveApiGatewayClient(opts: {
  profile?: string;
  region?: string;
}): Promise<{ client: ApiGatewayClient; profileName: string }> {
  const profileName = await resolveProfileName(opts.profile);
  const uak = await getUserAccessKey(profileName);
  const accessToken = await getAccessToken(profileName, uak.id, uak.secret);
  const appKey = await resolveApiGatewayAppKey(profileName);
  return {
    client: new ApiGatewayClient(accessToken, opts.region ?? "kr1", appKey),
    profileName,
  };
}
