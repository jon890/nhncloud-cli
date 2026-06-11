import { Command } from "commander";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { resolveInstanceClient } from "./helpers.js";
import type { AvailabilityZone } from "../../services/instance/types.js";

interface AvailabilityZonesGlobalOpts extends OutputOptions {
  region?: string;
  profile?: string;
}

export const availabilityZonesCommand = new Command("availability-zones")
  .description("가용성 영역(availability zone) 목록을 조회한다 (zoneName·available)")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<AvailabilityZonesGlobalOpts>();

    // ── 1. 자격증명 + token 획득 (spinner 시작 전) ──
    const { client } = await resolveInstanceClient(opts);

    // ── 2. API 호출 (spinner 내부) ──
    startSpinner("가용성 영역 조회 중...");

    let zones: AvailabilityZone[];
    try {
      zones = await client.listAvailabilityZones();
    } catch (err) {
      stopSpinner(false);
      throw err;
    }

    stopSpinner(true);

    // ── 3. 출력 (빈 결과 포함 한 경로 — output() 이 모드별 처리) ──
    output(opts, {
      headers: ["zoneName", "available"],
      rows: zones.map((z) => [z.zoneName, String(z.zoneState.available)]),
      raw: zones,
      ids: zones.map((z) => z.zoneName),
    });
  });
