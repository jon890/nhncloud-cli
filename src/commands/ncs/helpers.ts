import { readFileSync, statSync } from "node:fs";
import { resolveProfileName, getUserAccessKey, getServiceCredential } from "../../config/credentials.js";
import { getAccessToken } from "../../api/oauth.js";
import { NcsClient } from "../../services/ncs/client.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_CONFIG_ERROR, EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

/** `--file <json>` spec 파일 크기 상한 (1 MB) — deploy upload(512 MiB, 바이너리) 보다 훨씬 보수적. JSON spec 용도라 그 이상은 비정상 입력. */
const MAX_JSON_PAYLOAD_BYTES = 1_000_000;

/**
 * NCS appKey 를 해석한다.
 * 우선순위: --app-key 옵션 > profile 의 ncs.appkey.
 * 둘 다 없으면 EXIT_CONFIG_ERROR + 설정 안내(2-4 회피 — 빈문자열 fallback 금지).
 *
 * 안내 문구 주의: `configure` 마법사는 아직 ncs 를 지원하지 않는다(src/commands/configure.ts 에
 * ncs 블록 없음). 존재하지 않는 `--ncs-appkey` 플래그를 안내하지 않는다 — --app-key 옵션 또는
 * ~/.nhncloud/credentials.json 의 profiles.<profile>.ncs.appkey 수기 편집을 안내한다.
 */
export async function resolveNcsAppKey(
  profileName: string,
  appKeyOpt?: string,
): Promise<string> {
  if (appKeyOpt) return appKeyOpt;

  // profile 의 ncs 블록에서 appkey 조회.
  // ncs 블록 부재(EXIT_CONFIG_ERROR)만 친절한 안내로 변환하고,
  // profile 자체 부재·credentials.json 파싱 오류 등은 원인을 보존해 rethrow.
  let cred: { appkey?: string; secret?: string } | undefined;
  try {
    cred = await getServiceCredential("ncs", profileName);
  } catch (err) {
    if (!(err instanceof NhnCloudCliError) || err.exitCode !== EXIT_CONFIG_ERROR) {
      throw err;
    }
  }

  if (!cred?.appkey) {
    throw new NhnCloudCliError(
      "NCS appKey 가 없습니다. --app-key 옵션으로 지정하거나\n" +
        "~/.nhncloud/credentials.json 의 profiles.<profile>.ncs.appkey 를 직접 추가하세요.\n" +
        "(nhncloud configure 는 아직 ncs 를 지원하지 않습니다.)",
      EXIT_CONFIG_ERROR,
    );
  }

  return cred.appkey;
}

/**
 * profile 해석 → 공통 UAK 로드 → Deploy OAuth 토큰(profile 캐시 재사용) 발급 → appKey 해석 → NcsClient 생성.
 * spinner 시작 *전* (파라미터 검증·자격증명 로드 단계) 에 호출한다.
 */
export async function resolveNcsClient(opts: {
  profile?: string;
  region?: string;
  appKey?: string;
}): Promise<{ client: NcsClient; profileName: string }> {
  const profileName = await resolveProfileName(opts.profile);
  const uak = await getUserAccessKey(profileName);
  const accessToken = await getAccessToken(profileName, uak.id, uak.secret);
  const appKey = await resolveNcsAppKey(profileName, opts.appKey);
  const region = opts.region ?? "kr1";
  return { client: new NcsClient(accessToken, region, appKey), profileName };
}

/**
 * `--file <json>` 로 지정된 경로를 읽어 JSON 으로 파싱한다 (ADR-019 NKS 선례 — 복잡한 생성 입력은 파일 기반).
 * 순수 함수 — stdout/stderr 출력이나 confirm 로직을 섞지 않는다(io-throw-bundled-untestable 회피).
 * 읽기 전에 statSync 로 errno·파일유형·크기를 차단한다 (deploy/upload.ts 선례,
 * pitfall file-input-no-stat-guard — PR#8 지적 재발 방지). 파일 읽기 실패·디렉터리·크기초과·
 * JSON.parse 실패 모두 EXIT_PARAM_ERROR 로 통일한다.
 */
export function readJsonPayload(filePath: string): unknown {
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(filePath);
  } catch (err) {
    const reason =
      (err as NodeJS.ErrnoException).code ?? (err instanceof Error ? err.message : String(err));
    throw new NhnCloudCliError(
      `파일을 읽을 수 없습니다: ${filePath} (${reason})`,
      EXIT_PARAM_ERROR,
    );
  }
  if (!stat.isFile()) {
    throw new NhnCloudCliError(`--file 이 일반 파일이 아닙니다: ${filePath}`, EXIT_PARAM_ERROR);
  }
  if (stat.size > MAX_JSON_PAYLOAD_BYTES) {
    throw new NhnCloudCliError(
      `--file 이 너무 큽니다 (${stat.size} 바이트). JSON spec 한도 ${MAX_JSON_PAYLOAD_BYTES} 바이트.`,
      EXIT_PARAM_ERROR,
    );
  }

  const raw = readFileSync(filePath, "utf-8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new NhnCloudCliError(
      `JSON 파싱에 실패했습니다: ${filePath} (${detail})`,
      EXIT_PARAM_ERROR,
    );
  }
}

/**
 * 비대화형에서는 --yes 필수, TTY 에서는 @inquirer/prompts confirm 으로 확인한다
 * (floatingip delete 패턴 재사용). template.ts·workload.ts 양쪽의 delete 커맨드가 공유하는
 * 공용 함수라 helpers.ts 로 둔다(code-review FIX — template.ts 전용 export 비대칭 해소).
 */
export async function confirmDestructive(
  message: string,
  yes: boolean | undefined,
): Promise<boolean> {
  const isTTY = process.stdin.isTTY;

  if (!isTTY && !yes) {
    throw new NhnCloudCliError(
      "비대화형 환경에서는 --yes 플래그가 필요합니다.",
      EXIT_PARAM_ERROR,
    );
  }

  if (isTTY && !yes) {
    const { confirm } = await import("@inquirer/prompts");
    return confirm({ message, default: false });
  }

  return true;
}
