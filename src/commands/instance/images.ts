import { Command } from "commander";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { resolveInstanceClient } from "./helpers.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { parsePositiveIntegerOption } from "../parse-options.js";

/** --visibility 허용값 — 검증·help 가 공유하는 단일 소스 (4-2 이중정의 회피). */
const VISIBILITY_VALUES = ["public", "private", "shared"] as const;

interface ImagesGlobalOpts extends OutputOptions {
  limit?: string;
  marker?: string;
  name?: string;
  visibility?: string;
  owner?: string;
  status?: string;
  region?: string;
  profile?: string;
}

export const imagesCommand = new Command("images")
  .description("이미지 목록을 조회한다 (create --image <id> 소스, 전체 필드는 --json)")
  .option("--limit <n>", "한 페이지 최대 개수 (기본: 서버 기본값 25)")
  .option("--marker <id>", "이 image id 다음부터 조회 (페이지네이션)")
  .option("--name <name>", "이름으로 필터")
  .option("--visibility <v>", `노출 범위 필터 (${VISIBILITY_VALUES.join("|")})`)
  .option("--owner <id>", "소유자(프로젝트 id)로 필터")
  .option("--status <status>", "상태로 필터 (예: active)")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<ImagesGlobalOpts>();

    // ── 1. 파라미터 검증 (spinner·자격증명 resolve 전 — fail-fast) ──
    const limit = parsePositiveIntegerOption(opts.limit, "--limit");
    if (
      opts.visibility !== undefined &&
      !VISIBILITY_VALUES.includes(opts.visibility as (typeof VISIBILITY_VALUES)[number])
    ) {
      throw new NhnCloudCliError(
        `--visibility 는 ${VISIBILITY_VALUES.join(" | ")} 중 하나여야 합니다 (입력: ${opts.visibility}).`,
        EXIT_PARAM_ERROR,
      );
    }

    // ── 2. 자격증명 + token (spinner 전) ──
    const { client } = await resolveInstanceClient(opts);

    // ── 3. API 호출 (spinner 내부) ──
    startSpinner("이미지 목록 조회 중...");

    let result;
    try {
      result = await client.listImages({
        limit,
        marker: opts.marker,
        name: opts.name,
        visibility: opts.visibility,
        owner: opts.owner,
        status: opts.status,
      });
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    // ── 4. 출력 ──
    output(opts, {
      headers: ["id", "name", "status", "visibility", "size"],
      rows: result.images.map((img) => [
        img.id,
        img.name ?? "-",
        img.status,
        img.visibility,
        img.size === undefined ? "-" : String(img.size),
      ]),
      raw: result.images,
      ids: result.images.map((img) => img.id),
    });

    // next 페이지 안내는 stderr(데이터 오염 금지). table 모드에서만.
    if (result.next && !opts.json && !opts.quiet) {
      const lastId = result.images.at(-1)?.id;
      if (lastId) {
        process.stderr.write(`다음 페이지: --marker ${lastId}\n`);
      }
    }
  });
