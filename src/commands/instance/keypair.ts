import { Command } from "commander";
import { readFileSync, statSync, writeFileSync, renameSync } from "node:fs";
import { randomBytes } from "node:crypto";
import chalk from "chalk";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { resolveInstanceClient } from "./helpers.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import type { KeypairDetail, CreateKeypairResult } from "../../services/instance/types.js";

interface KeypairGlobalOpts extends OutputOptions {
  region?: string;
  profile?: string;
}

interface CreateKeypairOpts extends KeypairGlobalOpts {
  publicKey?: string;
  output?: string;
}

// ── --public-key 해석 ─────────────────────────────────────────────────────────

/** --public-key 값 해석: 존재하는 파일이면 내용, 아니면 인라인 문자열. */
function resolvePublicKey(value: string): string {
  let stat: ReturnType<typeof statSync> | undefined;
  try {
    stat = statSync(value);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    // ENOENT = 파일 아님 → 인라인 문자열로 간주 (정상 경로). 그 외 errno(EACCES 등)는 노출.
    if (err.code && err.code !== "ENOENT") {
      throw new NhnCloudCliError(
        `--public-key 파일을 읽을 수 없습니다: ${value} (${err.code})`,
        EXIT_PARAM_ERROR,
      );
    }
    return value; // 파일 없음 → 인라인 공개키 문자열
  }
  if (!stat.isFile()) {
    // 디렉터리 등 → 인라인 문자열로 오인하면 위험하므로 명시적 에러
    throw new NhnCloudCliError(`--public-key 가 일반 파일이 아닙니다: ${value}`, EXIT_PARAM_ERROR);
  }
  return readFileSync(value, "utf-8").trim();
}

// ── private_key 0600 원자 저장 ────────────────────────────────────────────────

/** private_key 를 mode 0600 으로 원자적으로 저장한다 (temp + rename). */
function savePrivateKey(filePath: string, privateKey: string): void {
  const tmp = `${filePath}.${randomBytes(4).toString("hex")}.tmp`;
  const content = privateKey.endsWith("\n") ? privateKey : privateKey + "\n";
  try {
    writeFileSync(tmp, content, { encoding: "utf-8", mode: 0o600 });
    renameSync(tmp, filePath);
  } catch (e) {
    const reason = (e as NodeJS.ErrnoException).code ?? (e instanceof Error ? e.message : String(e));
    throw new NhnCloudCliError(
      `private_key 파일을 저장할 수 없습니다: ${filePath} (${reason})`,
      EXIT_PARAM_ERROR,
    );
  }
}

// ── keypair get ───────────────────────────────────────────────────────────────

const getKeypairCmd = new Command("get")
  .description("단일 키페어를 조회한다")
  .argument("<name>", "키페어 이름")
  .option("--region <region>", "region override")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (name: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<KeypairGlobalOpts>();
    const { client } = await resolveInstanceClient(opts);

    startSpinner("키페어 조회 중...");
    let kp: KeypairDetail;
    try {
      kp = await client.getKeypair(name);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    output(opts, {
      headers: ["field", "value"],
      rows: [
        ["name", kp.name],
        ["fingerprint", kp.fingerprint],
        ["user_id", kp.user_id],
        ["created_at", kp.created_at],
        ["public_key", kp.public_key],
      ],
      raw: kp,
      ids: [kp.name],
    });
  });

// ── keypair create ────────────────────────────────────────────────────────────

const createKeypairCmd = new Command("create")
  .description("키페어를 생성한다 (--public-key 미지정 시 NHN 이 키쌍 생성 — private_key 1회성)")
  .argument("<name>", "키페어 이름")
  .option("--public-key <path|key>", "기존 공개키 (파일 경로 또는 키 문자열). 지정 시 private_key 미반환")
  .option("-o, --output <keyfile>", "생성된 private_key 를 파일(mode 0600)로 저장")
  .option("--region <region>", "region override")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (name: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<CreateKeypairOpts>();

    // ── 1. 입력 검증 (spinner·자격증명 resolve 전 — fail-fast) ──
    const publicKey = opts.publicKey !== undefined ? resolvePublicKey(opts.publicKey) : undefined;

    // --output 과 --public-key 동시 지정은 모순 (등록은 private_key 안 옴)
    if (opts.output !== undefined && publicKey !== undefined) {
      throw new NhnCloudCliError(
        "--output 은 NHN 이 키를 생성할 때만 의미가 있습니다. --public-key 와 함께 쓸 수 없습니다.",
        EXIT_PARAM_ERROR,
      );
    }

    // (c) 생성 경로(public-key 미지정) + --quiet + --output 미지정 → private_key 는 1회만 반환됩니다.
    // NHN 생성 키는 1회성이라 stdout 억제 + 파일 미저장이면 복구 불가하게 사라진다 → 사전 거부.
    if (publicKey === undefined && opts.quiet && opts.output === undefined) {
      throw new NhnCloudCliError(
        "NHN 이 생성하는 private_key 는 1회만 반환됩니다. --quiet 로 생성할 때는 --output <keyfile> 로 저장 경로를 지정하세요 (미지정 시 키 유실).",
        EXIT_PARAM_ERROR,
      );
    }

    // ── 2. 자격증명 + token ──
    const { client } = await resolveInstanceClient(opts);

    // ── 3. 생성 (spinner 내부) ──
    startSpinner("키페어 생성 중...");
    let result: CreateKeypairResult;
    try {
      result = await client.createKeypair({ name, publicKey });
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    // ── 4. private_key 처리 (1회성 — 절대 조용히 잃지 않는다) ──
    if (result.private_key !== undefined) {
      if (opts.output !== undefined) {
        try {
          savePrivateKey(opts.output, result.private_key);
          process.stderr.write(chalk.green(`  private_key 를 ${opts.output} 에 저장했습니다 (mode 0600).\n`));
        } catch (saveErr) {
          // (b) 저장 실패 — private_key 는 1회성이라 여기서 잃으면 영구 복구 불가.
          // temp 를 지우지 않고(마지막 사본 파괴 방지) stdout 으로 출력해 유실을 막는다.
          const reason = saveErr instanceof Error ? saveErr.message : String(saveErr);
          process.stderr.write(
            chalk.red(`  ⚠ private_key 파일 저장 실패 (${reason}). 유실 방지를 위해 아래에 출력합니다 — 즉시 안전한 곳에 보관하세요.\n`),
          );
          process.stdout.write(result.private_key + "\n");
        }
      } else {
        // 한 번만 표시됨 — stderr 경고 + stdout 출력. (--quiet + 미저장 조합은 위 입력검증에서 이미 차단됨)
        process.stderr.write(
          chalk.yellow("  ⚠ private_key 는 지금 한 번만 표시됩니다. 분실 시 복구 불가 — 안전한 곳에 보관하세요.\n"),
        );
        process.stdout.write(result.private_key + "\n");
      }
    }

    // ── 5. 메타 출력 (private_key 제외 — json 출력에도 노출 최소화) ──
    const { private_key, ...meta } = result;
    void private_key; // 의도적 미사용 — destructuring 으로 분리해 raw 에서 제외
    output(opts, {
      headers: ["field", "value"],
      rows: [
        ["name", meta.name],
        ["fingerprint", meta.fingerprint],
        ["user_id", meta.user_id],
      ],
      raw: meta,
      ids: [meta.name],
    });
  });

// ── keypair delete ────────────────────────────────────────────────────────────

const deleteKeypairCmd = new Command("delete")
  .description("키페어를 삭제한다")
  .argument("<name>", "키페어 이름")
  .option("--region <region>", "region override")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (name: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<KeypairGlobalOpts>();
    const { client } = await resolveInstanceClient(opts);

    startSpinner("키페어 삭제 중...");
    try {
      await client.deleteKeypair(name);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true, `키페어 삭제 완료: ${name}`);

    if (!opts.quiet) process.stdout.write(`deleted: ${name}\n`);
  });

// ── keypair 그룹 ──────────────────────────────────────────────────────────────

export const keypairCommand = new Command("keypair")
  .description("키페어 단건 관리 (get / create / delete)")
  .addCommand(getKeypairCmd)
  .addCommand(createKeypairCmd)
  .addCommand(deleteKeypairCmd);
