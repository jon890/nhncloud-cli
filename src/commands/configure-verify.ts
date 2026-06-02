import { getAccessToken } from "../api/oauth.js";
import { getIaasToken } from "../api/keystone.js";
import { LogncrashClient } from "../services/logncrash/client.js";
import { NhnCloudCliError } from "../utils/errors.js";
import { EXIT_AUTH_ERROR } from "../utils/exit-codes.js";
import type { UserAccessKey, ServiceCredential, IaasCredential } from "../config/types.js";

/**
 * UAK 로 OAuth 토큰 발급을 시도해 유효성을 검증한다.
 *
 * - 성공: true
 * - 401/403 인증 실패: false
 * - 그 외 네트워크 에러 등: throw (검증 자체 불가)
 *
 * 캐시를 반드시 우회한다 (forceRefresh=true).
 * configure 재실행 시 틀린 UAK 가 캐시 히트로 false-positive 통과하는 버그를 방지.
 */
export async function verifyUserAccessKey(uak: UserAccessKey): Promise<boolean> {
  try {
    // profile 키는 임시 값 — 캐시 우회(forceRefresh=true)이므로 캐시에 저장되지 않음
    await getAccessToken("__verify__", uak.id, uak.secret, true);
    return true;
  } catch (err) {
    if (err instanceof NhnCloudCliError && err.exitCode === EXIT_AUTH_ERROR) {
      return false;
    }
    throw err;
  }
}

/**
 * iaas 자격증명으로 Keystone 토큰 발급을 시도해 유효성을 검증한다.
 *
 * - 성공: true
 * - 401/403 인증 실패: false
 * - 그 외 에러: throw
 *
 * forceRefresh=true 로 캐시를 반드시 우회한다.
 * "__verify__" profile 로 호출해도 junk 캐시 파일이 디스크에 남지 않는다.
 */
export async function verifyIaas(iaas: IaasCredential): Promise<boolean> {
  try {
    await getIaasToken("__verify__", iaas, true);
    return true;
  } catch (err) {
    if (err instanceof NhnCloudCliError && err.exitCode === EXIT_AUTH_ERROR) {
      return false;
    }
    throw err;
  }
}

/**
 * logncrash appkey/secret 으로 짧은 범위 검색을 시도해 유효성을 검증한다.
 *
 * - 성공 또는 빈 결과: true
 * - 401/403 인증 실패: false
 * - 그 외 에러: throw
 */
export async function verifyLogncrash(cred: ServiceCredential): Promise<boolean> {
  if (!cred.appkey || !cred.secret) return false;

  const client = new LogncrashClient(cred.appkey, cred.secret);
  const now = new Date();
  const oneMinuteAgo = new Date(now.getTime() - 60_000);

  try {
    await client.search({
      query: "*",
      from: oneMinuteAgo.toISOString(),
      to: now.toISOString(),
      pageNumber: 0,
      pageSize: 1,
    });
    return true;
  } catch (err) {
    if (err instanceof NhnCloudCliError && err.exitCode === EXIT_AUTH_ERROR) {
      return false;
    }
    throw err;
  }
}
