import { Command } from "commander";
import { output, type OutputOptions } from "../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { resolveNcsClient } from "./helpers.js";
import type { NcsTemplateSummary } from "../../services/ncs/types.js";

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

export const templateCommand = new Command("template")
  .description("NCS 설계도(template) 관리")
  .addCommand(listCommand);
