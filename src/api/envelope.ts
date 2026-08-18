import { NhnCloudCliError } from "../utils/errors.js";
import { EXIT_API_ERROR } from "../utils/exit-codes.js";

/**
 * NHN Cloud 공통 응답 봉투 타입 (ADR-006).
 * resultCode 는 서비스마다 number(Log&Crash) 또는 string(Deploy) — isSuccessful 로만 판정.
 */
export interface NhnEnvelope<T> {
  header: {
    isSuccessful: boolean;
    resultCode: number | string;
    resultMessage: string;
  };
  body?: T;
}

/**
 * 봉투 실패 오류 — resultCode 를 보존한다 (ADR-032).
 * 메시지와 종료 코드는 기존과 같다. 호출부가 원인 코드로 분기할 수 있게 넓히기만 한다.
 * 서버가 HTTP 200 으로 실패를 알리는 경우가 있어(Log & Crash rate limit) HTTP 상태로는 가를 수 없다.
 */
export class NhnEnvelopeError extends NhnCloudCliError {
  public readonly resultCode: number | string;

  constructor(resultCode: number | string, resultMessage: string) {
    super(`API 오류: ${resultMessage}`, EXIT_API_ERROR);
    this.name = "NhnEnvelopeError";
    this.resultCode = resultCode;
  }
}

/**
 * 봉투 헤더만 검사한다 (body 가 없는 응답 — 예: collector send).
 * header.isSuccessful === false 면 NhnEnvelopeError 를 던진다.
 * 성공 판정은 반드시 isSuccessful 로 — resultCode 타입 비교 금지 (ADR-006).
 * 봉투 성공/실패 규약의 단일 소스 — body 가 필요한 unwrap() 도 이를 재사용한다.
 */
export function unwrapHeader(res: NhnEnvelope<unknown>): void {
  if (!res.header.isSuccessful) {
    throw new NhnEnvelopeError(res.header.resultCode, res.header.resultMessage);
  }
}

/**
 * 봉투를 벗겨 body 를 반환한다 (header 검사 + body 필수).
 */
export function unwrap<T>(res: NhnEnvelope<T>): T {
  unwrapHeader(res);
  if (res.body === undefined) {
    throw new NhnCloudCliError("API 응답에 body 가 없습니다.", EXIT_API_ERROR);
  }
  return res.body;
}
