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
  availabilityZone?: string;
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
  .option("--availability-zone <az>", "가용성 영역(AZ). instance availability-zones 로 조회한 zoneName 지정")
  .option("--snapshot-id <id>", "스냅샷 ID (스냅샷에서 볼륨 생성)")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<CreateGlobalOpts>();

    // ── 1. --size 형식 검증 (존재는 requiredOption 이 보장 — regex 로 양의 정수 확인)
    //    bare Number() 는 "1e2" → 100 으로 통과시키므로 regex 사전 검증 필수 (pitfall 4-4).
    if (!/^[1-9]\d*$/.test(opts.size)) {
      throw new NhnCloudCliError(
        `--size 는 양의 정수(GB)여야 합니다: ${JSON.stringify(opts.size)}`,
        EXIT_PARAM_ERROR,
      );
    }
    const sizeNum = Number(opts.size);

    const availabilityZone = opts.availabilityZone?.trim();
    if (opts.availabilityZone !== undefined && availabilityZone === "") {
      throw new NhnCloudCliError(
        `--availability-zone 은 공백이 아닌 문자열이어야 합니다: ${JSON.stringify(opts.availabilityZone)}`,
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
        availability_zone: availabilityZone,
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
      ["availability_zone", volume.availability_zone ?? ""],
      ["created_at", volume.created_at],
    ];

    output(opts, {
      headers: ["field", "value"],
      rows,
      raw: volume,
      ids: [volume.id],
    });
  });
