import { Command } from "commander";
import chalk from "chalk";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { resolveVolumeClient } from "./helpers.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import type { Volume } from "../../services/blockstorage/types.js";

interface CreateGlobalOpts extends OutputOptions {
  size: string; // requiredOption — Commander 가 존재 보장
  name?: string;
  description?: string;
  volumeType?: string;
  snapshotId?: string;
  region?: string;
  profile?: string;
}

export const createCommand = new Command("create")
  .description("볼륨을 발급한다")
  .requiredOption("--size <gb>", "볼륨 크기(GB) — 필수")
  .option("--name <name>", "볼륨 이름")
  .option("--description <text>", "볼륨 설명")
  .option("--volume-type <type>", "볼륨 타입")
  .option("--snapshot-id <id>", "스냅샷 ID (스냅샷에서 볼륨 생성)")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<CreateGlobalOpts>();

    // ── 1. --size 형식 검증 (존재는 requiredOption 이 보장 — 양의 정수 여부만 확인) ──
    const sizeNum = Number(opts.size);
    if (!Number.isInteger(sizeNum) || sizeNum <= 0) {
      throw new NhnCloudCliError(
        `--size 는 양의 정수(GB)여야 합니다: "${opts.size}"`,
        EXIT_PARAM_ERROR,
      );
    }

    // ── 2. 자격증명 + token 획득 (spinner 시작 전) ──
    const { client } = await resolveVolumeClient(opts);

    // ── 3. 볼륨 발급 요청 (spinner 내부) ──
    startSpinner("볼륨 발급 중...");

    let volume: Volume;
    try {
      volume = await client.create({
        size: sizeNum,
        name: opts.name,
        description: opts.description,
        volume_type: opts.volumeType,
        snapshot_id: opts.snapshotId,
      });
    } catch (err) {
      stopSpinner(false);
      throw err;
    }

    stopSpinner(true);

    // ── 4. 출력 (발급은 부수효과 명령 — 성공 메시지 stderr, 데이터 stdout) ──
    process.stderr.write(chalk.green(`볼륨 발급 요청 완료 (id: ${volume.id}, status: ${volume.status})\n`));

    const rows: string[][] = [
      ["id", volume.id],
      ["name", volume.name ?? ""],
      ["size", String(volume.size)],
      ["status", volume.status],
      ["volume_type", volume.volume_type ?? ""],
      ["created_at", volume.created_at],
    ];

    output(opts, {
      headers: ["field", "value"],
      rows,
      raw: volume,
      ids: [volume.id],
    });
  });
