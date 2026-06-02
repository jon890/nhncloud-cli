import { NhnCloudCliError } from "../utils/errors.js";
import { EXIT_API_ERROR, EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

/**
 * 서비스명 → 엔드포인트 맵 (일반/real 전용 — gov 제외, ADR-005).
 */
const ENDPOINTS: Record<string, string> = {
  logncrash: "https://api-lncs-search.nhncloudservice.com",
  deploy: "https://api-deploy.nhncloudservice.com",
};

/**
 * 서비스명에 해당하는 엔드포인트를 반환한다.
 * 미등록 서비스는 NhnCloudCliError 를 던진다.
 */
export function endpointFor(service: string): string {
  const endpoint = ENDPOINTS[service];
  if (!endpoint) {
    throw new NhnCloudCliError(
      `등록되지 않은 서비스입니다: "${service}". 지원 서비스: ${Object.keys(ENDPOINTS).join(", ")}`,
      EXIT_API_ERROR,
    );
  }
  return endpoint;
}

// ── Instance (OpenStack Nova v2 호환) ─────────────────────────────────────────

/**
 * Keystone v2 토큰 발급 엔드포인트 (ADR-010).
 */
export function keystoneIdentityUrl(): string {
  return "https://api-identity-infrastructure.nhncloudservice.com/v2.0/tokens";
}

/**
 * region → instance API host 맵 (ADR-010, ADR-005).
 */
const INSTANCE_HOST: Record<string, string> = {
  kr1: "kr1-api-instance-infrastructure.nhncloudservice.com",
  kr2: "kr2-api-instance-infrastructure.nhncloudservice.com",
  kr3: "kr3-api-instance-infrastructure.nhncloudservice.com",
  jp1: "jp1-api-instance-infrastructure.nhncloudservice.com",
};

/**
 * region 에 해당하는 instance API host 를 반환한다.
 * 미등록 region 은 사용 가능한 region 목록 안내와 함께 EXIT_PARAM_ERROR 를 던진다.
 */
export function instanceHost(region: string): string {
  const host = INSTANCE_HOST[region];
  if (!host) {
    throw new NhnCloudCliError(
      `지원하지 않는 region 입니다: "${region}". 사용 가능한 region: ${Object.keys(INSTANCE_HOST).join(", ")}`,
      EXIT_PARAM_ERROR,
    );
  }
  return host;
}
