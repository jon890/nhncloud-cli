import { HTTPError } from "ky";
import { NhnEnvelopeError } from "../../api/envelope.js";
import { toNhnCloudCliError } from "../../api/httpError.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_API_ERROR } from "../../utils/exit-codes.js";
import { sanitizeForTerminal } from "../../utils/terminal.js";

/** 조회 횟수 제한의 봉투 resultCode. 공식 v3 명세가 정의한 값이다 (ADR-032). */
const RATE_LIMIT_RESULT_CODE = 429;

/**
 * 조회 횟수 제한 여부를 봉투 resultCode 로 판정한다 (ADR-032).
 * 서버가 HTTP 200 으로 응답하므로 상태 코드로는 걸러지지 않는다.
 * resultCode 는 서비스마다 number 와 string 이 섞이므로 Number 로 맞춰 비교한다 (ADR-006).
 */
export function isRateLimitError(err: unknown): err is NhnEnvelopeError {
  return (
    err instanceof NhnEnvelopeError &&
    Number(err.resultCode) === RATE_LIMIT_RESULT_CODE
  );
}

/**
 * 조회 횟수 제한 오류에 대처 방법을 덧붙인다 (ADR-032).
 * search 와 export 가 같은 제한에 걸리므로 문구를 한 곳에 둔다.
 * 회복 속도와 소모량은 측정값이지 서버 계약이 아니라 숫자로 적지 않는다.
 *
 * 호출부는 이 함수를 오류 경로마다 부르지 않고 한 곳에서만 부른다.
 * 반환값이 봉투 오류가 아니게 되는 것에 기대 이중 부착을 막지 않는다 — 그 계약은 눈에 보이지 않는다.
 */
export function withRateLimitHint(err: NhnCloudCliError): NhnCloudCliError {
  return new NhnCloudCliError(
    `${err.message}\n조회 횟수 제한에 걸렸습니다. 시간을 두고 다시 실행하세요. 검색 기간을 좁혀도 풀리지 않습니다.`,
    err.exitCode,
  );
}

export class LogncrashServerError extends NhnCloudCliError {
  public readonly requestId: string | null;

  constructor(
    message: string,
    requestId: string | null,
  ) {
    super(message, EXIT_API_ERROR);
    this.name = "LogncrashServerError";
    this.requestId = requestId === null ? null : sanitizeForTerminal(requestId);
  }
}

/**
 * Log & Crash Search 의 500 응답에서 서버 추적용 requestId 를 보존한다.
 * 다른 오류는 공용 변환 규칙을 그대로 따른다.
 */
export async function toLogncrashError(err: unknown): Promise<NhnCloudCliError> {
  if (!(err instanceof HTTPError) || err.response.status !== 500) {
    return toNhnCloudCliError(err);
  }

  let requestId: string | null = null;
  try {
    const body: unknown = await err.response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "requestId" in body &&
      typeof body.requestId === "string"
    ) {
      requestId = body.requestId;
    }
  } catch {
    // 본문이 비어 있거나 JSON 이 아니어도 500 자체는 보존한다.
  }

  return new LogncrashServerError(
    `API 호출 실패 (500): ${err.message}`,
    requestId,
  );
}
