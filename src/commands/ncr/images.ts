import { Command } from "commander";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { createHarborClient } from "./helpers.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import type { Repository } from "../../services/ncr/types.js";

interface ImagesOpts extends OutputOptions {
  region?: string;
  appKey?: string;
  profile?: string;
}

export const imagesCommand = new Command("images")
  .description("레지스트리의 이미지(repository) 목록을 조회한다")
  .argument("<registry>", "레지스트리 이름")
  .option("--region <region>", "NCR region (기본: kr1)", "kr1")
  .option("--app-key <key>", "NCR appKey (profile 의 ncr.appkey 보다 우선)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (registry: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<ImagesOpts>();

    // ── 1. 파라미터 검증 (spinner 시작 전) ──
    if (!registry.trim()) {
      throw new NhnCloudCliError(
        "registry 인수가 비어있습니다. 레지스트리 이름을 지정하세요.",
        EXIT_PARAM_ERROR,
      );
    }

    // ── 2. 자격증명 + Harbor client 생성 (spinner 시작 전) ──
    // createHarborClient 는 내부에서 ncr get(Management API)을 호출해 host 를 해석한다.
    const { harbor, project } = await createHarborClient(opts, registry);

    // ── 3. API 호출 (spinner 내부) ──
    startSpinner(`"${registry}" 이미지 목록 조회 중...`);

    let repos: Repository[];
    try {
      repos = await harbor.listRepositories(project);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }

    stopSpinner(true);

    // ── 4. 출력 ──
    // repository name 은 "{project}/{repo}" 형태라 project 접두를 떼어 짧은 이름으로 표시.
    // 사용자가 짧은 이름을 그대로 `ncr tags` 인자로 쓸 수 있게 한다.
    const rows = repos.map((r) => {
      const short = r.name.startsWith(project + "/")
        ? r.name.slice(project.length + 1)
        : r.name;
      return [short, String(r.artifact_count ?? ""), String(r.pull_count ?? "")];
    });

    const ids = repos.map((r) =>
      r.name.startsWith(project + "/") ? r.name.slice(project.length + 1) : r.name,
    );

    output(opts, {
      headers: ["repository", "artifact_count", "pull_count"],
      rows,
      raw: repos,
      ids,
    });
  });
