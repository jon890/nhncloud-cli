import { Command } from "commander";
import { resolveTime, assertSearchRange } from "../../utils/time.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { output, truncate, type OutputOptions } from "../../formatters/table.js";
import {
  isRateLimitError,
  LogncrashServerError,
  withRateLimitHint,
} from "../../services/logncrash/errors.js";
import type { CursorSearchResult } from "../../services/logncrash/types.js";
import { parseIntegerOption, parseNonNegativeIntegerOption } from "../parse-options.js";
import { resolveLogncrashClient } from "./helpers.js";

interface SearchGlobalOpts extends OutputOptions {
  query?: string;
  from?: string;
  to?: string;
  page?: string;
  size?: string;
  cursor?: string;
  profile?: string;
}

function getString(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function formatLogRow(log: Record<string, unknown>): string[] {
  const logTime = getString(log["logTime"] ?? log["time"] ?? "");
  const logType = getString(log["logType"] ?? log["type"] ?? "");
  const body = truncate(getString(log["logBody"] ?? log["body"] ?? log["message"] ?? ""), 60);
  return [logTime, logType, body];
}

export const searchCommand = new Command("search")
  .description("Log & Crash 로그 검색")
  .option("--query <lucene>", "Lucene 질의 문자열 (필수)")
  .option("--from <time>", "검색 시작: 초·시간대 포함 ISO8601 또는 상대시간 (1h/30m/2d/now) (필수)")
  .option("--to <time>", "검색 끝: 초·시간대 포함 ISO8601 또는 상대시간 (필수)")
  .option("--page <n>", "전환 호환용 pageNumber. 0만 허용 (다음 페이지는 --cursor)", "0")
  .option("--size <n>", "pageSize (기본 10, 최대 100)", "10")
  .option("--cursor <value>", "다음 페이지 조회용 opaque cursor")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<SearchGlobalOpts>();

    // ── 1. 필수 파라미터 검증 (spinner 시작 전) ──
    if (!opts.query) {
      throw new NhnCloudCliError("--query 옵션은 필수입니다. 예: --query 'logType:\"NORMAL\"'", EXIT_PARAM_ERROR);
    }
    if (!opts.from) {
      throw new NhnCloudCliError("--from 옵션은 필수입니다. 예: --from 1h", EXIT_PARAM_ERROR);
    }
    if (!opts.to) {
      throw new NhnCloudCliError("--to 옵션은 필수입니다. 예: --to now", EXIT_PARAM_ERROR);
    }

    // ── 2. page / size 숫자 검증 (spinner 시작 전) ──
    const page = parseNonNegativeIntegerOption(opts.page ?? "0", "--page");
    const size = parseIntegerOption(opts.size ?? "10", "--size", { min: 1, max: 100 });
    if (page !== 0) {
      throw new NhnCloudCliError(
        "Search v3에서는 --page 0만 지원합니다. 다음 페이지는 --cursor <nextCursor>를 사용하세요.",
        EXIT_PARAM_ERROR,
      );
    }
    if (opts.cursor !== undefined && opts.cursor.trim().length === 0) {
      throw new NhnCloudCliError("--cursor 값은 비어 있을 수 없습니다.", EXIT_PARAM_ERROR);
    }

    // ── 3. 시간 정규화 + 범위 검증 (spinner 시작 전) ──
    const fromIso = resolveTime(opts.from);
    const toIso = resolveTime(opts.to);
    assertSearchRange(fromIso, toIso);

    // ── 4. appkey + 공통 UAK OAuth client 해석 (spinner 시작 전) ──
    const client = await resolveLogncrashClient(opts.profile);

    // ── 5. API 호출 (spinner 내부, try/catch + leak 방지) ──
    startSpinner("로그 검색 중...");

    let result: CursorSearchResult;
    try {
      result = await client.cursorSearch({
        query: opts.query,
        from: fromIso,
        to: toIso,
        pageSize: size,
        ...(opts.cursor !== undefined ? { cursor: opts.cursor } : {}),
      });
    } catch (err) {
      stopSpinner(false);
      // rate limit 을 먼저 가른다. 500 과 원인도 대처도 달라 같은 안내로 묶으면
      // 기간을 좁히라는 유도가 상황을 악화시킨다 (ADR-032).
      if (isRateLimitError(err) && err instanceof NhnCloudCliError) {
        throw withRateLimitHint(err);
      }
      if (err instanceof LogncrashServerError) {
        const requestId = err.requestId === null
          ? ""
          : ` (requestId: ${err.requestId})`;
        throw new LogncrashServerError(
          `${err.message}\n검색 기간이 넓어 서버가 처리하지 못했을 수 있습니다. 기간을 줄여 다시 시도하거나 logncrash export를 사용하세요.${requestId}`,
          err.requestId,
        );
      }
      throw err;
    }

    stopSpinner(true);

    // ── 6. 출력 (빈 결과는 stdout — stderr 금지) ──
    const rows = result.data.map((log) => formatLogRow(log));
    const ids = result.data.map((log) => getString(log["logTime"] ?? ""));

    output(opts, {
      headers: ["logTime", "logType", "본문 요약"],
      rows,
      raw: {
        totalItems: result.totalItems,
        pageNumber: result.pageNumber,
        pageSize: result.pageSize,
        data: result.data,
        ...(result.nextCursor !== undefined ? { nextCursor: result.nextCursor } : {}),
      },
      ids,
    });
  });
