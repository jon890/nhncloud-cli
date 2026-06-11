import { Command } from "commander";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { resolveNetworkClient } from "./helpers.js";
import type { Vpc } from "../../services/network/types.js";

interface ListGlobalOpts extends OutputOptions {
  region?: string;
  profile?: string;
}

export const listCommand = new Command("list")
  .description("VPC 목록을 조회한다 (전체 필드는 --json)")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<ListGlobalOpts>();

    // ── 1. 자격증명 + token 획득 (spinner 시작 전) ──
    const { client } = await resolveNetworkClient(opts);

    // ── 2. API 호출 (spinner 내부) ──
    startSpinner("VPC 목록 조회 중...");

    let vpcs: Vpc[];
    try {
      vpcs = await client.listVpcs();
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    // ── 3. 출력 (router:external 은 콜론 포함 키 → 대괄호 접근) ──
    output(opts, {
      headers: ["id", "name", "cidrv4", "state", "external"],
      rows: vpcs.map((v) => [v.id, v.name, v.cidrv4, v.state, String(v["router:external"])]),
      raw: vpcs,
      ids: vpcs.map((v) => v.id),
    });
  });
