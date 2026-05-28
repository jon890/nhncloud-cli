import { Command } from "commander";
import { getDeployTarget } from "../../config/credentials.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { createDeployClient } from "./helpers.js";

interface ArtifactsGlobalOpts extends OutputOptions {
  appKey?: string;
  profile?: string;
}

export const artifactsCommand = new Command("artifacts")
  .description("아티팩트 목록을 조회한다")
  .argument("[target]", "config.json 에 정의된 deploy target 이름 (--app-key 로 대체 가능)")
  .option("--app-key <k>", "appKey 직접 지정 (target 없이 사용 가능)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (targetName: string | undefined, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<ArtifactsGlobalOpts>();

    // ── 1. appKey 결정 (spinner 시작 전) ──
    let appKey: string;
    if (opts.appKey) {
      appKey = opts.appKey;
    } else if (targetName) {
      const target = await getDeployTarget(targetName);
      appKey = target.appKey;
    } else {
      throw new NhnCloudCliError(
        "target 이름 또는 --app-key 옵션이 필요합니다. 예: deploy artifacts <target> 또는 deploy artifacts --app-key <appKey>",
        EXIT_PARAM_ERROR,
      );
    }

    // ── 2. 인증 체인 (spinner 시작 전) ──
    const { client } = await createDeployClient(opts.profile);

    // ── 3. API 호출 (spinner 내부, try/catch + leak 방지) ──
    startSpinner("아티팩트 목록 조회 중...");

    let result: Record<string, unknown>;
    try {
      result = await client.artifacts(appKey);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }

    stopSpinner(true);

    // ── 4. 출력 ──
    const list = Array.isArray(result) ? result : [result];
    output(opts, {
      headers: ["key", "value"],
      rows: list.map((item) =>
        Object.entries(item as Record<string, unknown>).map(([k, v]) => `${k}: ${String(v ?? "")}`),
      ).flat().map((line) => [line, ""]),
      raw: result,
      ids: [],
    });
  });
