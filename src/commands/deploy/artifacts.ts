import { Command } from "commander";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { createDeployClient, resolveDeployAppKey } from "./helpers.js";

interface ArtifactsGlobalOpts extends OutputOptions {
  profile?: string;
}

export const artifactsCommand = new Command("artifacts")
  .description("아티팩트 목록을 조회한다")
  .option("--profile <name>", "사용할 profile 이름")
  // 이 명령은 좌표가 필요 없다 — appKey 하나로 조회한다 (ADR-033).
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<ArtifactsGlobalOpts>();

    // ── 1. 인증 체인 + appKey 해석 (spinner 시작 전) ──
    const { client, profileName } = await createDeployClient(opts.profile);
    const appKey = await resolveDeployAppKey(profileName);

    // ── 2. API 호출 (spinner 내부, try/catch + leak 방지) ──
    startSpinner("아티팩트 목록 조회 중...");

    let result: Record<string, unknown>;
    try {
      result = await client.artifacts(appKey);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }

    stopSpinner(true);

    // ── 3. 출력 ──
    const list = Array.isArray(result) ? result : [result];
    output(opts, {
      headers: ["key", "value"],
      rows: list.flatMap((item) => {
        if (typeof item !== "object" || item === null) return [[String(item), ""]];
        return Object.entries(item as Record<string, unknown>).map(([k, v]) => [
          `${k}: ${String(v ?? "")}`,
          "",
        ]);
      }),
      raw: result,
      ids: [],
    });
  });
