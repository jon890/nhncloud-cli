import { Command } from "commander";
import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { getDeployTarget } from "../../config/credentials.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { createDeployClient, resolveDeployAppKey } from "./helpers.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

/** 업로드 파일 메모리 폭발 방지용 보수적 상한 (512 MiB) */
const MAX_UPLOAD_BYTES = 512 * 1024 * 1024;

interface UploadGlobalOpts extends OutputOptions {
  file?: string;
  binaryGroup?: string;
  /** Commander `.option(..., "server")` 가 기본값을 보장 — 항상 존재(SSOT). */
  applicationType: string;
  description?: string;
  artifactId?: string;
  profile?: string;
}

/**
 * 옵션 문자열을 양의 정수로 파싱 (011 binaries.ts 와 **동일한 regex 버전** — pitfall 4-4).
 * `Number()` 만 쓰면 `1e2`→100, `0x10`→16, `" 5 "`→5, `""`→0 이 새어 들어오므로 regex 로 표기 자체를 검증한다.
 */
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

export const uploadCommand = new Command("upload")
  .description("로컬 파일을 바이너리 그룹에 업로드한다")
  .argument("<target>", "config.json 에 정의된 deploy target 이름")
  .requiredOption("--file <path>", "업로드할 파일 경로")
  .requiredOption("--binary-group <key>", "업로드 대상 바이너리 그룹 key (binary-groups 로 확인)")
  .option("--application-type <type>", "applicationType (예: server)", "server")
  .option("--description <text>", "바이너리 설명")
  .option("--artifact-id <id>", "target 의 artifactId override")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (targetName: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<UploadGlobalOpts>();

    // ── 1. 입력 검증 (spinner 전, 자격증명 resolve 전 — fail-fast) ──
    const binaryGroupKey = parsePositiveInt(opts.binaryGroup, "--binary-group");
    if (binaryGroupKey === undefined) {
      // requiredOption 이 존재 보장 → 타입 narrowing 용 (빈 문자열 방어)
      throw new NhnCloudCliError("--binary-group 이 필요합니다.", EXIT_PARAM_ERROR);
    }

    // ── 파일 가드: 읽기 전에 statSync 로 errno·파일유형·크기 차단 (code-review-pitfalls 9-1 파일입력) ──
    const filePath = opts.file!; // requiredOption 으로 Commander 가 보장
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(filePath);
    } catch (e) {
      const reason =
        (e as NodeJS.ErrnoException).code ?? (e instanceof Error ? e.message : String(e));
      throw new NhnCloudCliError(
        `--file 을 읽을 수 없습니다: ${filePath} (${reason})`,
        EXIT_PARAM_ERROR,
      );
    }
    if (!stat.isFile()) {
      throw new NhnCloudCliError(`--file 이 일반 파일이 아닙니다: ${filePath}`, EXIT_PARAM_ERROR);
    }
    if (stat.size > MAX_UPLOAD_BYTES) {
      throw new NhnCloudCliError(
        `--file 이 너무 큽니다 (${stat.size} 바이트). 업로드 한도 ${MAX_UPLOAD_BYTES} 바이트.`,
        EXIT_PARAM_ERROR,
      );
    }
    const fileBuffer = readFileSync(filePath);
    const fileName = basename(filePath);

    // ── 2. 좌표 로드 + flag override ──
    const target = await getDeployTarget(targetName);
    const artifactId = opts.artifactId ?? target.artifactId;

    // ── 3. 인증 체인 + appKey 해석 (spinner 시작 전) ──
    const { client, profileName } = await createDeployClient(opts.profile);
    const appKey = await resolveDeployAppKey(profileName);

    // ── 4. 업로드 (spinner 내부, try/catch + leak 방지) ──
    startSpinner("바이너리 업로드 중...");

    let result;
    try {
      result = await client.uploadBinary({
        appKey,
        artifactId,
        binaryGroupKey,
        fileBuffer,
        fileName,
        applicationType: opts.applicationType, // Commander 옵션 기본값 "server" 가 SSOT — dead fallback 제거
        description: opts.description,
      });
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    // ── 5. 출력 (--quiet 는 binaryKey 만 → download 입력으로 연쇄) ──
    output(opts, {
      headers: ["field", "value"],
      rows: [
        ["binaryKey", String(result.binaryKey)],
        ["downloadUrl", result.downloadUrl],
      ],
      raw: result,
      ids: [String(result.binaryKey)],
    });
  });
