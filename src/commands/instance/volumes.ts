import { Command } from "commander";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { resolveInstanceClient } from "./helpers.js";
import type { ServerVolumeAttachment } from "../../services/instance/types.js";

interface VolumesGlobalOpts extends OutputOptions {
  region?: string;
  profile?: string;
}

export const volumesCommand = new Command("volumes")
  .description("인스턴스에 연결된 볼륨 목록을 조회한다")
  .argument("<id>", "인스턴스 ID")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<VolumesGlobalOpts>();

    // ── 1. 자격증명 + token 획득 (spinner 시작 전) ──
    const { client } = await resolveInstanceClient(opts);

    // ── 2. API 호출 (spinner 내부) ──
    startSpinner("볼륨 목록 조회 중...");

    let attachments: ServerVolumeAttachment[];
    try {
      attachments = await client.listVolumeAttachments(id);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }

    stopSpinner(true);

    // ── 3. 출력 ──
    output(opts, {
      headers: ["id", "volumeId", "device"],
      rows: attachments.map((a) => [a.id, a.volumeId, a.device]),
      raw: attachments,
      ids: attachments.map((a) => a.id),
    });
  });
