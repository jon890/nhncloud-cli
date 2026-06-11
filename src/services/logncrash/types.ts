export interface LogSearchParams {
  query: string;
  from: string;
  to: string;
  pageNumber?: number;
  pageSize?: number;
}

export interface LogSearchResult {
  totalItems: number;
  pageNumber: number;
  pageSize: number;
  data: Record<string, unknown>[];
}

/** scroll 시작 요청 body (search 와 동일 필드, pageNumber 는 없음) */
export interface ScrollStartParams {
  query: string;
  from: string;
  to: string;
  /** 한 번의 scroll 응답당 건수 (docs 범위 10~100, 기본 100). 전체 순회는 루프가 담당. */
  pageSize?: number;
}

/**
 * scroll 응답 body.
 * - scrollKey: 다음 페이지 요청에 쓰는 키 (유효 1분). data 가 더 없으면 응답에서 빠지거나 빈 값일 수 있다.
 * - totalItems: 전체 매칭 건수 (진행률 표시용).
 * - data: 이번 페이지의 로그 배열. 빈 배열이면 순회 종료.
 */
export interface ScrollResult {
  scrollKey?: string;
  totalItems: number;
  pageSize: number;
  data: Record<string, unknown>[];
}

/** logncrash send 가 허용하는 로그 레벨 (collector 스펙) */
export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";

/** logncrash 로그 전송 파라미터 (collector POST /v2/log) */
export interface LogSendParams {
  /** 로그 메시지 본문 (필수) */
  body: string;
  /** 프로젝트 버전 (collector 필수 필드) */
  projectVersion: string;
  /** 로그 레벨 (선택) */
  logLevel?: LogLevel;
  /** 로그 소스 (선택, collector 기본 "http") */
  logSource?: string;
  /** 로그 타입 (선택, collector 기본 "log") */
  logType?: string;
  /** 로그를 보낸 host 식별 (선택) */
  host?: string;
}
