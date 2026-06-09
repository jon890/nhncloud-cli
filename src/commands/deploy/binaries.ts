import { Command } from "commander";
import { getDeployTarget } from "../../config/credentials.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { createDeployClient } from "./helpers.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

interface BinariesGlobalOpts extends OutputOptions {
  binaryGroup?: string;
  pageNum?: string;
  pageSize?: string;
  sortKey?: string;
  sortDirection?: string;
  appKey?: string;
  artifactId?: string;
  profile?: string;
}

/** 옵션 문자열을 양의 정수로 파싱. 비숫자·0 이하면 EXIT_PARAM_ERROR. */
function parsePositiveInt(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new NhnCloudCliError(`${flag} 는 1 이상의 정수여야 합니다 (입력: ${value}).`, EXIT_PARAM_ERROR);
  }
  return n;
}

export const binariesCommand = new Command("binaries")
  .description("특정 바이너리 그룹의 바이너리 목록을 조회한다")
  .argument("<target>", "config.json 에 정의된 deploy target 이름")
  .requiredOption("--binary-group <key>", "조회할 바이너리 그룹 key (binary-groups 로 확인)")
  .option("--page-num <n>", "페이지 번호 (1 이상)")
  .option("--page-size <n>", "페이지 크기 (1 이상)")
  .option("--sort-key <k>", "정렬 기준 (예: UPLOAD_DATE)")
  .option("--sort-direction <d>", "정렬 방향 (예: DESC)")
  .option("--app-key <k>", "target 의 appKey override")
  .option("--artifact-id <id>", "target 의 artifactId override")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (targetName: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<BinariesGlobalOpts>();

    // ── 1. 입력 검증 (spinner 전, 자격증명 resolve 전 — fail-fast) ──
    const binaryGroupKey = parsePositiveInt(opts.binaryGroup, "--binary-group");
    if (binaryGroupKey === undefined) {
      // requiredOption 이 존재는 보장하므로 사실상 도달 불가 — 타입 narrowing 용
      throw new NhnCloudCliError("--binary-group 이 필요합니다.", EXIT_PARAM_ERROR);
    }
    const pageNum = parsePositiveInt(opts.pageNum, "--page-num");
    const pageSize = parsePositiveInt(opts.pageSize, "--page-size");

    // ── 2. 좌표 로드 + flag override ──
    const target = await getDeployTarget(targetName);
    const appKey = opts.appKey ?? target.appKey;
    const artifactId = opts.artifactId ?? target.artifactId;

    // ── 3. 인증 체인 (spinner 시작 전) ──
    const { client } = await createDeployClient(opts.profile);

    // ── 4. API 호출 (spinner 내부, try/catch + leak 방지) ──
    startSpinner("바이너리 목록 조회 중...");

    let result;
    try {
      result = await client.binaries(appKey, artifactId, binaryGroupKey, {
        pageNum,
        pageSize,
        sortKey: opts.sortKey,
        sortDirection: opts.sortDirection,
      });
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    // ── 5. 출력 (0건도 output() 한 경로로 — 7-2; binarySize 단위는 bytes 헤더 명시) ──
    output(opts, {
      headers: ["binaryKey", "version", "binaryName", "size(bytes)", "uploadDate", "uploader"],
      rows: result.binaries.map((b) => [
        String(b.binaryKey),
        b.version,
        b.binaryName,
        String(b.binarySize),
        b.uploadDate,
        b.uploader,
      ]),
      // raw 에 totalCount 포함 → --json 으로 페이지 정보 확인 가능
      raw: result,
      ids: result.binaries.map((b) => String(b.binaryKey)),
    });
  });
