import { Command } from "commander";
import { getDeployTarget } from "../../config/credentials.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { createDeployClient, resolveDeployAppKey } from "./helpers.js";
import { parsePositiveIntegerOption } from "../parse-options.js";

interface RunGlobalOpts extends OutputOptions {
  artifactId?: string;
  serverGroupId?: string;
  scenarioIds?: string;
  targetHosts?: string;
  concurrent?: string;
  nextWhenFail?: boolean;
  note?: string;
  async?: boolean;
  profile?: string;
}

export const runCommand = new Command("run")
  .description("배포를 실행한다")
  .argument("<target>", "config.json 에 정의된 deploy target 이름")
  .option("--artifact-id <id>", "target 의 artifactId override")
  .option("--server-group-id <id>", "target 의 serverGroupId override")
  .option("--scenario-ids <csv>", "target 의 scenarioIds override")
  .option("--target-hosts <csv>", "대상 호스트 (생략 시 서버그룹 전체)")
  .option("--concurrent <n>", "병렬 배포 수 (기본 1)", "1")
  .option("--next-when-fail", "시나리오 실패 시에도 진행")
  .option("--note <s>", "배포 메모")
  .option("--async", "즉시 반환 (기본은 완료 대기)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (targetName: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<RunGlobalOpts>();
    const concurrentNum = parsePositiveIntegerOption(opts.concurrent ?? "1", "--concurrent");

    // ── 1. 좌표 로드 + flag override (spinner 시작 전) ──
    const target = await getDeployTarget(targetName);
    const artifactId = opts.artifactId ?? target.artifactId;
    const serverGroupId = opts.serverGroupId ?? target.serverGroupId;
    const scenarioIds = opts.scenarioIds ?? target.scenarioIds;

    // ── 2. 인증 체인 + appKey 해석 (spinner 시작 전) ──
    const { client, profileName } = await createDeployClient(opts.profile);
    const appKey = await resolveDeployAppKey(profileName);

    // ── 3. 배포 실행 (spinner 내부, try/catch + leak 방지) ──
    startSpinner("배포 실행 중...");

    let result: Record<string, unknown>;
    try {
      result = await client.run({
        appKey,
        artifactId,
        serverGroupId,
        scenarioIds,
        targetHosts: opts.targetHosts,
        concurrentNum,
        nextWhenFail: opts.nextWhenFail ?? false,
        deployNote: opts.note,
        async: opts.async ?? false,
      });
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
