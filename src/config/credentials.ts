import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { NhnCloudCliError } from "../utils/errors.js";
import { EXIT_CONFIG_ERROR, EXIT_PARAM_ERROR } from "../utils/exit-codes.js";
import type { Credentials, Config, ServiceCredential, UserAccessKey, DeployTarget } from "./types.js";

const CREDENTIALS_PATH = join(homedir(), ".nhncloud", "credentials.json");
const CONFIG_PATH = join(homedir(), ".nhncloud", "config.json");

function isCredentials(value: unknown): value is Credentials {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return obj["version"] === 1 && typeof obj["profiles"] === "object" && obj["profiles"] !== null;
}

function isConfig(value: unknown): value is Config {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return obj["version"] === 1;
}

async function loadCredentials(): Promise<Credentials> {
  let raw: string;
  try {
    raw = await readFile(CREDENTIALS_PATH, "utf-8");
  } catch {
    throw new NhnCloudCliError(
      `자격증명 파일을 찾을 수 없습니다: ${CREDENTIALS_PATH}\n` +
        "nhncloud configure 를 실행해 자격증명을 설정하거나, 다음 형식으로 파일을 생성하세요:\n" +
        JSON.stringify(
          {
            version: 1,
            profiles: {
              default: {
                userAccessKey: { id: "<uak-id>", secret: "<uak-secret>" },
                logncrash: { appkey: "<appkey>", secret: "<secretkey>" },
              },
            },
          },
          null,
          2,
        ),
      EXIT_CONFIG_ERROR,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new NhnCloudCliError(
      `자격증명 파일 파싱 오류: ${CREDENTIALS_PATH} — 올바른 JSON 형식인지 확인하세요.`,
      EXIT_CONFIG_ERROR,
    );
  }

  if (!isCredentials(parsed)) {
    throw new NhnCloudCliError(
      `자격증명 파일 형식 오류: ${CREDENTIALS_PATH} — version: 1 과 profiles 필드가 필요합니다.`,
      EXIT_CONFIG_ERROR,
    );
  }

  return parsed;
}

async function loadConfig(): Promise<Config | null> {
  let raw: string;
  try {
    raw = await readFile(CONFIG_PATH, "utf-8");
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new NhnCloudCliError(
      `설정 파일 파싱 오류: ${CONFIG_PATH} — 올바른 JSON 형식인지 확인하세요.`,
      EXIT_CONFIG_ERROR,
    );
  }

  if (!isConfig(parsed)) {
    return null;
  }

  return parsed;
}

/**
 * profile 이름을 결정한다.
 * 우선순위: --profile 옵션 > NHNCLOUD_PROFILE env > config.defaultProfile > "default"
 */
export async function resolveProfileName(cliProfile?: string): Promise<string> {
  if (cliProfile) return cliProfile;

  const envProfile = process.env["NHNCLOUD_PROFILE"];
  if (envProfile) return envProfile;

  const config = await loadConfig();
  if (config?.defaultProfile) return config.defaultProfile;

  return "default";
}

/**
 * 지정 profile 의 공통 UAK (userAccessKey) 를 반환한다.
 * 없으면 nhncloud configure 안내와 함께 EXIT_CONFIG_ERROR 를 던진다.
 */
export async function getUserAccessKey(profileName: string): Promise<UserAccessKey> {
  const credentials = await loadCredentials();

  const profile = credentials.profiles[profileName];
  if (!profile) {
    throw new NhnCloudCliError(
      `profile "${profileName}" 을 찾을 수 없습니다.\n` +
        `${CREDENTIALS_PATH} 에서 profiles.${profileName} 블록을 추가하거나 nhncloud configure 를 실행하세요.`,
      EXIT_CONFIG_ERROR,
    );
  }

  const uak = profile["userAccessKey"] as UserAccessKey | undefined;
  if (!uak || !uak.id || !uak.secret) {
    throw new NhnCloudCliError(
      `profile "${profileName}" 에 userAccessKey 가 없거나 불완전합니다.\n` +
        `nhncloud configure 를 실행해 UAK id/secret 을 설정하세요.`,
      EXIT_CONFIG_ERROR,
    );
  }

  return uak;
}

/**
 * 지정 profile 의 서비스 자격증명 블록을 반환한다.
 * 해당 블록이 없으면 설정 안내 메시지와 함께 EXIT_CONFIG_ERROR 를 던진다.
 * userAccessKey 블록은 이 함수로 읽지 않는다 (getUserAccessKey 사용).
 */
export async function getServiceCredential(
  service: string,
  profileName: string,
): Promise<ServiceCredential> {
  const credentials = await loadCredentials();

  const profile = credentials.profiles[profileName];
  if (!profile) {
    throw new NhnCloudCliError(
      `profile "${profileName}" 을 찾을 수 없습니다.\n` +
        `${CREDENTIALS_PATH} 에서 profiles.${profileName} 블록을 추가하세요.`,
      EXIT_CONFIG_ERROR,
    );
  }

  const cred = profile[service] as ServiceCredential | undefined;
  if (!cred) {
    throw new NhnCloudCliError(
      `profile "${profileName}" 에 "${service}" 자격증명이 없습니다.\n` +
        `${CREDENTIALS_PATH} 에서 profiles.${profileName}.${service} 블록을 추가하세요.\n` +
        `예시: { "appkey": "<appkey>", "secret": "<secretkey>" }`,
      EXIT_CONFIG_ERROR,
    );
  }

  return cred;
}

/**
 * config.json 의 deploy.targets[name] 좌표 묶음을 반환한다.
 * 해당 target 이 없으면 사용 가능한 target 목록을 안내하며 EXIT_PARAM_ERROR 를 던진다.
 */
export async function getDeployTarget(name: string): Promise<DeployTarget> {
  const config = await loadConfig();

  const targets = config?.deploy?.targets;

  const target = targets?.[name];
  if (!target) {
    const available = targets ? Object.keys(targets) : [];
    const hint =
      available.length > 0
        ? `사용 가능한 target: ${available.join(", ")}`
        : `config.json 에 deploy.targets 블록이 없습니다. ${CONFIG_PATH} 를 확인하세요.`;
    throw new NhnCloudCliError(
      `deploy target "${name}" 을 찾을 수 없습니다. ${hint}`,
      EXIT_PARAM_ERROR,
    );
  }

  return target;
}
