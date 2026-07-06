import { Command } from "commander";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { resolveInstanceClient } from "./helpers.js";
import type { Flavor, FlavorDetail } from "../../services/instance/types.js";
import { parseNonNegativeIntegerOption } from "../parse-options.js";

interface FlavorsGlobalOpts extends OutputOptions {
  detail?: boolean;
  minDisk?: string;
  minRam?: string;
  region?: string;
  profile?: string;
}

export const flavorsCommand = new Command("flavors")
  .description("인스턴스 타입(flavor)을 조회한다 (기본 id·name, --detail 로 스펙, 전체 필드는 --json)")
  .option("--detail", "vcpus·ram·disk 등 스펙 포함 (GET /flavors/detail)")
  .option("--min-disk <gb>", "최소 블록 스토리지 크기(GB) 이상만 필터")
  .option("--min-ram <mb>", "최소 RAM 크기(MB) 이상만 필터")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<FlavorsGlobalOpts>();

    // ── 1. 파라미터 검증 (spinner 전, 자격증명 resolve 전 — fail-fast) ──
    const minDisk = parseNonNegativeIntegerOption(opts.minDisk, "--min-disk");
    const minRam = parseNonNegativeIntegerOption(opts.minRam, "--min-ram");

    // ── 2. 자격증명 + token 획득 (spinner 시작 전) ──
    const { client } = await resolveInstanceClient(opts);

    // ── 3. API 호출 (spinner 내부) ──
    startSpinner("인스턴스 타입 조회 중...");

    try {
      if (opts.detail) {
        const flavors = await client.listFlavors({ detail: true, minDisk, minRam });
        stopSpinner(true);
        printFlavors(opts, flavors);
      } else {
        const flavors = await client.listFlavors({ minDisk, minRam });
        stopSpinner(true);
        printFlavors(opts, flavors);
      }
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
  });

/** detail 여부에 따라 컬럼을 달리해 출력. 전체 필드는 --json 으로. */
function printFlavors(opts: OutputOptions, flavors: Flavor[] | FlavorDetail[]): void {
  if (isDetailList(flavors)) {
    output(opts, {
      headers: ["id", "name", "vcpus", "ram(MB)", "disk(GB)"],
      rows: flavors.map((f) => [f.id, f.name, String(f.vcpus), String(f.ram), String(f.disk)]),
      raw: flavors,
      ids: flavors.map((f) => f.id),
    });
  } else {
    output(opts, {
      headers: ["id", "name"],
      rows: flavors.map((f) => [f.id, f.name]),
      raw: flavors,
      ids: flavors.map((f) => f.id),
    });
  }
}

function isDetailList(flavors: Flavor[] | FlavorDetail[]): flavors is FlavorDetail[] {
  return flavors.length > 0 && "vcpus" in flavors[0];
}
