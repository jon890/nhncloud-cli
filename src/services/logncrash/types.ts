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
