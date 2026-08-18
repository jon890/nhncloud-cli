import { Command } from "commander";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { createDeployClient, requireCoordinate, resolveDeployAppKey } from "./helpers.js";
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
  .option("--artifact-id <id>", "배포할 아티팩트 ID (artifacts 로 확인)")
  .option("--server-group-id <id>", "배포 대상 서버그룹 ID (server-groups 로 확인)")
  .option("--scenario-ids <csv>", "실행할 시나리오 ID 목록 (쉼표 구분)")
  .option("--target-hosts <csv>", "대상 호스트 (생략 시 서버그룹 전체)")
  .option("--concurrent <n>", "병렬 배포 수 (기본 1)", "1")
  .option("--next-when-fail", "시나리오 실패 시에도 진행")
  .option("--note <s>", "배포 메모")
  .option("--async", "즉시 반환 (기본은 완료 대기)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<RunGlobalOpts>();

    // ── 1. 입력 검증 (spinner 전, 자격증명 resolve 전 — fail-fast) ──
    const concurrentNum = parsePositiveIntegerOption(opts.concurrent ?? "1", "--concurrent");
    const artifactId = requireCoordinate(opts.artifactId, "--artifact-id");
    const serverGroupId = requireCoordinate(opts.serverGroupId, "--server-group-id");
    const scenarioIds = requireCoordinate(opts.scenarioIds, "--scenario-ids");

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
