import { Command } from "commander";
import chalk from "chalk";
import { output, type OutputOptions } from "../../formatters/table.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { resolveNcsClient, readJsonPayload, confirmDestructive, requireNonEmpty } from "./helpers.js";
import { parsePositiveIntegerOption } from "../parse-options.js";
import type {
  NcsTemplateSummary,
  NcsTemplateDetail,
  NcsTemplateVersionSummary,
  NcsTemplateVersionDetail,
} from "../../services/ncs/types.js";

interface TemplateListOpts extends OutputOptions {
  region?: string;
  profile?: string;
  page?: string;
  size?: string;
}

const listCommand = new Command("list")
  .description("NCS 설계도(template) 목록을 조회한다")
  .option("--region <region>", "NCS region (기본: kr1, kr1/kr3 만 지원)", "kr1")
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
        page: parsePositiveIntegerOption(opts.page, "--page"),
        size: parsePositiveIntegerOption(opts.size, "--size"),
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
  profile?: string;
}

const getCommand = new Command("get")
  .description("NCS 설계도(template) 단건을 조회한다")
  .argument("<id>", "template ID")
  .option("--region <region>", "NCS region (기본: kr1, kr1/kr3 만 지원)", "kr1")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<TemplateGetOpts>();

    // ── 1. 파라미터 검증 (spinner 시작 전) — 빈값/공백 거절 ──
    requireNonEmpty(id, "id");

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

interface TemplateCreateOpts extends OutputOptions {
  region?: string;
  profile?: string;
  file?: string;
}

const createCommand = new Command("create")
  .description("NCS 설계도(template) 를 생성한다 (--file 로 JSON spec 전달)")
  .requiredOption("--file <path>", "template 생성 spec 이 담긴 JSON 파일 경로")
  .option("--region <region>", "NCS region (기본: kr1, kr1/kr3 만 지원)", "kr1")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<TemplateCreateOpts>();

    // ── 1. 파일 파싱 (spinner 시작 전, 순수 함수) ──
    const payload = readJsonPayload(opts.file as string);

    // ── 2. 자격증명 + client 생성 (spinner 시작 전) ──
    const { client } = await resolveNcsClient(opts);

    // ── 3. API 호출 (spinner 내부) ──
    startSpinner("NCS 설계도 생성 중...");

    let template: NcsTemplateDetail;
    try {
      template = await client.createTemplate(payload);
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

interface TemplateDeleteOpts {
  region?: string;
  profile?: string;
  yes?: boolean;
}

const deleteCommand = new Command("delete")
  .description("NCS 설계도(template) 를 삭제한다")
  .argument("<id>", "template ID")
  .option("--yes", "확인 프롬프트 생략 (CI/비대화형 필수)")
  .option("--region <region>", "NCS region (기본: kr1, kr1/kr3 만 지원)", "kr1")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<TemplateDeleteOpts>();

    // ── 1. 파라미터 검증 (spinner 시작 전) ──
    requireNonEmpty(id, "id");

    // ── 2. 확인 (spinner 시작 전) ──
    const ok = await confirmDestructive(`NCS 설계도 "${id}" 를 삭제하시겠습니까?`, opts.yes);
    if (!ok) {
      process.stderr.write(chalk.yellow("삭제가 취소되었습니다.\n"));
      return;
    }

    // ── 3. 자격증명 + client 생성 (spinner 시작 전) ──
    const { client } = await resolveNcsClient(opts);

    // ── 4. 삭제 (spinner 내부) ──
    startSpinner(`NCS 설계도 삭제 중... (id: ${id})`);
    try {
      await client.deleteTemplate(id);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    process.stderr.write(chalk.green(`✓ NCS 설계도 "${id}" 가 삭제되었습니다.\n`));
  });

interface TemplateVersionListOpts extends OutputOptions {
  region?: string;
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
  .option("--profile <name>", "사용할 profile 이름")
  .option("--q <query>", "검색어")
  .option("--sort <sort>", "정렬 조건")
  .option("--page <page>", "조회할 page 번호")
  .option("--size <size>", "page 당 항목 수 (기본: API 기본값 10)")
  .action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<TemplateVersionListOpts>();

    // ── 1. 파라미터 검증 (spinner 시작 전) ──
    requireNonEmpty(id, "id");

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
        page: parsePositiveIntegerOption(opts.page, "--page"),
        size: parsePositiveIntegerOption(opts.size, "--size"),
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
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (id: string, version: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<TemplateGetOpts>();

    // ── 1. 파라미터 검증 (spinner 시작 전) ──
    requireNonEmpty(id, "id");
    requireNonEmpty(version, "version");

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

interface TemplateVersionCreateOpts extends OutputOptions {
  region?: string;
  profile?: string;
  file?: string;
}

const versionCreateCommand = new Command("create")
  .description("NCS 설계도(template) 의 새 버전을 생성한다 (--file 로 JSON spec 전달, sourceVersion 필수)")
  .argument("<id>", "template ID")
  .requiredOption("--file <path>", "버전 생성 spec 이 담긴 JSON 파일 경로 (sourceVersion 필드 필수)")
  .option("--region <region>", "NCS region (기본: kr1, kr1/kr3 만 지원)", "kr1")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<TemplateVersionCreateOpts>();

    // ── 1. 파라미터 검증 + 파일 파싱 (spinner 시작 전) ──
    requireNonEmpty(id, "id");
    const payload = readJsonPayload(opts.file as string);

    // ── 2. 자격증명 + client 생성 (spinner 시작 전) ──
    const { client } = await resolveNcsClient(opts);

    // ── 3. API 호출 (spinner 내부) ──
    startSpinner(`NCS 설계도 "${id}" 버전 생성 중...`);

    let version: NcsTemplateVersionDetail;
    try {
      version = await client.createTemplateVersion(id, payload);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }

    stopSpinner(true);

    // ── 4. 출력 ──
    output(opts, {
      headers: ["id", "version", "workloadCount", "createdAt"],
      rows: [[version.id, version.version, String(version.workloadCount ?? ""), version.createdAt ?? ""]],
      raw: version,
      ids: [version.id],
    });
  });

interface TemplateVersionDeleteOpts {
  region?: string;
  profile?: string;
  yes?: boolean;
}

const versionDeleteCommand = new Command("delete")
  .description("NCS 설계도(template) 버전을 삭제한다")
  .argument("<id>", "template ID")
  .argument("<version>", "버전 값")
  .option("--yes", "확인 프롬프트 생략 (CI/비대화형 필수)")
  .option("--region <region>", "NCS region (기본: kr1, kr1/kr3 만 지원)", "kr1")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (id: string, version: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<TemplateVersionDeleteOpts>();

    // ── 1. 파라미터 검증 (spinner 시작 전) ──
    requireNonEmpty(id, "id");
    requireNonEmpty(version, "version");

    // ── 2. 확인 (spinner 시작 전) ──
    const ok = await confirmDestructive(
      `NCS 설계도 "${id}" 버전 "${version}" 을 삭제하시겠습니까?`,
      opts.yes,
    );
    if (!ok) {
      process.stderr.write(chalk.yellow("삭제가 취소되었습니다.\n"));
      return;
    }

    // ── 3. 자격증명 + client 생성 (spinner 시작 전) ──
    const { client } = await resolveNcsClient(opts);

    // ── 4. 삭제 (spinner 내부) ──
    startSpinner(`NCS 설계도 "${id}" 버전 "${version}" 삭제 중...`);
    try {
      await client.deleteTemplateVersion(id, version);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    process.stderr.write(
      chalk.green(`✓ NCS 설계도 "${id}" 버전 "${version}" 이 삭제되었습니다.\n`),
    );
  });

const versionCommand = new Command("version")
  .description("NCS 설계도(template) 버전 관리")
  .addCommand(versionListCommand)
  .addCommand(versionGetCommand)
  .addCommand(versionCreateCommand)
  .addCommand(versionDeleteCommand);

export const templateCommand = new Command("template")
  .description("NCS 설계도(template) 관리")
  .addCommand(listCommand)
  .addCommand(getCommand)
  .addCommand(createCommand)
  .addCommand(deleteCommand)
  .addCommand(versionCommand);
