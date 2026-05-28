import { NhnCloudCliError } from "../utils/errors.js";
import { EXIT_API_ERROR } from "../utils/exit-codes.js";

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
