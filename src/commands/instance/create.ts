import { Command } from "commander";
import { readFileSync } from "node:fs";
import chalk from "chalk";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { resolveInstanceClient } from "./helpers.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import type { Server } from "../../services/instance/types.js";

interface CreateGlobalOpts extends OutputOptions {
  name?: string;
  flavor?: string;
  image?: string;
  network?: string[];
  bootVolumeSize?: string;
  keyName?: string;
  securityGroup?: string[];
  ephemeralDiskSize?: string;
  protect?: boolean;
  userData?: string;
  wait?: boolean;
  timeout?: string;
  region?: string;
  profile?: string;
}

function getFirstIp(server: Server): string {
  for (const list of Object.values(server.addresses)) {
    for (const addr of list) {
      return addr.addr;
    }
  }
  return "";
}

function getIps(server: Server): string {
  return Object.values(server.addresses)
    .flat()
    .map((a) => a.addr)
    .join(", ");
}

function getImageId(server: Server): string {
  return typeof server.image === "object" ? server.image.id : "";
}

export const createCommand = new Command("create")
  .description("인스턴스를 생성한다")
  .requiredOption("--name <name>", "인스턴스 이름")
  .requiredOption("--flavor <id>", "flavor ID")
  .requiredOption("--image <id>", "이미지 ID")
  .requiredOption("--network <uuid>", "네트워크 UUID (여러 개: 반복 지정)", (v, prev: string[]) => [...prev, v], [] as string[])
  .option("--boot-volume-size <gb>", "boot-from-volume root 볼륨 크기 (GB). GPU(g2) 등 boot-from-volume 필수 flavor 에 지정")
  .option("--key-name <name>", "키페어 이름")
  .option("--security-group <name>", "보안 그룹 이름 (여러 개: 반복 지정)", (v, prev: string[]) => [...prev, v], [] as string[])
  .option("--ephemeral-disk-size <gb>", "임시 디스크 크기 (GB, NHN 확장)")
  .option("--protect", "삭제 방지 설정 (NHN 확장)")
  .option("--user-data <path>", "cloud-init user-data 파일 경로 (base64 인코딩해 주입, 인코딩 후 65535 바이트 한도)")
  .option("--wait", "ACTIVE 상태가 될 때까지 대기")
  .option("--timeout <sec>", "wait 타임아웃 (초, 기본 300)", "300")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<CreateGlobalOpts>();

    // ── 1. 파라미터 검증 ──
    const networks = opts.network ?? [];
    if (networks.length === 0) {
      throw new NhnCloudCliError("--network 는 최소 1개 필요합니다.", EXIT_PARAM_ERROR);
    }

    // ── user-data: 파일 읽기 + base64 인코딩 + 한도 검증 (spinner 전, fail-fast) ──
    let userDataBase64: string | undefined;
    if (opts.userData !== undefined) {
      let raw: Buffer;
      try {
        raw = readFileSync(opts.userData);
      } catch {
        throw new NhnCloudCliError(
          `--user-data 파일을 읽을 수 없습니다: ${opts.userData}`,
          EXIT_PARAM_ERROR,
        );
      }
      userDataBase64 = raw.toString("base64");
      // base64 출력은 ASCII → .length 가 곧 바이트 수. docs: 인코딩 후 65535 바이트 한도 ([[adr-012]])
      if (userDataBase64.length > 65535) {
        throw new NhnCloudCliError(
          `--user-data 가 base64 인코딩 후 65535 바이트를 초과합니다 (${userDataBase64.length} 바이트). cloud-init 내용을 줄이세요.`,
          EXIT_PARAM_ERROR,
        );
      }
    }

    const timeoutMs = parseInt(opts.timeout ?? "300", 10) * 1000;

    // ── 2. 자격증명 + token 획득 (spinner 시작 전) ──
    const { client } = await resolveInstanceClient(opts);

    // ── 3. 생성 요청 (spinner 내부) ──
    startSpinner("인스턴스 생성 중...");

    let server: Server;
    try {
      // requiredOption 으로 Commander 가 보장 → non-null assertion 안전
      server = await client.create({
        name: opts.name!,
        flavorRef: opts.flavor!,
        imageRef: opts.image!,
        networks,
        bootVolumeSize: opts.bootVolumeSize !== undefined ? parseInt(opts.bootVolumeSize, 10) : undefined,
        keyName: opts.keyName,
        securityGroups: opts.securityGroup && opts.securityGroup.length > 0 ? opts.securityGroup : undefined,
        ephemeralDiskSize: opts.ephemeralDiskSize !== undefined ? parseInt(opts.ephemeralDiskSize, 10) : undefined,
        protect: opts.protect,
        userDataBase64,
      });
    } catch (err) {
      stopSpinner(false);
      throw err;
    }

    stopSpinner(true);

    // ── 4. --wait: ACTIVE 폴링 ──
    if (opts.wait) {
      startSpinner(`ACTIVE 대기 중... (id: ${server.id})`);
      try {
        server = await client.waitForActive(server.id, { timeoutMs });
      } catch (err) {
        stopSpinner(false);
        throw err;
      }
      stopSpinner(true, `ACTIVE 확인 (id: ${server.id})`);
    }

    // ── 5. 출력 ──
    if (opts.quiet && opts.wait) {
      // --quiet --wait 조합: 첫 IP 한 줄만 stdout (CI 파이프용)
      const ip = getFirstIp(server);
      if (ip) process.stdout.write(ip + "\n");
      return;
    }

    if (opts.wait) {
      process.stderr.write(chalk.green(`  IP: ${getIps(server)}\n`));
    }

    const rows: string[][] = [
      ["id", server.id],
      ["name", server.name],
      ["status", server.status],
      ["IPs", getIps(server)],
      ["flavor", server.flavor.id],
      ["image", getImageId(server)],
    ];

    output(opts, {
      headers: ["field", "value"],
      rows,
      raw: server,
      ids: [server.id],
    });
  });
