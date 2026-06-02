import { Command } from "commander";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { resolveInstanceClient } from "./helpers.js";
import type { Server } from "../../services/instance/types.js";

interface GetGlobalOpts extends OutputOptions {
  region?: string;
  profile?: string;
}

function getIps(server: Server): string {
  return Object.values(server.addresses)
    .flat()
    .map((a) => a.addr)
    .join(", ");
}

function getImageId(server: Server): string {
  return typeof server.image === "object" ? server.image.id : "";
}

export const getCommand = new Command("get")
  .description("단일 인스턴스 상태를 조회한다")
  .argument("<id>", "인스턴스 ID")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<GetGlobalOpts>();

    // ── 1. 자격증명 + token 획득 (spinner 시작 전) ──
    const { client } = await resolveInstanceClient(opts);

    // ── 2. API 호출 (spinner 내부) ──
    startSpinner("인스턴스 조회 중...");

    let server: Server;
    try {
      server = await client.get(id);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }

    stopSpinner(true);

    // ── 3. 출력 ──
    const rows: string[][] = [
      ["id", server.id],
      ["name", server.name],
      ["status", server.status],
      ["IPs", getIps(server)],
      ["flavor", server.flavor.id],
      ["image", getImageId(server)],
      ["key_name", server.key_name ?? ""],
      ["created", server.created],
      ["updated", server.updated],
    ];

    output(opts, {
      headers: ["field", "value"],
      rows,
      raw: server,
      ids: [server.id],
    });
  });
