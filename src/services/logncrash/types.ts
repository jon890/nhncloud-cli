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
