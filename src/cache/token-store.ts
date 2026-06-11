import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";

const CACHE_DIR = join(homedir(), ".nhncloud", "cache");

// ── iaas token cache ──────────────────────────────────────────────────────────

function iaasCachePath(profile: string, region: string): string {
  return join(CACHE_DIR, `iaas-token-${profile}-${region}.json`);
}

interface IaasTokenCache {
  tokenId: string;
  expiresAt: string; // ISO 8601
  computeEndpoint: string;
  imageEndpoint: string;
  networkEndpoint: string;
  blockStorageEndpoint: string;
}

// 하위호환: 구버전 캐시는 imageEndpoint/networkEndpoint/blockStorageEndpoint 가 없어 가드 실패 → readIaasToken 이 null 반환 → 토큰 재발급으로 자연 복구.
function isIaasTokenCache(val: unknown): val is IaasTokenCache {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj["tokenId"] === "string" &&
    typeof obj["expiresAt"] === "string" &&
    typeof obj["computeEndpoint"] === "string" &&
    typeof obj["imageEndpoint"] === "string" &&
    typeof obj["networkEndpoint"] === "string" &&
    typeof obj["blockStorageEndpoint"] === "string"
  );
}

/**
 * 저장된 iaas 토큰 캐시를 읽어 반환한다.
 * 파일 없음 / 파싱 실패 / 만료(60초 여유) 시 null 반환.
 */
export async function readIaasToken(
  profile: string,
  region: string,
): Promise<{ tokenId: string; expiresAt: string; computeEndpoint: string; imageEndpoint: string; networkEndpoint: string; blockStorageEndpoint: string } | null> {
  const filePath = iaasCachePath(profile, region);
  try {
    const raw = await readFile(filePath, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (!isIaasTokenCache(parsed)) return null;

    const expiresAt = new Date(parsed.expiresAt).getTime();
    const BUFFER_MS = 60_000;
    if (expiresAt - Date.now() < BUFFER_MS) return null;

    return {
      tokenId: parsed.tokenId,
      expiresAt: parsed.expiresAt,
      computeEndpoint: parsed.computeEndpoint,
      imageEndpoint: parsed.imageEndpoint,
      networkEndpoint: parsed.networkEndpoint,
      blockStorageEndpoint: parsed.blockStorageEndpoint,
    };
  } catch {
    return null;
  }
}

/**
 * iaas 토큰을 캐시 파일에 저장한다 (temp + rename atomic, mode 0o600).
 */
export async function writeIaasToken(
  profile: string,
  region: string,
  data: { tokenId: string; expiresAt: string; computeEndpoint: string; imageEndpoint: string; networkEndpoint: string; blockStorageEndpoint: string },
): Promise<void> {
  const filePath = iaasCachePath(profile, region);
  await mkdir(dirname(filePath), { recursive: true });

  const cache: IaasTokenCache = {
    tokenId: data.tokenId,
    expiresAt: data.expiresAt,
    computeEndpoint: data.computeEndpoint,
    imageEndpoint: data.imageEndpoint,
    networkEndpoint: data.networkEndpoint,
    blockStorageEndpoint: data.blockStorageEndpoint,
  };

  const tmp = filePath + "." + randomBytes(4).toString("hex") + ".tmp";
  await writeFile(tmp, JSON.stringify(cache, null, 2), { encoding: "utf-8", mode: 0o600 });
  await rename(tmp, filePath);
}

function tokenCachePath(profile: string): string {
  return join(CACHE_DIR, `deploy-token-${profile}.json`);
}

interface TokenCache {
  accessToken: string;
  expiresAt: string; // ISO 8601
}

function isTokenCache(val: unknown): val is TokenCache {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return typeof obj["accessToken"] === "string" && typeof obj["expiresAt"] === "string";
}

/**
 * 저장된 토큰을 읽어 반환한다.
 * 파일 없음 / 파싱 실패 / 만료(60초 여유 포함) 시 null 반환.
 */
export async function readToken(
  profile: string,
): Promise<{ accessToken: string; expiresAt: string } | null> {
  const filePath = tokenCachePath(profile);
  try {
    const raw = await readFile(filePath, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (!isTokenCache(parsed)) return null;

    const expiresAt = new Date(parsed.expiresAt).getTime();
    const now = Date.now();
    const BUFFER_MS = 60_000; // 만료 60초 전부터 갱신
    if (expiresAt - now < BUFFER_MS) return null;

    return { accessToken: parsed.accessToken, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

/**
 * 토큰을 캐시 파일에 저장한다.
 * 파일은 owner-only 권한(0o600)으로 생성한다.
 */
export async function writeToken(
  profile: string,
  accessToken: string,
  expiresAt: Date,
): Promise<void> {
  const filePath = tokenCachePath(profile);
  await mkdir(dirname(filePath), { recursive: true });

  const data: TokenCache = {
    accessToken,
    expiresAt: expiresAt.toISOString(),
  };

  // 비원자 쓰기 방지: temp 파일에 먼저 쓴 뒤 rename 으로 원자적 교체
  const tmp = filePath + "." + randomBytes(4).toString("hex") + ".tmp";
  await writeFile(tmp, JSON.stringify(data, null, 2), { encoding: "utf-8", mode: 0o600 });
  await rename(tmp, filePath);
}
