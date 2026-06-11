import { Command } from "commander";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { resolveVolumeClient } from "./helpers.js";
import type { Volume } from "../../services/blockstorage/types.js";

interface GetGlobalOpts extends OutputOptions {
  region?: string;
  profile?: string;
}

export const getCommand = new Command("get")
  .description("단일 볼륨 상태를 조회한다")
  .argument("<id>", "볼륨 ID")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<GetGlobalOpts>();

    // ── 1. 자격증명 + token 획득 (spinner 시작 전) ──
    const { client } = await resolveVolumeClient(opts);

    // ── 2. API 호출 (spinner 내부) ──
    startSpinner("볼륨 조회 중...");

    let volume: Volume;
    try {
      volume = await client.get(id);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }

    stopSpinner(true);

    // ── 3. 출력 ──
    // attachments 는 연결된 server_id 목록 요약으로 표시 (배열 가드 후 join)
    const attachmentSummary = Array.isArray(volume.attachments)
      ? volume.attachments
          .filter((a): a is typeof a => typeof a === "object" && a !== null)
          .map((a) => String(a.server_id))
          .join(", ")
      : "";

    const rows: string[][] = [
      ["id", volume.id],
      ["name", volume.name ?? ""],
      ["size", String(volume.size)],
      ["status", volume.status],
      ["volume_type", volume.volume_type ?? ""],
      ["created_at", volume.created_at],
      ["attachments", attachmentSummary],
    ];

    output(opts, {
      headers: ["field", "value"],
      rows,
      raw: volume,
      ids: [volume.id],
    });
  });
