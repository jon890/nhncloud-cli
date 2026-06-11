import { Command } from "commander";
import { rename, writeFile, rm } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { resolveTime, assertSearchRange } from "../../utils/time.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR, EXIT_CONFIG_ERROR, EXIT_API_ERROR } from "../../utils/exit-codes.js";
import { resolveProfileName, getServiceCredential } from "../../config/credentials.js";
import { LogncrashClient } from "../../services/logncrash/client.js";
import type { ScrollResult } from "../../services/logncrash/types.js";

interface ExportGlobalOpts {
  query?: string;
  from?: string;
  to?: string;
  output?: string;
  format?: string;
  size?: string;
  profile?: string;
}

const MAX_TOTAL = 100_000; // 안전 상한 (API 최대 10만 건)

export const exportCommand = new Command("export")
  .description("Log & Crash 로그를 scroll 로 전체 추출해 파일로 저장 (대량 추출)")
  .option("--query <lucene>", "Lucene 질의 문자열 (필수)")
  .option("--from <time>", "검색 시작: ISO8601 또는 상대시간 (1h/30m/2d/now) (필수)")
  .option("--to <time>", "검색 끝: ISO8601 또는 상대시간 (필수)")
  .option("--output <file>", "출력 파일 경로 (필수)")
  .option("--format <fmt>", "출력 형식: jsonl(기본, 한 줄당 한 로그) 또는 json(배열)", "jsonl")
  .option("--size <n>", "scroll 페이지 크기 (docs 범위 10~100, 기본 100)", "100")
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
    const sizeRaw = opts.size ?? "100";
    if (!/^[1-9]\d*$/.test(sizeRaw)) {
      throw new NhnCloudCliError("--size 는 양의 정수여야 합니다 (docs 범위 10~100).", EXIT_PARAM_ERROR);
    }
    const size = parseInt(sizeRaw, 10);
    if (size < 10 || size > 100) {
      throw new NhnCloudCliError("--size 는 10~100 사이여야 합니다 (Log & Crash scroll pageSize 한도).", EXIT_PARAM_ERROR);
    }

    // ── 2. 시간 정규화 + 범위 검증 (search 와 동일 — 90일/31일 제한 재사용) ──
    const fromIso = resolveTime(opts.from);
    const toIso = resolveTime(opts.to);
    assertSearchRange(fromIso, toIso);

    // ── 3. 자격증명 로드 (?? "" 금지 — 미설정 시 CONFIG_ERROR) ──
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
        `profile "${profileName}" 의 logncrash 자격증명에 secret 이 없습니다.\ncredentials.json 에 "secret": "<secret>" 를 추가하세요.`,
        EXIT_CONFIG_ERROR,
      );
    }
    const client = new LogncrashClient(cred.appkey, cred.secret);

    // ── 4. scroll 루프 (spinner 내부 try/catch — 루프 중 throw 해도 leak 없음) ──
    // 진행 표시는 spinner.text 로 갱신한다 — 별도 process.stderr.write 면 ora 애니메이션과
    // 같은 줄에서 뒤섞여 출력이 깨진다.
    const spinner = startSpinner("로그 추출 중...");

    const collected: Record<string, unknown>[] = [];
    let total = 0;
    try {
      let res: ScrollResult = await client.scrollStart({ query: opts.query, from: fromIso, to: toIso, pageSize: size });
      collected.push(...res.data);
      total = res.totalItems;
      spinner.text = `로그 추출 중... ${collected.length}/${total}`;

      // data 가 빌 때까지(또는 상한 도달까지) scrollKey 로 이어 호출.
      while (res.data.length > 0 && res.scrollKey && collected.length < Math.min(total, MAX_TOTAL)) {
        const key = res.scrollKey;
        res = await scrollNextOrExpire(client, key);
        collected.push(...res.data);
        spinner.text = `로그 추출 중... ${collected.length}/${total}`;
      }
    } catch (err) {
      stopSpinner(false);
      throw err;
    }

    stopSpinner(true, `${collected.length}건 추출 완료`);

    // No-silent-caps: total 이 상한을 넘으면 잘렸음을 stderr 로 명시(조용한 절단 금지).
    if (total > MAX_TOTAL) {
      process.stderr.write(
        `경고: 전체 ${total}건 중 상한 ${MAX_TOTAL}건까지만 추출했습니다. 검색 범위를 좁혀 나눠 추출하세요.\n`,
      );
    }

    // ── 5. 원자적 파일 쓰기 (temp + rename — 부분 파일 방지) ──
    const body =
      format === "json"
        ? JSON.stringify(collected, null, 2) + "\n"
        : collected.map((log) => JSON.stringify(log)).join("\n") + (collected.length > 0 ? "\n" : "");

    const tmp = opts.output + "." + randomBytes(4).toString("hex") + ".tmp";
    try {
      await writeFile(tmp, body, { encoding: "utf-8" });
      await rename(tmp, opts.output);
    } catch (err) {
      // 실패 시 temp 고아 파일을 남기지 않는다 (best-effort unlink — 정리 실패는 무시).
      await rm(tmp, { force: true }).catch(() => {});
      const reason = (err as NodeJS.ErrnoException).code ?? (err instanceof Error ? err.message : String(err));
      throw new NhnCloudCliError(`출력 파일을 쓸 수 없습니다: ${opts.output} (${reason})`, EXIT_PARAM_ERROR);
    }

    // 진행/완료는 stderr — stdout 은 비워둔다(데이터는 파일).
    process.stderr.write(`${opts.output} 에 ${collected.length}건 저장\n`);
  });

/**
 * scrollNext 를 호출하되 scrollKey 만료 가능성을 안내로 덧붙인다.
 * EXIT_API_ERROR 는 만료뿐 아니라 일시적 5xx·네트워크 blip·빈 body 에서도 나므로,
 * 만료라고 단정해 원본 진단을 폐기하지 않는다 — 원본 메시지를 보존하고 만료 힌트만 덧붙인다.
 */
async function scrollNextOrExpire(client: LogncrashClient, scrollKey: string): Promise<ScrollResult> {
  try {
    return await client.scrollNext(scrollKey);
  } catch (err) {
    if (err instanceof NhnCloudCliError && err.exitCode === EXIT_API_ERROR) {
      throw new NhnCloudCliError(
        `scroll 다음 페이지 요청이 실패했습니다 (원인: ${err.message}). scrollKey 만료(유효 1분)일 수 있으니, 만료라면 검색 범위를 좁히거나 --size 를 키워 페이지 수를 줄인 뒤 다시 시도하세요.`,
        EXIT_API_ERROR,
      );
    }
    throw err;
  }
}
