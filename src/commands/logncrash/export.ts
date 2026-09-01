import { Command } from "commander";
import { appendFile, rename, rm, truncate } from "node:fs/promises";
import { createWriteStream, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
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
import {
  isRateLimitError,
  LogncrashServerError,
  withRateLimitHint,
} from "../../services/logncrash/errors.js";
import type { ScrollResult } from "../../services/logncrash/types.js";
import {
  preflightLogncrashSearchToken,
  resolveLogncrashClient,
} from "./helpers.js";

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

export type ExportFinalizeState = "complete" | "unfinalized";

export interface ExportFileOps {
  appendFile(path: string, data: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
}

export type ExportFinalizeResult =
  | { ok: true }
  | {
      ok: false;
      state: ExportFinalizeState;
      cause: unknown;
      recoveryPath: string;
      preserved: boolean;
    };

const MAX_TOTAL = 100_000; // 안전 상한 (API 최대 10만 건)

const defaultExportFileOps: ExportFileOps = { appendFile, rename };

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

export function createExportCommand(finalizeOps?: ExportFileOps): Command {
  return new Command("export")
    .description("Log & Crash 로그를 scroll 로 전체 추출해 파일로 저장 (대량 추출)")
    .option("--query <lucene>", "Lucene 질의 문자열 (필수)")
    .option("--from <time>", "검색 시작: 초·시간대 포함 ISO8601 또는 상대시간 (1h/30m/2d/now) (필수)")
    .option("--to <time>", "검색 끝: 초·시간대 포함 ISO8601 또는 상대시간 (필수)")
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
      const id = randomUUID();
      const tmp = `${opts.output}.${id}.tmp`;
      let stream = createWriteStream(tmp, { encoding: "utf-8" });
      const spinner = startSpinner("로그 추출 중...");

      let count = 0;
      let total = 0;
      let hasUnqueriedWindows = false;
      let first = true;
      let bytePosition = 0;
      // 이어받을 지점. 로그의 logTime 이 아니라 처리 중인 창의 시작 경계다 (ADR-032).
      // 창은 오래된 쪽부터 처리되고 정렬은 창 안에서만 내림차순이라 두 방향이 어긋난다.
      let resumeFrom = "";
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
        // 창이 하나면 분할이 일어나지 않았다는 뜻이라 `창 1/1` 을 붙이지 않는다.
        // 현재 창은 이미 shift 된 상태라 남은 개수에 1 을 더해 전체를 센다.
        const progressText = (): string => {
          const totalWindows = completedWindows + pendingWindows.length + 1;
          const windowPart = totalWindows > 1 ? `창 ${completedWindows + 1}/${totalWindows} ` : "";
          return `로그 추출 중... ${windowPart}${count}/${total}`;
        };
        while (pendingWindows.length > 0) {
          const window = pendingWindows.shift();
          if (!window) break;
          resumeFrom = window.from;
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
            await preflightLogncrashSearchToken(client);
            let res: ScrollResult = await client.scrollStart({
              query: opts.query,
              from: window.from,
              to: window.to,
            });
            total += res.totalItems;
            writePage(res.data);
            spinner.text = progressText();

            while (res.data.length > 0 && res.scrollKey && count < Math.min(total, MAX_TOTAL)) {
              res = await scrollNextWithHint(client, res.scrollKey);
              writePage(res.data);
              spinner.text = progressText();
            }
            completedWindows++;
            if (count >= MAX_TOTAL && pendingWindows.length > 0) {
              hasUnqueriedWindows = true;
              break;
            }
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

        await endAndClose(stream);
      } catch (err) {
        stopSpinner(false);
        // rate limit 은 500 과 원인도 대처도 달라 같은 안내로 묶지 않는다 (ADR-032).
        // scrollStart 가 던진 것은 분할 catch 를 통과해 여기까지 올라온다.
        const failure = isRateLimitError(err)
          ? withRateLimitHint(err)
          : err;

        // createWriteStream 은 파일을 지연 open 한다. close 를 기다리지 않고 파일을 다루면
        // open 이 아직 pending 인 사이 rm 이 없는 파일을 지워 조용히 성공하고, 그 뒤 open 이
        // 완료되며 tmp 파일이 생성돼 디스크에 남는다. close 까지 기다린 뒤 다룬다.
        // destroy() 가 아니라 end() 로 닫는다 — destroy 는 버퍼에 남은 write 를 버려
        // 보존하려던 부분 결과가 사라진다. 닫는 중의 오류는 원본 오류를 덮지 않게 삼킨다.
        await new Promise<void>((resolve) => {
          if (stream.closed) {
            resolve();
            return;
          }
          stream.once("close", () => resolve());
          stream.once("error", () => resolve());
          if (stream.destroyed) return;
          stream.end();
        });

        // 한 건도 받지 못했으면 빈 부분 파일을 남길 이유가 없다.
        if (count === 0) {
          await rm(tmp, { force: true }).catch(() => {});
          throw failure;
        }

        // 잘린 결과는 --output 이 아니라 별도 경로에 둔다. 자동화가 전체로 오인하지 않게 한다.
        const partial = `${opts.output}.partial`;
        try {
          // 닫힌 stream 을 재사용하지 않고 파일에 직접 덧붙인다.
          // 배열 닫기는 정상 경로의 마지막 동작이라, 여기까지 왔으면 닫기를 시도했더라도 성공하지 못했다.
          if (format === "json") await appendFile(tmp, "]\n");
          await rename(tmp, partial);
        } catch {
          // 보존 실패가 원본 오류를 덮으면 사용자가 진짜 원인을 볼 수 없다.
          process.stderr.write(
            `경고: 부분 결과를 ${partial} 에 남기지 못했습니다. 임시 파일: ${tmp}\n`,
          );
          throw failure;
        }

        process.stderr.write(`안내: 여기까지 받은 ${count}건을 ${partial} 에 남겼습니다.\n`);
        // 실패한 창이 요청 구간의 시작과 같으면 이어받기 안내가 방금 친 명령과 글자까지 같아진다.
        // 분할이 없었을 때도, 분할 후 첫 창에서 실패했을 때도 그렇다. 두 경우 모두 전량이 다시 조회된다.
        if (resumeFrom === fromIso) {
          process.stderr.write(
            `안내: 이어받을 지점이 없습니다. 같은 명령을 다시 실행하면 ${count}건도 다시 조회됩니다.\n`,
          );
        } else {
          process.stderr.write(
            `안내: 이어받으려면 --from "${resumeFrom}" --to "${toIso}" 로 다시 실행하세요. 경계 구간의 로그가 중복될 수 있습니다.\n`,
          );
        }
        throw failure;
      }

      // ── 5. 파일 형식 마무리 + 원자적 교체 (temp → output) ──
      const finalized = await finalizeExportFile(tmp, opts.output, id, format, finalizeOps);
      if (!finalized.ok) {
        stopSpinner(false);
        const reason = errorReason(finalized.cause);
        if (finalized.preserved) {
          const guidance = finalized.state === "complete"
            ? `안내: API 재조회가 필요 없는 전체 결과를 ${finalized.recoveryPath} 에 남겼습니다. 그대로 사용할 수 있습니다.\n`
            : `안내: API 재조회가 필요 없는 전체 데이터를 ${finalized.recoveryPath} 에 남겼습니다. JSON 배열의 마지막 ]를 확인하세요.\n`;
          process.stderr.write(guidance);
        } else {
          process.stderr.write(
            `경고: 복구 파일 ${finalized.recoveryPath} 로 옮기지 못했습니다. 임시 파일을 삭제하지 않았습니다: ${tmp}\n`,
          );
        }

        const message = finalized.state === "complete"
          ? `출력 파일 최종 교체에 실패했습니다: ${opts.output} (${reason})`
          : `JSON 배열을 마무리하지 못했습니다: ${opts.output} (${reason})`;
        throw new NhnCloudCliError(message, EXIT_PARAM_ERROR);
      }

      stopSpinner(true, `${count}건 추출 완료`);

      // 교체가 끝난 뒤에 앞선 실패의 부분 파일을 치운다. 두면 자동화가 낡은 잘린 결과를 현재 것으로 오인한다.
      // 교체 전에 지우면 rename 이 실패했을 때 이번 결과와 앞선 부분 결과를 한꺼번에 잃는다.
      await rm(`${opts.output}.partial`, { force: true }).catch(() => {});

      // No-silent-caps: 실제로 상한에 걸려 잘렸을 때만 경고(부분 수집을 cap 으로 오인하지 않도록).
      if (count >= MAX_TOTAL && (total > MAX_TOTAL || hasUnqueriedWindows)) {
        const totalDescription = hasUnqueriedWindows
          ? `조회한 창에서 ${total}건을 확인했고 남은 창을 조회하지 않은 채`
          : `전체 ${total}건 중`;
        process.stderr.write(
          `경고: ${totalDescription} 상한 ${MAX_TOTAL}건까지만 추출했습니다. 검색 범위를 좁혀 나눠 추출하세요.\n`,
        );
      }

      process.stderr.write(`${opts.output} 에 ${count}건 저장\n`);
    });
}

export const exportCommand = createExportCommand();

export async function finalizeExportFile(
  tmp: string,
  output: string,
  id: string,
  format: string,
  ops: ExportFileOps = defaultExportFileOps,
): Promise<ExportFinalizeResult> {
  if (format === "json") {
    try {
      // 닫힌 stream 을 재사용하지 않고 파일에 직접 덧붙인다.
      await ops.appendFile(tmp, "]\n");
    } catch (cause) {
      return await preserveCompletedExport(tmp, output, id, "unfinalized", cause, ops);
    }
  }

  try {
    await ops.rename(tmp, output);
    return { ok: true };
  } catch (cause) {
    return await preserveCompletedExport(tmp, output, id, "complete", cause, ops);
  }
}

async function preserveCompletedExport(
  tmp: string,
  output: string,
  id: string,
  state: ExportFinalizeState,
  cause: unknown,
  ops: ExportFileOps,
): Promise<ExportFinalizeResult> {
  const recoveryPath = `${output}.${id}.${state}`;
  try {
    await ops.rename(tmp, recoveryPath);
    return { ok: false, state, cause, recoveryPath, preserved: true };
  } catch {
    return { ok: false, state, cause, recoveryPath, preserved: false };
  }
}

function errorReason(error: unknown): string {
  if (error instanceof Error) {
    return (error as NodeJS.ErrnoException).code ?? error.message;
  }
  return String(error);
}

/**
 * scrollNext 실패 원인을 보존하고 대처 방법을 안내한다.
 * rate limit 은 기간을 좁혀도 풀리지 않아 여기서 감싸지 않는다 (ADR-032).
 * 안내는 바깥 catch 한 곳에서만 붙여 문구가 두 번 붙는 경로를 없앤다.
 */
async function scrollNextWithHint(client: LogncrashClient, scrollKey: string): Promise<ScrollResult> {
  await preflightLogncrashSearchToken(client);
  try {
    return await client.scrollNext(scrollKey);
  } catch (err) {
    if (isRateLimitError(err)) throw err;
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
