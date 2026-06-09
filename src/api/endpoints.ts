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
 * region → instance(compute) API host 맵 (ADR-010, ADR-005).
 * 두 IaaS host 맵(compute·image)의 region key 집합은 서로 일치해야 한다.
 */
const INSTANCE_HOST: Record<string, string> = {
  kr1: "kr1-api-instance-infrastructure.nhncloudservice.com",
  kr2: "kr2-api-instance-infrastructure.nhncloudservice.com",
  kr3: "kr3-api-instance-infrastructure.nhncloudservice.com",
  jp1: "jp1-api-instance-infrastructure.nhncloudservice.com",
};

/**
 * region → image(Glance v2) API host 맵 (ADR-013, ADR-005 연장).
 * image 서비스는 compute 와 다른 host 지만 같은 Keystone 토큰을 재사용한다.
 * 두 IaaS host 맵(compute·image)의 region key 집합은 서로 일치해야 한다.
 * 실측 확정 (2026-06-09): kr1/kr2 를 Keystone serviceCatalog publicURL 로 확인.
 * kr3/jp1 은 같은 host 패턴으로 추가.
 * Glance v2 경로는 tenant segment 없음 — GET /v2/images → 200, /v2/{tenantId}/images → 404 (실측 확정).
 */
const IMAGE_HOST: Record<string, string> = {
  kr1: "kr1-api-image-infrastructure.nhncloudservice.com",
  kr2: "kr2-api-image-infrastructure.nhncloudservice.com",
  kr3: "kr3-api-image-infrastructure.nhncloudservice.com",
  jp1: "jp1-api-image-infrastructure.nhncloudservice.com",
};

/** IaaS region 목록 — compute·image 공통. region 추가 시 두 host 맵을 함께 갱신한다. */
const IAAS_REGIONS = Object.keys(INSTANCE_HOST).join(", ");

/**
 * region 에 해당하는 instance API host 를 반환한다.
 * 미등록 region 은 사용 가능한 region 목록 안내와 함께 EXIT_PARAM_ERROR 를 던진다.
 */
export function instanceHost(region: string): string {
  const host = INSTANCE_HOST[region];
  if (!host) {
    throw new NhnCloudCliError(
      `지원하지 않는 region 입니다: "${region}". 사용 가능한 region: ${IAAS_REGIONS}`,
      EXIT_PARAM_ERROR,
    );
  }
  return host;
}

/**
 * region 에 해당하는 image API host 를 반환한다.
 * 미등록 region 은 EXIT_PARAM_ERROR.
 */
export function imageHost(region: string): string {
  const host = IMAGE_HOST[region];
  if (!host) {
    throw new NhnCloudCliError(
      `지원하지 않는 region 입니다: "${region}". 사용 가능한 region: ${IAAS_REGIONS}`,
      EXIT_PARAM_ERROR,
    );
  }
  return host;
}
