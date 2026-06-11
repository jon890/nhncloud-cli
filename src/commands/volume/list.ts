import { Command } from "commander";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { resolveVolumeClient } from "./helpers.js";
import type { Volume } from "../../services/blockstorage/types.js";

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

    // ── 1. 자격증명 + token 획득 (spinner 시작 전) ──
    const { client } = await resolveVolumeClient(opts);

    // ── 2. API 호출 (spinner 내부) ──
    startSpinner("볼륨 목록 조회 중...");

    let volumes: Volume[];
    try {
      volumes = await client.list({
        sort: opts.sort,
        limit: opts.limit !== undefined ? Number(opts.limit) : undefined,
        offset: opts.offset !== undefined ? Number(opts.offset) : undefined,
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
