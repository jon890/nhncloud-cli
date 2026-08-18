import { Command } from "commander";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { createHarborClient } from "./helpers.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

interface TagsOpts extends OutputOptions {
  region?: string;
  profile?: string;
}

export const tagsCommand = new Command("tags")
  .description("특정 이미지의 태그 목록을 조회한다")
  .argument("<registry>", "레지스트리 이름")
  .argument("<repository>", "이미지(repository) 이름 (짧은 이름 또는 {project}/{repo})")
  .option("--region <region>", "NCR region (기본: kr1)", "kr1")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (registry: string, repository: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<TagsOpts>();

    // ── 1. 파라미터 검증 (spinner 시작 전) ──
    if (!registry.trim()) {
      throw new NhnCloudCliError(
        "registry 인수가 비어있습니다. 레지스트리 이름을 지정하세요.",
        EXIT_PARAM_ERROR,
      );
    }
    if (!repository.trim()) {
      throw new NhnCloudCliError(
        "repository 인수가 비어있습니다. 이미지 이름을 지정하세요.",
        EXIT_PARAM_ERROR,
      );
    }

    // ── 2. 자격증명 + Harbor client 생성 (spinner 시작 전) ──
    const { harbor, project } = await createHarborClient(opts, registry);

    // ── 3. repository 인자 정규화 ──
    // 사용자가 ncr images 의 짧은 이름 대신 full "{project}/{repo}" 를 입력해도 동작하도록
    // project 접두가 있으면 떼어낸다. 안 떼면 encodeURIComponent 가 prefix 의 '/' 까지 인코딩해 404.
    const repo = repository.startsWith(project + "/")
      ? repository.slice(project.length + 1)
      : repository;

    // ── 4. API 호출 (spinner 내부) ──
    startSpinner(`"${registry}/${repo}" 태그 목록 조회 중...`);

    let tagRows: Array<{ tag: string; push_time: string | null | undefined; size: string }>;
    try {
      const artifacts = await harbor.listArtifacts(project, repo);
      // tags=null dangling artifact 는 자동 제외(5-6 회피 — a.tags ?? [] 로 flatten).
      tagRows = artifacts.flatMap((a) =>
        (a.tags ?? []).map((t) => ({
          tag: t.name,
          push_time: t.push_time ?? a.push_time,
          size: String(a.size ?? ""),
        })),
      );
    } catch (err) {
      stopSpinner(false);
      throw err;
    }

    stopSpinner(true);

    // ── 5. 출력 ──
    output(opts, {
      headers: ["tag", "push_time", "size"],
      rows: tagRows.map((r) => [r.tag, r.push_time ?? "", r.size]),
      raw: tagRows,
      ids: tagRows.map((r) => r.tag),
    });
  });
