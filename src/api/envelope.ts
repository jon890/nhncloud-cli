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
 * 봉투 헤더만 검사한다 (body 가 없는 응답 — 예: collector send).
 * header.isSuccessful === false 면 NhnCloudCliError 를 던진다.
 * 성공 판정은 반드시 isSuccessful 로 — resultCode 타입 비교 금지 (ADR-006).
 * 봉투 성공/실패 규약의 단일 소스 — body 가 필요한 unwrap() 도 이를 재사용한다.
 */
export function unwrapHeader(res: NhnEnvelope<unknown>): void {
  if (!res.header.isSuccessful) {
    throw new NhnCloudCliError(
      `API 오류: ${res.header.resultMessage}`,
      EXIT_API_ERROR,
    );
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
