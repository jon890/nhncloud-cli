import { Command } from "commander";
import chalk from "chalk";
import { setQuiet } from "./utils/spinner.js";
import { NhnCloudCliError } from "./utils/errors.js";
import { configureCommand } from "./commands/configure.js";
import { searchCommand } from "./commands/logncrash/search.js";
import { sendCommand } from "./commands/logncrash/send.js";
import { exportCommand } from "./commands/logncrash/export.js";
import { runCommand } from "./commands/deploy/run.js";
import { artifactsCommand } from "./commands/deploy/artifacts.js";
import { serverGroupsCommand } from "./commands/deploy/server-groups.js";
import { historiesCommand } from "./commands/deploy/histories.js";
import { binaryGroupsCommand } from "./commands/deploy/binary-groups.js";
import { binariesCommand } from "./commands/deploy/binaries.js";
import { uploadCommand } from "./commands/deploy/upload.js";
import { downloadCommand } from "./commands/deploy/download.js";
import { listCommand } from "./commands/instance/list.js";
import { listCommand as volumeListCommand } from "./commands/volume/list.js";
import { getCommand as volumeGetCommand } from "./commands/volume/get.js";
import { createCommand as volumeCreateCommand } from "./commands/volume/create.js";
import { listCommand as networkListCommand } from "./commands/network/list.js";
import { subnetCommand } from "./commands/network/subnet.js";
import { listCommand as fipListCommand } from "./commands/floatingip/list.js";
import { createCommand as fipCreateCommand } from "./commands/floatingip/create.js";
import { deleteCommand as fipDeleteCommand } from "./commands/floatingip/delete.js";
import { flavorsCommand } from "./commands/instance/flavors.js";
import { availabilityZonesCommand } from "./commands/instance/availability-zones.js";
import { getCommand } from "./commands/instance/get.js";
import { createCommand } from "./commands/instance/create.js";
import { deleteCommand } from "./commands/instance/delete.js";
import { startCommand, stopCommand, rebootCommand } from "./commands/instance/power.js";
import { resizeCommand, resizeConfirmCommand, resizeRevertCommand } from "./commands/instance/resize.js";
import { imagesCommand } from "./commands/instance/images.js";
import { keypairsCommand } from "./commands/instance/keypairs.js";
import { keypairCommand } from "./commands/instance/keypair.js";
import { volumeCommand as instanceVolumeCommand } from "./commands/instance/volume.js";
import { volumesCommand } from "./commands/instance/volumes.js";

const program = new Command();

program
  .name("nhncloud")
  .description("NHN Cloud CLI — AI agent & terminal friendly")
  .version("0.3.0")
  .option("--json", "JSON 형식으로 출력")
  .option("--quiet", "최소 출력 (자동화용)")
  .option("--no-color", "색상 비활성화");

// 전역 옵션 훅 — no-color: chalk 비활성화 / json·quiet: spinner 비활성화
program.hook("preAction", () => {
  const opts = program.opts<{ color: boolean; json?: boolean; quiet?: boolean }>();
  if (!opts.color || process.env["NO_COLOR"]) {
    chalk.level = 0;
  }
  if (opts.json || opts.quiet) {
    setQuiet(true);
  }
});

// configure 명령
program.addCommand(configureCommand);

// logncrash 커맨드 그룹
const logncrashCommand = new Command("logncrash").description("Log & Crash 관련 명령");
logncrashCommand.addCommand(searchCommand);
logncrashCommand.addCommand(sendCommand);
logncrashCommand.addCommand(exportCommand);

program.addCommand(logncrashCommand);

// deploy 커맨드 그룹
const deployCommand = new Command("deploy").description("NHN Cloud Deploy 관련 명령");
deployCommand.addCommand(runCommand);
deployCommand.addCommand(artifactsCommand);
deployCommand.addCommand(serverGroupsCommand);
deployCommand.addCommand(historiesCommand);
deployCommand.addCommand(binaryGroupsCommand);
deployCommand.addCommand(binariesCommand);
deployCommand.addCommand(uploadCommand);
deployCommand.addCommand(downloadCommand);

program.addCommand(deployCommand);

// instance 커맨드 그룹
const instanceCommand = new Command("instance").description("Compute 인스턴스 관련 명령");
instanceCommand.addCommand(listCommand);
instanceCommand.addCommand(flavorsCommand);
instanceCommand.addCommand(availabilityZonesCommand);
instanceCommand.addCommand(getCommand);
instanceCommand.addCommand(createCommand);
instanceCommand.addCommand(deleteCommand);
instanceCommand.addCommand(startCommand);
instanceCommand.addCommand(stopCommand);
instanceCommand.addCommand(rebootCommand);
instanceCommand.addCommand(resizeCommand);
instanceCommand.addCommand(resizeConfirmCommand);
instanceCommand.addCommand(resizeRevertCommand);
instanceCommand.addCommand(imagesCommand);
instanceCommand.addCommand(keypairsCommand);
instanceCommand.addCommand(keypairCommand);
instanceCommand.addCommand(instanceVolumeCommand); // instance volume attach/detach
instanceCommand.addCommand(volumesCommand);        // instance volumes

program.addCommand(instanceCommand);

// network 커맨드 그룹
const networkCommand = new Command("network").description("VPC·서브넷 조회");
networkCommand.addCommand(networkListCommand);
networkCommand.addCommand(subnetCommand);

program.addCommand(networkCommand);

// volume 커맨드 그룹
const volumeCommand = new Command("volume").description("Block Storage 볼륨 관련 명령");
volumeCommand.addCommand(volumeListCommand);
volumeCommand.addCommand(volumeGetCommand);
volumeCommand.addCommand(volumeCreateCommand);

program.addCommand(volumeCommand);

// floatingip 커맨드 그룹
const floatingipCommand = new Command("floatingip").description(
  "Floating IP(인스턴스 공인 IP) 관리",
);
floatingipCommand.addCommand(fipListCommand);
floatingipCommand.addCommand(fipCreateCommand);
floatingipCommand.addCommand(fipDeleteCommand);

program.addCommand(floatingipCommand);

program.parseAsync().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  const exitCode = err instanceof NhnCloudCliError ? err.exitCode : 1;
  process.stderr.write(chalk.red(`오류: ${message}`) + "\n");
  process.exit(exitCode);
});
