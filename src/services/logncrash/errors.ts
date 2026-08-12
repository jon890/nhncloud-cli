import { HTTPError } from "ky";
import { toNhnCloudCliError } from "../../api/httpError.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_API_ERROR } from "../../utils/exit-codes.js";
import { sanitizeForTerminal } from "../../utils/terminal.js";

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
