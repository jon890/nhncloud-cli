import { Command } from "commander";
import chalk from "chalk";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { resolveNetworkClient } from "../network/helpers.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

interface CreateGlobalOpts extends OutputOptions {
  network?: string;
  region?: string;
  profile?: string;
}

export const createCommand = new Command("create")
  .description("Floating IP 를 발급한다 (--network 미지정 시 외부 VPC 자동 조회)")
  .option("--network <id>", "외부 네트워크(VPC) id (미지정 시 router:external=true 자동 조회)")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<CreateGlobalOpts>();

    // ── 1. 자격증명 + token 획득 (spinner 시작 전) ──
    const { client } = await resolveNetworkClient(opts);

    let networkId = opts.network;

    // ── 2a. --network 미지정 시 외부 VPC 자동 조회 (1단계 spinner) ──
    if (networkId === undefined) {
      startSpinner("외부 네트워크 조회 중...");
      try {
        const found = await client.findExternalNetworkId();
        if (found === null) {
          throw new NhnCloudCliError(
            "외부 네트워크(router:external=true)를 찾지 못했습니다. --network <id> 로 직접 지정하세요.",
            EXIT_PARAM_ERROR,
          );
        }
        networkId = found;
      } catch (err) {
        stopSpinner(false);
        throw err;
      }
      stopSpinner(true); // 두 번째 spinner 전에 첫 spinner 닫기 (1-2 다단계)
    }

    // ── 2b. Floating IP 발급 (2단계 spinner) ──
    startSpinner(`Floating IP 발급 중... (network: ${networkId})`);
    let fip;
    try {
      fip = await client.createFloatingIp({ floating_network_id: networkId });
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    process.stderr.write(
      chalk.green(`✓ Floating IP "${fip.floating_ip_address}" 를 발급했습니다 (id: ${fip.id}).\n`),
    );
    output(opts, {
      headers: ["id", "floating_ip_address", "status", "floating_network_id"],
      rows: [[fip.id, fip.floating_ip_address, fip.status, fip.floating_network_id]],
      raw: fip,
      ids: [fip.id],
    });
  });
