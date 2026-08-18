import { Command } from "commander";
import { statSync, writeFileSync } from "node:fs";
import chalk from "chalk";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import type { OutputOptions } from "../../formatters/table.js";
import { createDeployClient, requireCoordinate, resolveDeployAppKey } from "./helpers.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

interface DownloadGlobalOpts extends OutputOptions {
  binaryGroup?: string;
  binaryKey?: string;
  output?: string;
  force?: boolean;
  artifactId?: string;
  profile?: string;
}

/** 옵션 문자열을 양의 정수로 파싱 (011 binaries.ts 와 동일한 regex 버전 — pitfall 4-4). */
function parsePositiveInt(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  if (!/^[1-9]\d*$/.test(value)) {
    throw new NhnCloudCliError(
      `${flag} 는 1 이상의 정수여야 합니다 (입력: ${JSON.stringify(value)}).`,
      EXIT_PARAM_ERROR,
    );
  }
  return Number(value);
}

/** 대상 경로가 이미 존재하면(파일/디렉터리 무관) --force 없이는 거부. ENOENT 만 정상. */
function assertWritable(path: string, force: boolean): void {
  if (force) return;
  try {
    statSync(path);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return; // 없음 = 정상
    const reason =
      (e as NodeJS.ErrnoException).code ?? (e instanceof Error ? e.message : String(e));
    throw new NhnCloudCliError(
      `-o 경로를 확인할 수 없습니다: ${path} (${reason})`,
      EXIT_PARAM_ERROR,
    );
  }
  // statSync 성공 = 이미 존재
  throw new NhnCloudCliError(
    `-o 대상이 이미 존재합니다: ${path}. 덮어쓰려면 --force 를 쓰세요.`,
    EXIT_PARAM_ERROR,
  );
}

export const downloadCommand = new Command("download")
  .description("바이너리를 로컬 파일로 다운로드한다")
  .requiredOption("--binary-group <key>", "바이너리 그룹 key (binary-groups 로 확인)")
  .requiredOption("--binary-key <key>", "다운로드할 바이너리 key (binaries 또는 upload 로 확인)")
  .requiredOption("-o, --output <file>", "저장할 파일 경로")
  .option("--force", "대상 파일이 있으면 덮어쓴다")
  .option("--artifact-id <id>", "대상 아티팩트 ID (artifacts 로 확인)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<DownloadGlobalOpts>();

    // ── 1. 입력 검증 (spinner 전 — fail-fast) ──
    const binaryGroupKey = parsePositiveInt(opts.binaryGroup, "--binary-group");
    const binaryKey = parsePositiveInt(opts.binaryKey, "--binary-key");
    if (binaryGroupKey === undefined || binaryKey === undefined) {
      // requiredOption 이 존재 보장 → narrowing 용
      throw new NhnCloudCliError("--binary-group / --binary-key 가 필요합니다.", EXIT_PARAM_ERROR);
    }
    const artifactId = requireCoordinate(opts.artifactId, "--artifact-id");
    const outPath = opts.output!; // requiredOption 보장
    assertWritable(outPath, opts.force ?? false); // 덮어쓰기 정책 — 네트워크 호출 전 차단

    // ── 2. 인증 체인 + appKey 해석 (spinner 시작 전) ──
    const { client, profileName } = await createDeployClient(opts.profile);
    const appKey = await resolveDeployAppKey(profileName);

    // ── 3. 다운로드 + 파일 쓰기 (spinner 내부, try/catch + leak 방지) ──
    startSpinner("바이너리 다운로드 중...");

    try {
      const buffer = await client.downloadBinary(appKey, artifactId, binaryGroupKey, binaryKey);
      writeFileSync(outPath, buffer); // 봉투 우회 — 파일 스트림 저장 경로
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    // ── 4. 결과 안내 (데이터=파일이므로 stdout 으로 본문 출력 없음. 경로/크기는 stderr) ──
    if (!opts.quiet) {
      process.stderr.write(chalk.green(`  저장됨: ${outPath}\n`));
    }
  });
