import { Command } from "commander";
import { getDeployTarget } from "../../config/credentials.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { createDeployClient } from "./helpers.js";

interface HistoriesGlobalOpts extends OutputOptions {
  appKey?: string;
  artifactId?: string;
  profile?: string;
}

export const historiesCommand = new Command("histories")
  .description("배포 이력을 조회한다")
  .argument("<target>", "config.json 에 정의된 deploy target 이름")
  .option("--app-key <k>", "target 의 appKey override")
  .option("--artifact-id <id>", "target 의 artifactId override")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (targetName: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<HistoriesGlobalOpts>();

    // ── 1. 좌표 로드 + flag override (spinner 시작 전) ──
    const target = await getDeployTarget(targetName);
    const appKey = opts.appKey ?? target.appKey;
    const artifactId = opts.artifactId ?? target.artifactId;

    // ── 2. 인증 체인 (spinner 시작 전) ──
    const { client } = await createDeployClient(opts.profile);

    // ── 3. API 호출 (spinner 내부, try/catch + leak 방지) ──
    startSpinner("배포 이력 조회 중...");

    let result: Record<string, unknown>;
    try {
      result = await client.histories(appKey, artifactId);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }

    stopSpinner(true);

    // ── 4. 출력 ──
    output(opts, {
      headers: ["key", "value"],
      rows: Object.entries(result).map(([k, v]) => [k, String(v ?? "")]),
      raw: result,
      ids: [],
    });
  });
