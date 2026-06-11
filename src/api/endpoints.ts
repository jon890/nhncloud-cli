import { NhnCloudCliError } from "../utils/errors.js";
import { EXIT_API_ERROR, EXIT_PARAM_ERROR } from "../utils/exit-codes.js";

/**
 * 서비스명 → 엔드포인트 맵 (일반/real 전용 — gov 제외, ADR-005).
 */
const ENDPOINTS: Record<string, string> = {
  logncrash: "https://api-lncs-search.nhncloudservice.com",
  "logncrash-collector": "https://api-logncrash.nhncloudservice.com",
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
 * compute·image·network 세 IaaS host 맵의 region key 집합은 서로 일치해야 한다.
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
 * compute·image·network 세 IaaS host 맵의 region key 집합은 서로 일치해야 한다.
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

/**
 * region → network(NHN VPC) API host 맵 (ADR-013, ADR-005 연장).
 * network 서비스는 compute·image 와 다른 host 지만 같은 Keystone 토큰을 재사용한다.
 * NHN VPC 는 raw Neutron(/v2.0/networks)이 아니라 NHN 고유 /v2.0/vpcs·/v2.0/vpcsubnets 다.
 * compute·image·network 세 IaaS host 맵의 region key 집합은 서로 일치해야 한다.
 * 실측 확정 (2026-06-11): kr1/kr2 를 Keystone serviceCatalog publicURL 로 확인 (neutron 서비스).
 * kr3/jp1 은 같은 host 패턴으로 추가.
 * NHN VPC 경로는 tenant segment 없음 — GET /v2.0/vpcs → 200 (실측 확정).
 */
const NETWORK_HOST: Record<string, string> = {
  kr1: "kr1-api-network-infrastructure.nhncloudservice.com",
  kr2: "kr2-api-network-infrastructure.nhncloudservice.com",
  kr3: "kr3-api-network-infrastructure.nhncloudservice.com",
  jp1: "jp1-api-network-infrastructure.nhncloudservice.com",
};

/**
 * region → Block Storage(Cinder volumev2) API host 맵 (ADR-013, ADR-005 연장).
 * block storage 는 compute 와 다른 host 지만 같은 Keystone 토큰을 재사용한다.
 * 경로는 compute 와 동일하게 /v2/{tenantId}/... 형태(tenant 포함) — image(Glance)와 다르다.
 * docs 확정, 첫 호출 200 으로 확인 예정 (1-27): host 패턴은 NHN Cloud docs 기준 추론.
 * region key 집합은 INSTANCE_HOST(및 IMAGE/NETWORK_HOST)와 일치해야 한다 (모두 IaaS region).
 */
const BLOCKSTORAGE_HOST: Record<string, string> = {
  kr1: "kr1-api-block-storage-infrastructure.nhncloudservice.com",
  kr2: "kr2-api-block-storage-infrastructure.nhncloudservice.com",
  kr3: "kr3-api-block-storage-infrastructure.nhncloudservice.com",
  jp1: "jp1-api-block-storage-infrastructure.nhncloudservice.com",
};

/** IaaS region 목록 — compute·image·network·blockstorage 공통. region 추가 시 네 host 맵을 함께 갱신한다. */
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

/**
 * region 에 해당하는 network API host 를 반환한다.
 * 미등록 region 은 EXIT_PARAM_ERROR.
 */
export function networkHost(region: string): string {
  const host = NETWORK_HOST[region];
  if (!host) {
    throw new NhnCloudCliError(
      `지원하지 않는 region 입니다: "${region}". 사용 가능한 region: ${IAAS_REGIONS}`,
      EXIT_PARAM_ERROR,
    );
  }
  return host;
}

/**
 * region 에 해당하는 Block Storage API host 를 반환한다.
 * 미등록 region 은 EXIT_PARAM_ERROR.
 */
export function blockStorageHost(region: string): string {
  const host = BLOCKSTORAGE_HOST[region];
  if (!host) {
    throw new NhnCloudCliError(
      `지원하지 않는 region 입니다: "${region}". 사용 가능한 region: ${IAAS_REGIONS}`,
      EXIT_PARAM_ERROR,
    );
  }
  return host;
}
