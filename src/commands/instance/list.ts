import { Command } from "commander";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { resolveInstanceClient } from "./helpers.js";
import type { Server } from "../../services/instance/types.js";

interface ListGlobalOpts extends OutputOptions {
  region?: string;
  profile?: string;
}

function getIps(server: Server): string {
  return Object.values(server.addresses)
    .flat()
    .map((a) => a.addr)
    .join(", ");
}

export const listCommand = new Command("list")
  .description("인스턴스 목록을 조회한다")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<ListGlobalOpts>();

    // ── 1. 자격증명 + token 획득 (spinner 시작 전) ──
    const { client } = await resolveInstanceClient(opts);

    // ── 2. API 호출 (spinner 내부) ──
    startSpinner("인스턴스 목록 조회 중...");

    let servers: Server[];
    try {
      servers = await client.list();
    } catch (err) {
      stopSpinner(false);
      throw err;
    }

    stopSpinner(true);

    // ── 3. 출력 ──
    output(opts, {
      headers: ["id", "name", "status", "IPs", "flavor"],
      rows: servers.map((s) => [s.id, s.name, s.status, getIps(s), s.flavor.id]),
      raw: servers,
      ids: servers.map((s) => s.id),
    });
  });
