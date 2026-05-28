import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const CACHE_DIR = join(homedir(), ".nhncloud", "cache");

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

  await writeFile(filePath, JSON.stringify(data, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
}
