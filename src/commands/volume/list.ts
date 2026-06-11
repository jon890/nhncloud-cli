import { Command } from "commander";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { resolveVolumeClient } from "./helpers.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import type { Volume } from "../../services/blockstorage/types.js";

/**
 * bare Number() 는 "1e2" → 100 으로 통과시키므로 regex 사전 검증 (pitfall 4-4).
 * --limit / --offset 같은 양의 정수 플래그에 사용한다.
 */
function parsePositiveInt(value: string, flag: string): number {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new NhnCloudCliError(
      `${flag} 는 양의 정수여야 합니다: ${JSON.stringify(value)}`,
      EXIT_PARAM_ERROR,
    );
  }
  return Number(value);
}

interface ListGlobalOpts extends OutputOptions {
  sort?: string;
  limit?: string;
  offset?: string;
  marker?: string;
  region?: string;
  profile?: string;
}

export const listCommand = new Command("list")
  .description("볼륨 목록을 조회한다")
  .option("--sort <key:dir>", "정렬 기준 (예: created_at:desc)")
  .option("--limit <n>", "최대 반환 개수")
  .option("--offset <n>", "페이지 시작 오프셋")
  .option("--marker <id>", "페이지네이션 마커 볼륨 ID")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<ListGlobalOpts>();

    // ── 1. 파라미터 검증 (spinner 시작 전, 자격증명 취득 전) ──
    const limitNum = opts.limit !== undefined ? parsePositiveInt(opts.limit, "--limit") : undefined;
    const offsetNum = opts.offset !== undefined ? parsePositiveInt(opts.offset, "--offset") : undefined;

    // ── 2. 자격증명 + token 획득 (spinner 시작 전) ──
    const { client } = await resolveVolumeClient(opts);

    // ── 3. API 호출 (spinner 내부) ──
    startSpinner("볼륨 목록 조회 중...");

    let volumes: Volume[];
    try {
      volumes = await client.list({
        sort: opts.sort,
        limit: limitNum,
        offset: offsetNum,
        marker: opts.marker,
      });
    } catch (err) {
      stopSpinner(false);
      throw err;
    }

    stopSpinner(true);

    // ── 3. 출력 ──
    output(opts, {
      headers: ["id", "name", "size", "status", "type"],
      rows: volumes.map((v) => [
        v.id,
        v.name ?? "",
        String(v.size),
        v.status,
        v.volume_type ?? "",
      ]),
      raw: volumes,
      ids: volumes.map((v) => v.id),
    });
  });
