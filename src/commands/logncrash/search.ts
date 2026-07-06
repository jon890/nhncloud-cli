import { Command } from "commander";
import { resolveTime, assertSearchRange } from "../../utils/time.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR, EXIT_CONFIG_ERROR } from "../../utils/exit-codes.js";
import { resolveProfileName, getServiceCredential } from "../../config/credentials.js";
import { LogncrashClient } from "../../services/logncrash/client.js";
import { output, truncate, type OutputOptions } from "../../formatters/table.js";
import type { LogSearchResult } from "../../services/logncrash/types.js";
import { parseIntegerOption, parseNonNegativeIntegerOption } from "../parse-options.js";

interface SearchGlobalOpts extends OutputOptions {
  query?: string;
  from?: string;
  to?: string;
  page?: string;
  size?: string;
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
  .option("--from <time>", "검색 시작: ISO8601 또는 상대시간 (1h/30m/2d/now) (필수)")
  .option("--to <time>", "검색 끝: ISO8601 또는 상대시간 (필수)")
  .option("--page <n>", "pageNumber (기본 0)", "0")
  .option("--size <n>", "pageSize (기본 10, 최대 100)", "10")
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

    // ── 3. 시간 정규화 + 범위 검증 (spinner 시작 전) ──
    const fromIso = resolveTime(opts.from);
    const toIso = resolveTime(opts.to);
    assertSearchRange(fromIso, toIso);

    // ── 4. 자격증명 로드 (spinner 시작 전) ──
    const profileName = await resolveProfileName(opts.profile);
    const cred = await getServiceCredential("logncrash", profileName);
    if (!cred.appkey) {
      throw new NhnCloudCliError(
        `profile "${profileName}" 의 logncrash 자격증명에 appkey 가 없습니다.\ncredentials.json 에 "appkey": "<appkey>" 를 추가하세요.`,
        EXIT_CONFIG_ERROR,
      );
    }
    if (!cred.secret) {
      throw new NhnCloudCliError(
        `profile "${profileName}" 의 logncrash 자격증명에 secret 이 없습니다.\ncredentials.json 에 "secret": "<secretkey>" 를 추가하세요.`,
        EXIT_CONFIG_ERROR,
      );
    }
    const client = new LogncrashClient(cred.appkey, cred.secret);

    // ── 5. API 호출 (spinner 내부, try/catch + leak 방지) ──
    startSpinner("로그 검색 중...");

    let result: LogSearchResult;
    try {
      result = await client.search({
        query: opts.query,
        from: fromIso,
        to: toIso,
        pageNumber: page,
        pageSize: size,
      });
    } catch (err) {
      stopSpinner(false);
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
      },
      ids,
    });
  });
