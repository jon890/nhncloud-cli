import { Command } from "commander";
import { output, type OutputOptions } from "../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { resolveNksClient } from "./helpers.js";
import type { NksAddon, NksAddonType } from "../../services/nks/types.js";

interface AddonGlobalOpts extends OutputOptions {
  region?: string;
  profile?: string;
  k8sVersion?: string;
  image?: string;
  platformVersion?: string;
}

function addonTypeRow(addonType: NksAddonType): string[] {
  return [
    addonType.uuid ?? addonType.id ?? addonType.name,
    addonType.name,
    String(addonType["version"] ?? ""),
  ];
}

function addonRow(addon: NksAddon): string[] {
  return [
    addon.uuid ?? addon.id ?? addon.name,
    addon.name,
    addon.version ?? "",
    addon.status ?? "",
  ];
}

const addonTypeListCommand = new Command("list")
  .description("NKS 애드온 타입 목록을 조회한다")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<AddonGlobalOpts>();
    const { client } = await resolveNksClient(opts);

    startSpinner("NKS 애드온 타입 목록 조회 중...");
    let addonTypes: NksAddonType[];
    try {
      addonTypes = await client.listAddonTypes();
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    output(opts, {
      headers: ["id", "name", "version"],
      rows: addonTypes.map(addonTypeRow),
      raw: addonTypes,
      ids: addonTypes.map((addonType) => addonType.uuid ?? addonType.id ?? addonType.name),
    });
  });

const addonTypeGetCommand = new Command("get")
  .description("NKS 애드온 타입을 조회한다")
  .argument("<addon-type>", "애드온 타입 UUID 또는 이름")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (addonType: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<AddonGlobalOpts>();
    const { client } = await resolveNksClient(opts);

    startSpinner("NKS 애드온 타입 조회 중...");
    let result: NksAddonType;
    try {
      result = await client.getAddonType(addonType);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    output(opts, {
      headers: ["id", "name", "version"],
      rows: [addonTypeRow(result)],
      raw: result,
      ids: [result.uuid ?? result.id ?? result.name],
    });
  });

export const addonTypeCommand = new Command("addon-type")
  .description("NKS 애드온 타입 관련 명령")
  .addCommand(addonTypeListCommand)
  .addCommand(addonTypeGetCommand);

const addonListCommand = new Command("list")
  .description("NKS 애드온 목록을 조회한다")
  .option("--k8s-version <version>", "Kubernetes version filter")
  .option("--image <image>", "image filter")
  .option("--platform-version <version>", "platform version filter")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<AddonGlobalOpts>();
    const { client } = await resolveNksClient(opts);

    startSpinner("NKS 애드온 목록 조회 중...");
    let addons: NksAddon[];
    try {
      addons = await client.listAddons({
        k8sVersion: opts.k8sVersion,
        image: opts.image,
        platformVersion: opts.platformVersion,
      });
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    output(opts, {
      headers: ["id", "name", "version", "status"],
      rows: addons.map(addonRow),
      raw: addons,
      ids: addons.map((addon) => addon.uuid ?? addon.id ?? addon.name),
    });
  });

const addonGetCommand = new Command("get")
  .description("NKS 애드온을 조회한다")
  .argument("<addon>", "애드온 UUID 또는 이름")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (addon: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<AddonGlobalOpts>();
    const { client } = await resolveNksClient(opts);

    startSpinner("NKS 애드온 조회 중...");
    let result: NksAddon;
    try {
      result = await client.getAddon(addon);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    output(opts, {
      headers: ["id", "name", "version", "status"],
      rows: [addonRow(result)],
      raw: result,
      ids: [result.uuid ?? result.id ?? result.name],
    });
  });

export const addonCommand = new Command("addon")
  .description("NKS 애드온 관련 명령")
  .addCommand(addonListCommand)
  .addCommand(addonGetCommand);
