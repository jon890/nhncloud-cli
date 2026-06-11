import { Command } from "commander";
import chalk from "chalk";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { resolveInstanceClient } from "./helpers.js";
import type { ServerVolumeAttachment } from "../../services/instance/types.js";

interface AttachGlobalOpts extends OutputOptions {
  volume: string; // requiredOption — Commander 가 존재 보장
  region?: string;
  profile?: string;
}

interface DetachGlobalOpts extends OutputOptions {
  region?: string;
  profile?: string;
}

// ── instance volume attach <id> --volume <volumeId> ────────────────────────

const attachCommand = new Command("attach")
  .description("볼륨을 인스턴스에 연결한다")
  .argument("<id>", "인스턴스 ID")
  .requiredOption("--volume <volumeId>", "연결할 볼륨 ID")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<AttachGlobalOpts>();

    // ── 1. 자격증명 + token 획득 (spinner 시작 전) ──
    const { client } = await resolveInstanceClient(opts);

    // ── 2. API 호출 (spinner 내부) ──
    startSpinner("볼륨 연결 중...");

    let att: ServerVolumeAttachment;
    try {
      att = await client.attachVolume(id, opts.volume);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }

    stopSpinner(true);

    // ── 3. 출력 (부수효과 명령 — 성공 메시지 stderr, 데이터 stdout) ──
    process.stderr.write(
      chalk.green(`볼륨 연결 완료 (volumeId: ${att.volumeId}, device: ${att.device})\n`),
    );

    output(opts, {
      headers: ["field", "value"],
      rows: [
        ["id", att.id],
        ["volumeId", att.volumeId],
        ["serverId", att.serverId],
        ["device", att.device],
      ],
      raw: att,
      ids: [att.id],
    });
  });

// ── instance volume detach <id> <volumeId> ────────────────────────────────

const detachCommand = new Command("detach")
  .description("볼륨 연결을 해제한다")
  .argument("<id>", "인스턴스 ID")
  .argument("<volumeId>", "해제할 볼륨 ID")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (id: string, volumeId: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<DetachGlobalOpts>();

    // ── 1. 자격증명 + token 획득 (spinner 시작 전) ──
    const { client } = await resolveInstanceClient(opts);

    // ── 2. API 호출 (spinner 내부) ──
    startSpinner("볼륨 연결 해제 중...");

    try {
      await client.detachVolume(id, volumeId);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }

    stopSpinner(true);

    // ── 3. 출력 (202 무응답 — 성공 메시지만 stderr) ──
    process.stderr.write(
      chalk.green(`볼륨 연결 해제 요청 완료 (volumeId: ${volumeId})\n`),
    );
  });

// ── 서브그룹 ────────────────────────────────────────────────────────────────

export const volumeCommand = new Command("volume").description(
  "인스턴스 볼륨 연결/해제",
);
volumeCommand.addCommand(attachCommand);
volumeCommand.addCommand(detachCommand);
