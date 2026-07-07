import { Command } from "commander";
import chalk from "chalk";
import { setQuiet } from "./utils/spinner.js";
import { NhnCloudCliError } from "./utils/errors.js";
import { configureCommand } from "./commands/configure.js";
import { skillsCommand } from "./commands/skills.js";
import { doctorCommand } from "./commands/doctor.js";
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
import { listCommand as ncrListCommand } from "./commands/ncr/list.js";
import { getCommand as ncrGetCommand } from "./commands/ncr/get.js";
import { imagesCommand as ncrImagesCommand } from "./commands/ncr/images.js";
import { tagsCommand as ncrTagsCommand } from "./commands/ncr/tags.js";
import { createCommandsCommand } from "./commands/commands.js";
import { supportsCommand as nksSupportsCommand } from "./commands/nks/supports.js";
import { clusterCommand as nksClusterCommand } from "./commands/nks/cluster.js";
import { nodegroupCommand as nksNodegroupCommand } from "./commands/nks/nodegroup.js";
import { addonCommand as nksAddonCommand, addonTypeCommand as nksAddonTypeCommand } from "./commands/nks/addon.js";
import { templateCommand as ncsTemplateCommand } from "./commands/ncs/template.js";
import { workloadCommand as ncsWorkloadCommand } from "./commands/ncs/workload.js";
import { malwareCommand as ncsMalwareCommand } from "./commands/ncs/malware.js";

const rootAgentHints = `
Agent hints:
  - Prefer --json for structured output.
  - Use --quiet only when the command documents an identifier output.
  - Use --profile <name> to avoid relying on default profile.
  - For IaaS/NKS commands, use --region <region> when region matters.
  - Run "nhncloud commands --json" to inspect command paths and options.
`;

const logncrashAgentWorkflow = `
Agent workflow:
  1. nhncloud logncrash search --query '*' --from 1h --to now --json
  2. nhncloud logncrash export --query '<lucene>' --from 1h --to now --output logs.jsonl
`;

const deployAgentWorkflow = `
Agent workflow:
  1. nhncloud deploy artifacts <target> --json
  2. nhncloud deploy server-groups <target> --json
  3. nhncloud deploy run <target>
`;

const instanceAgentWorkflow = `
Agent workflow:
  1. nhncloud instance images --json
  2. nhncloud instance flavors --detail --json
  3. nhncloud instance list --json
`;

const networkAgentWorkflow = `
Agent workflow:
  1. nhncloud network list --json
  2. nhncloud network subnet list --json
`;

const volumeAgentWorkflow = `
Agent workflow:
  1. nhncloud volume list --json
  2. nhncloud volume get <volume-id> --json
`;

const floatingIpAgentWorkflow = `
Agent workflow:
  1. nhncloud floatingip list --json
  2. nhncloud floatingip create --json
`;

const ncrAgentWorkflow = `
Agent workflow:
  1. nhncloud ncr list --json
  2. nhncloud ncr images <registry> --json
  3. nhncloud ncr tags <registry> <repository> --json
`;

const nksAgentWorkflow = `
Agent workflow:
  1. nhncloud nks supports --json
  2. nhncloud nks cluster list --json
  3. nhncloud nks cluster get <cluster> --json
`;

const ncsAgentWorkflow = `
Agent workflow:
  1. nhncloud ncs template list --json
  2. nhncloud ncs workload list --json
  3. nhncloud ncs workload get <id> --json
`;

const program = new Command();

program
  .name("nhncloud")
  .description("NHN Cloud CLI — AI agent & terminal friendly")
  .version("0.8.0")
  .option("--json", "JSON 형식으로 출력")
  .option("--quiet", "최소 출력 (자동화용)")
  .option("--no-color", "색상 비활성화")
  .addHelpText("after", rootAgentHints);

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
const logncrashCommand = new Command("logncrash")
  .description("Log & Crash 관련 명령")
  .addHelpText("after", logncrashAgentWorkflow);
logncrashCommand.addCommand(searchCommand);
logncrashCommand.addCommand(sendCommand);
logncrashCommand.addCommand(exportCommand);

program.addCommand(logncrashCommand);

// deploy 커맨드 그룹
const deployCommand = new Command("deploy")
  .description("NHN Cloud Deploy 관련 명령")
  .addHelpText("after", deployAgentWorkflow);
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
const instanceCommand = new Command("instance")
  .description("Compute 인스턴스 관련 명령")
  .addHelpText("after", instanceAgentWorkflow);
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
const networkCommand = new Command("network")
  .description("VPC·서브넷 조회")
  .addHelpText("after", networkAgentWorkflow);
networkCommand.addCommand(networkListCommand);
networkCommand.addCommand(subnetCommand);

program.addCommand(networkCommand);

// volume 커맨드 그룹
const volumeCommand = new Command("volume")
  .description("Block Storage 볼륨 관련 명령")
  .addHelpText("after", volumeAgentWorkflow);
volumeCommand.addCommand(volumeListCommand);
volumeCommand.addCommand(volumeGetCommand);
volumeCommand.addCommand(volumeCreateCommand);

program.addCommand(volumeCommand);

// floatingip 커맨드 그룹
const floatingipCommand = new Command("floatingip").description(
  "Floating IP(인스턴스 공인 IP) 관리",
).addHelpText("after", floatingIpAgentWorkflow);
floatingipCommand.addCommand(fipListCommand);
floatingipCommand.addCommand(fipCreateCommand);
floatingipCommand.addCommand(fipDeleteCommand);

program.addCommand(floatingipCommand);

// ncr 커맨드 그룹
const ncrCommand = new Command("ncr")
  .description("NHN Container Registry 관련 명령")
  .addHelpText("after", ncrAgentWorkflow);
ncrCommand.addCommand(ncrListCommand);
ncrCommand.addCommand(ncrGetCommand);
ncrCommand.addCommand(ncrImagesCommand);
ncrCommand.addCommand(ncrTagsCommand);

program.addCommand(ncrCommand);

// nks 커맨드 그룹
const nksCommand = new Command("nks")
  .description("NHN Kubernetes Service 관련 명령")
  .addHelpText("after", nksAgentWorkflow);
nksCommand.addCommand(nksSupportsCommand);
nksCommand.addCommand(nksClusterCommand);
nksCommand.addCommand(nksNodegroupCommand);
nksCommand.addCommand(nksAddonTypeCommand);
nksCommand.addCommand(nksAddonCommand);

program.addCommand(nksCommand);

// ncs 커맨드 그룹
const ncsCommand = new Command("ncs")
  .description("NHN Container Service 관련 명령")
  .addHelpText("after", ncsAgentWorkflow);
ncsCommand.addCommand(ncsTemplateCommand);
ncsCommand.addCommand(ncsWorkloadCommand);
ncsCommand.addCommand(ncsMalwareCommand);

program.addCommand(ncsCommand);
program.addCommand(skillsCommand);
program.addCommand(doctorCommand);
program.addCommand(createCommandsCommand(program));

program.parseAsync().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  const exitCode = err instanceof NhnCloudCliError ? err.exitCode : 1;
  process.stderr.write(chalk.red(`오류: ${message}`) + "\n");
  process.exit(exitCode);
});
