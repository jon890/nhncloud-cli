import { Command } from "commander";
import { rename, rm, truncate } from "node:fs/promises";
import { createWriteStream, statSync } from "node:fs";
import { randomBytes } from "node:crypto";
import {
  resolveTime,
  assertSearchRange,
  MIN_SPLIT_WINDOW_MS,
  splitTimeRange,
} from "../../utils/time.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR, EXIT_API_ERROR } from "../../utils/exit-codes.js";
import { LogncrashClient } from "../../services/logncrash/client.js";
import { LogncrashServerError } from "../../services/logncrash/errors.js";
import type { ScrollResult } from "../../services/logncrash/types.js";
import { resolveLogncrashClient } from "./helpers.js";

interface ExportGlobalOpts {
  query?: string;
  from?: string;
  to?: string;
  output?: string;
  format?: string;
  size?: string;
  force?: boolean;
  profile?: string;
}

const MAX_TOTAL = 100_000; // 안전 상한 (API 최대 10만 건)

/** 출력 경로가 이미 존재하면 --force 없이는 거부 (deploy download 와 동일 정책). ENOENT 만 정상. */
function assertWritable(path: string, force: boolean): void {
  if (force) return;
  try {
    statSync(path);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
    const reason = (e as NodeJS.ErrnoException).code ?? (e instanceof Error ? e.message : String(e));
    throw new NhnCloudCliError(`--output 경로를 확인할 수 없습니다: ${path} (${reason})`, EXIT_PARAM_ERROR);
  }
  throw new NhnCloudCliError(
    `--output 대상이 이미 존재합니다: ${path}. 덮어쓰려면 --force 를 쓰세요.`,
    EXIT_PARAM_ERROR,
  );
}

export const exportCommand = new Command("export")
  .description("Log & Crash 로그를 scroll 로 전체 추출해 파일로 저장 (대량 추출)")
  .option("--query <lucene>", "Lucene 질의 문자열 (필수)")
  .option("--from <time>", "검색 시작: ISO8601 또는 상대시간 (1h/30m/2d/now) (필수)")
  .option("--to <time>", "검색 끝: ISO8601 또는 상대시간 (필수)")
  .option("--output <file>", "출력 파일 경로 (필수)")
  .option("--format <fmt>", "출력 형식: jsonl(기본, 한 줄당 한 로그) 또는 json(배열)", "jsonl")
  .option("--size <n>", "폐기 예정: Search v3에서는 무시됨 (호환 검증 범위 10~100)")
  .option("--force", "출력 파일이 있으면 덮어쓴다")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<ExportGlobalOpts>();

    // ── 1. 필수 파라미터 검증 (spinner 전) ──
    if (!opts.query) {
      throw new NhnCloudCliError("--query 옵션은 필수입니다. 예: --query 'logType:\"NORMAL\"'", EXIT_PARAM_ERROR);
    }
    if (!opts.from) {
      throw new NhnCloudCliError("--from 옵션은 필수입니다. 예: --from 1h", EXIT_PARAM_ERROR);
    }
    if (!opts.to) {
      throw new NhnCloudCliError("--to 옵션은 필수입니다. 예: --to now", EXIT_PARAM_ERROR);
    }
    if (!opts.output) {
      throw new NhnCloudCliError("--output 옵션은 필수입니다. 예: --output logs.jsonl", EXIT_PARAM_ERROR);
    }

    const format = opts.format ?? "jsonl";
    if (format !== "jsonl" && format !== "json") {
      throw new NhnCloudCliError("--format 은 jsonl 또는 json 이어야 합니다.", EXIT_PARAM_ERROR);
    }

    // 4-4: 정수 옵션은 bare Number/parseInt 대신 regex 로 형식부터 검증 (소수·공백·접미사 차단)
    if (opts.size !== undefined) {
      if (!/^[1-9]\d*$/.test(opts.size)) {
        throw new NhnCloudCliError("--size 는 양의 정수여야 합니다 (호환 범위 10~100).", EXIT_PARAM_ERROR);
      }
      const size = parseInt(opts.size, 10);
      if (size < 10 || size > 100) {
        throw new NhnCloudCliError("--size 는 10~100 사이여야 합니다.", EXIT_PARAM_ERROR);
      }
      process.stderr.write(
        "경고: logncrash export --size는 폐기 예정이며 Search v3 요청에서는 무시됩니다.\n",
      );
    }

    // ── 2. 시간 정규화 + 범위 검증 (search 와 동일 — 90일/31일 제한 재사용) ──
    const fromIso = resolveTime(opts.from);
    const toIso = resolveTime(opts.to);
    assertSearchRange(fromIso, toIso);

    assertWritable(opts.output, opts.force ?? false); // 덮어쓰기 정책 — 네트워크 호출 전 차단

    // ── 3. appkey + 공통 UAK OAuth client 해석 ──
    const client = await resolveLogncrashClient(opts.profile);

    // ── 4. scroll 루프 + 스트리밍 쓰기 ──
    // 페이지 수신 즉시 temp 파일에 append 한다 — 전체(최대 10만 건)를 메모리에 모은 뒤
    // 한 번에 JSON.stringify 하면 큰 로그에서 V8 string 한계로 OOM 한다.
    // 진행 표시는 spinner.text 로만 갱신(별도 stderr.write 는 ora 와 줄이 뒤섞임).
    const tmp = opts.output + "." + randomBytes(4).toString("hex") + ".tmp";
    let stream = createWriteStream(tmp, { encoding: "utf-8" });
    const spinner = startSpinner("로그 추출 중...");

    let count = 0;
    let total = 0;
    let first = true;
    let bytePosition = 0;
    const write = (chunk: string): void => {
      stream.write(chunk);
      bytePosition += Buffer.byteLength(chunk, "utf-8");
    };
    const writePage = (data: Record<string, unknown>[]): void => {
      for (const log of data) {
        if (count >= MAX_TOTAL) break;
        const json = JSON.stringify(log);
        write(format === "json" ? (first ? json : "," + json) : json + "\n");
        first = false;
        count++;
      }
    };

    try {
      if (format === "json") write("[");

      let pendingWindows = [{ from: fromIso, to: toIso }];
      let completedWindows = 0;
      while (pendingWindows.length > 0) {
        const window = pendingWindows.shift();
        if (!window) break;
        const checkpoint: {
          bytesWritten: number;
          count: number;
          first: boolean;
          total: number;
        } = {
          bytesWritten: bytePosition,
          count,
          first,
          total,
        };

        try {
          let res: ScrollResult = await client.scrollStart({
            query: opts.query,
            from: window.from,
            to: window.to,
          });
          total += res.totalItems;
          writePage(res.data);
          spinner.text = `로그 추출 중... 창 ${completedWindows + 1}/${completedWindows + pendingWindows.length + 1} ${count}/${total}`;

          while (res.data.length > 0 && res.scrollKey && count < Math.min(total, MAX_TOTAL)) {
            res = await scrollNextWithHint(client, res.scrollKey);
            writePage(res.data);
            spinner.text = `로그 추출 중... 창 ${completedWindows + 1}/${completedWindows + pendingWindows.length + 1} ${count}/${total}`;
          }
          completedWindows++;
        } catch (err) {
          if (!(err instanceof LogncrashServerError)) throw err;

          // pending write 를 모두 flush 한 뒤에만 실패한 창의 시작 위치로 되돌린다.
          await endAndClose(stream);
          await truncate(tmp, checkpoint.bytesWritten);
          stream = createWriteStream(tmp, { encoding: "utf-8", flags: "a" });
          bytePosition = checkpoint.bytesWritten;
          count = checkpoint.count;
          first = checkpoint.first;
          total = checkpoint.total;

          const currentWindowMs = new Date(window.to).getTime() - new Date(window.from).getTime();
          const smallerWindowMs = Math.ceil(currentWindowMs / 2);
          if (smallerWindowMs < MIN_SPLIT_WINDOW_MS) throw err;
          pendingWindows = splitTimeRange(window.from, toIso, smallerWindowMs);
        }
      }

      if (format === "json") write("]\n");

      await endAndClose(stream);
    } catch (err) {
      stopSpinner(false);
      // createWriteStream 은 파일을 지연 open 한다. destroy() 의 close 를 기다리지 않고 rm 하면
      // open 이 아직 pending 인 사이 rm 이 없는 파일을 지워 조용히 성공하고, 그 뒤 open 이
      // 완료되며 tmp 파일이 생성돼 디스크에 남는다. close 까지 기다린 뒤 지운다.
      await new Promise<void>((resolve) => {
        if (stream.destroyed && stream.closed) {
          resolve();
          return;
        }
        stream.once("close", () => resolve());
        stream.destroy();
      });
      await rm(tmp, { force: true }).catch(() => {});
      throw err;
    }

    stopSpinner(true, `${count}건 추출 완료`);

    // ── 5. 원자적 교체 (temp → output) ──
    try {
      await rename(tmp, opts.output);
    } catch (err) {
      await rm(tmp, { force: true }).catch(() => {});
      const reason = (err as NodeJS.ErrnoException).code ?? (err instanceof Error ? err.message : String(err));
      throw new NhnCloudCliError(`출력 파일을 쓸 수 없습니다: ${opts.output} (${reason})`, EXIT_PARAM_ERROR);
    }

    // No-silent-caps: 실제로 상한에 걸려 잘렸을 때만 경고(부분 수집을 cap 으로 오인하지 않도록).
    if (count >= MAX_TOTAL && total > MAX_TOTAL) {
      process.stderr.write(
        `경고: 전체 ${total}건 중 상한 ${MAX_TOTAL}건까지만 추출했습니다. 검색 범위를 좁혀 나눠 추출하세요.\n`,
      );
    }

    process.stderr.write(`${opts.output} 에 ${count}건 저장\n`);
  });

/**
 * scrollNext 실패 원인을 보존하고 재실행 범위를 좁히도록 안내한다.
 */
async function scrollNextWithHint(client: LogncrashClient, scrollKey: string): Promise<ScrollResult> {
  try {
    return await client.scrollNext(scrollKey);
  } catch (err) {
    if (err instanceof LogncrashServerError) throw err;
    if (err instanceof NhnCloudCliError && err.exitCode === EXIT_API_ERROR) {
      throw new NhnCloudCliError(
        `scroll 다음 페이지 요청이 실패했습니다 (원인: ${err.message}). 검색 범위를 좁혀 다시 실행하세요.`,
        EXIT_API_ERROR,
      );
    }
    throw err;
  }
}

/** stream.end() 뒤 close 까지 기다려 지연 write 가 디스크에 반영되도록 한다. */
async function endAndClose(stream: ReturnType<typeof createWriteStream>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    stream.once("error", reject);
    stream.once("close", resolve);
    stream.end();
  });
}
