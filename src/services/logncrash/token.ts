import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_API_ERROR } from "../../utils/exit-codes.js";

const OBSERVED_REFILL_RATE_PER_SECOND = 1.6;

export interface AvailableTokenStatus {
  availableToken: number;
  estimatedWaitSeconds: number | null;
}

export function availableTokenStatus(availableToken: number): AvailableTokenStatus {
  return {
    availableToken,
    estimatedWaitSeconds: availableToken > 0
      ? null
      : Math.ceil((1 - availableToken) / OBSERVED_REFILL_RATE_PER_SECOND),
  };
}

export function assertAvailableSearchToken(status: AvailableTokenStatus): void {
  if (status.estimatedWaitSeconds === null) return;

  throw new NhnCloudCliError(
    `조회 토큰 잔량이 ${status.availableToken}이므로 검색 요청을 보내지 않았습니다. `
      + `관측한 회복 속도 ${OBSERVED_REFILL_RATE_PER_SECOND} token/s 기준으로 잔량이 양수가 되기까지 약 ${status.estimatedWaitSeconds}초입니다. `
      + "CLI는 자동으로 기다리지 않습니다. nhncloud logncrash available-token으로 다시 확인하세요.",
    EXIT_API_ERROR,
  );
}
