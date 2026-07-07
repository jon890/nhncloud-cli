import { Command } from "commander";
import { output, type OutputOptions } from "../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { resolveNcsClient } from "./helpers.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import type {
  NcsTemplateSummary,
  NcsTemplateDetail,
  NcsTemplateVersionSummary,
  NcsTemplateVersionDetail,
} from "../../services/ncs/types.js";

interface TemplateListOpts extends OutputOptions {
  region?: string;
  appKey?: string;
  profile?: string;
  page?: string;
  size?: string;
}

const listCommand = new Command("list")
  .description("NCS 설계도(template) 목록을 조회한다")
  .option("--region <region>", "NCS region (기본: kr1, kr1/kr3 만 지원)", "kr1")
  .option("--app-key <key>", "NCS appKey (profile 의 ncs.appkey 보다 우선)")
  .option("--profile <name>", "사용할 profile 이름")
  .option("--page <page>", "조회할 page 번호")
  .option("--size <size>", "page 당 항목 수 (기본: API 기본값 10)")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<TemplateListOpts>();

    // ── 1. 자격증명 + client 생성 (spinner 시작 전) ──
    const { client } = await resolveNcsClient(opts);

    // ── 2. API 호출 (spinner 내부) ──
    startSpinner("NCS 설계도 목록 조회 중...");

    let totalCount: number;
    let templates: NcsTemplateSummary[];
    try {
      const result = await client.listTemplates({
        page: opts.page !== undefined ? Number(opts.page) : undefined,
        size: opts.size !== undefined ? Number(opts.size) : undefined,
      });
      totalCount = result.totalCount;
      templates = result.templates;
    } catch (err) {
      stopSpinner(false);
      throw err;
    }

    stopSpinner(true);

    // ── 3. 출력 ──
    output(opts, {
      headers: ["id", "name", "version", "versionCount", "workloadCount"],
      rows: templates.map((t) => [
        t.id,
        t.name,
        t.version ?? "",
        String(t.versionCount ?? ""),
        String(t.workloadCount ?? ""),
      ]),
      raw: { totalCount, templates },
      ids: templates.map((t) => t.id),
    });
  });

interface TemplateGetOpts extends OutputOptions {
  region?: string;
  appKey?: string;
  profile?: string;
}

const getCommand = new Command("get")
  .description("NCS 설계도(template) 단건을 조회한다")
  .argument("<id>", "template ID")
  .option("--region <region>", "NCS region (기본: kr1, kr1/kr3 만 지원)", "kr1")
  .option("--app-key <key>", "NCS appKey (profile 의 ncs.appkey 보다 우선)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<TemplateGetOpts>();

    // ── 1. 파라미터 검증 (spinner 시작 전) — 빈값/공백 거절 ──
    if (!id.trim()) {
      throw new NhnCloudCliError(
        "id 인수가 비어있습니다. template ID 를 지정하세요.",
        EXIT_PARAM_ERROR,
      );
    }

    // ── 2. 자격증명 + client 생성 (spinner 시작 전) ──
    const { client } = await resolveNcsClient(opts);

    // ── 3. API 호출 (spinner 내부) ──
    startSpinner(`NCS 설계도 "${id}" 조회 중...`);

    let template: NcsTemplateDetail;
    try {
      template = await client.getTemplate(id);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }

    stopSpinner(true);

    // ── 4. 출력 ──
    output(opts, {
      headers: ["id", "name", "version", "versionCount", "workloadCount"],
      rows: [
        [
          template.id,
          template.name,
          template.version ?? "",
          String(template.versionCount ?? ""),
          String(template.workloadCount ?? ""),
        ],
      ],
      raw: template,
      ids: [template.id],
    });
  });

interface TemplateVersionListOpts extends OutputOptions {
  region?: string;
  appKey?: string;
  profile?: string;
  q?: string;
  sort?: string;
  page?: string;
  size?: string;
}

const versionListCommand = new Command("list")
  .description("NCS 설계도(template) 의 버전 목록을 조회한다")
  .argument("<id>", "template ID")
  .option("--region <region>", "NCS region (기본: kr1, kr1/kr3 만 지원)", "kr1")
  .option("--app-key <key>", "NCS appKey (profile 의 ncs.appkey 보다 우선)")
  .option("--profile <name>", "사용할 profile 이름")
  .option("--q <query>", "검색어")
  .option("--sort <sort>", "정렬 조건")
  .option("--page <page>", "조회할 page 번호")
  .option("--size <size>", "page 당 항목 수 (기본: API 기본값 10)")
  .action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<TemplateVersionListOpts>();

    // ── 1. 파라미터 검증 (spinner 시작 전) ──
    if (!id.trim()) {
      throw new NhnCloudCliError(
        "id 인수가 비어있습니다. template ID 를 지정하세요.",
        EXIT_PARAM_ERROR,
      );
    }

    // ── 2. 자격증명 + client 생성 (spinner 시작 전) ──
    const { client } = await resolveNcsClient(opts);

    // ── 3. API 호출 (spinner 내부) ──
    startSpinner(`NCS 설계도 "${id}" 버전 목록 조회 중...`);

    let totalCount: number;
    let versions: NcsTemplateVersionSummary[];
    try {
      const result = await client.listTemplateVersions(id, {
        q: opts.q,
        sort: opts.sort,
        page: opts.page !== undefined ? Number(opts.page) : undefined,
        size: opts.size !== undefined ? Number(opts.size) : undefined,
      });
      totalCount = result.totalCount;
      versions = result.versions;
    } catch (err) {
      stopSpinner(false);
      throw err;
    }

    stopSpinner(true);

    // ── 4. 출력 ──
    output(opts, {
      headers: ["id", "version", "workloadCount", "createdAt"],
      rows: versions.map((v) => [
        v.id,
        v.version,
        String(v.workloadCount ?? ""),
        v.createdAt ?? "",
      ]),
      raw: { totalCount, versions },
      ids: versions.map((v) => v.id),
    });
  });

const versionGetCommand = new Command("get")
  .description("NCS 설계도(template) 버전 단건을 조회한다")
  .argument("<id>", "template ID")
  .argument("<version>", "버전 값")
  .option("--region <region>", "NCS region (기본: kr1, kr1/kr3 만 지원)", "kr1")
  .option("--app-key <key>", "NCS appKey (profile 의 ncs.appkey 보다 우선)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (id: string, version: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<TemplateGetOpts>();

    // ── 1. 파라미터 검증 (spinner 시작 전) ──
    if (!id.trim()) {
      throw new NhnCloudCliError(
        "id 인수가 비어있습니다. template ID 를 지정하세요.",
        EXIT_PARAM_ERROR,
      );
    }
    if (!version.trim()) {
      throw new NhnCloudCliError(
        "version 인수가 비어있습니다. 버전 값을 지정하세요.",
        EXIT_PARAM_ERROR,
      );
    }

    // ── 2. 자격증명 + client 생성 (spinner 시작 전) ──
    const { client } = await resolveNcsClient(opts);

    // ── 3. API 호출 (spinner 내부) ──
    startSpinner(`NCS 설계도 "${id}" 버전 "${version}" 조회 중...`);

    let detail: NcsTemplateVersionDetail;
    try {
      detail = await client.getTemplateVersion(id, version);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }

    stopSpinner(true);

    // ── 4. 출력 ──
    output(opts, {
      headers: ["id", "version", "workloadCount", "createdAt"],
      rows: [[detail.id, detail.version, String(detail.workloadCount ?? ""), detail.createdAt ?? ""]],
      raw: detail,
      ids: [detail.id],
    });
  });

const versionCommand = new Command("version")
  .description("NCS 설계도(template) 버전 관리")
  .addCommand(versionListCommand)
  .addCommand(versionGetCommand);

export const templateCommand = new Command("template")
  .description("NCS 설계도(template) 관리")
  .addCommand(listCommand)
  .addCommand(getCommand)
  .addCommand(versionCommand);
