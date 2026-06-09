import { Command } from "commander";
import { getDeployTarget } from "../../config/credentials.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { createDeployClient } from "./helpers.js";

interface BinaryGroupsGlobalOpts extends OutputOptions {
  appKey?: string;
  artifactId?: string;
  profile?: string;
}

export const binaryGroupsCommand = new Command("binary-groups")
  .description("바이너리 그룹 목록을 조회한다")
  .argument("<target>", "config.json 에 정의된 deploy target 이름")
  .option("--app-key <k>", "target 의 appKey override")
  .option("--artifact-id <id>", "target 의 artifactId override")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (targetName: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<BinaryGroupsGlobalOpts>();

    // ── 1. 좌표 로드 + flag override (spinner 시작 전) ──
    const target = await getDeployTarget(targetName);
    const appKey = opts.appKey ?? target.appKey;
    const artifactId = opts.artifactId ?? target.artifactId;

    // ── 2. 인증 체인 (spinner 시작 전) ──
    const { client } = await createDeployClient(opts.profile);

    // ── 3. API 호출 (spinner 내부, try/catch + leak 방지) ──
    startSpinner("바이너리 그룹 목록 조회 중...");

    let groups;
    try {
      groups = await client.binaryGroups(appKey, artifactId);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    // ── 4. 출력 (0건도 output() 한 경로로 — 7-2) ──
    output(opts, {
      headers: ["key", "name", "regionCode", "createDate", "description"],
      rows: groups.map((g) => [
        String(g.key),
        g.name,
        g.regionCode,
        g.createDate,
        g.description,
      ]),
      raw: groups,
      // ids 에 key 를 넣어 --quiet 시 그룹 key 만 출력 → binaries --binary-group 에 파이프 가능
      ids: groups.map((g) => String(g.key)),
    });
  });
