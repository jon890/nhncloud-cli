import { HTTPError } from "ky";
import { NhnCloudCliError } from "../utils/errors.js";
import { EXIT_API_ERROR, EXIT_AUTH_ERROR } from "../utils/exit-codes.js";

/**
 * ky HTTPError 또는 일반 Error 를 NhnCloudCliError 로 변환한다.
 * - 401/403 → EXIT_AUTH_ERROR
 * - 그 외 4xx/5xx → EXIT_API_ERROR
 * - HTTPError 가 아닌 raw Error → EXIT_API_ERROR 로 wrap
 */
export function toNhnCloudCliError(err: unknown): NhnCloudCliError {
  if (err instanceof NhnCloudCliError) {
    return err;
  }

  if (err instanceof HTTPError) {
    const status = err.response.status;
    const exitCode = status === 401 || status === 403 ? EXIT_AUTH_ERROR : EXIT_API_ERROR;
    return new NhnCloudCliError(
      `API 호출 실패 (${status}): ${err.message}`,
      exitCode,
    );
  }

  if (err instanceof Error) {
    return new NhnCloudCliError(err.message, EXIT_API_ERROR);
  }

  return new NhnCloudCliError(String(err), EXIT_API_ERROR);
}
