import ky from "ky";
import { readToken, writeToken } from "../cache/token-store.js";
import { toNhnCloudCliError } from "./httpError.js";

const OAUTH_ENDPOINT = "https://oauth.api.nhncloudservice.com/oauth2/token/create";

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

function isTokenResponse(val: unknown): val is TokenResponse {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj["access_token"] === "string" && typeof obj["expires_in"] === "number"
  );
}

/**
 * Deploy API 용 access_token 을 반환한다.
 *
 * - 캐시 토큰이 유효하면 재사용한다.
 * - 만료됐거나 없으면 OAuth client_credentials 로 새 토큰을 발급한다.
 *   - POST oauth.api.nhncloudservice.com/oauth2/token/create
 *   - Authorization: Basic base64(uakId:uakSecret)
 *   - Content-Type: application/x-www-form-urlencoded
 *   - body: grant_type=client_credentials
 */
export async function getAccessToken(
  profile: string,
  uakId: string,
  uakSecret: string,
): Promise<string> {
  // 캐시 확인
  const cached = await readToken(profile);
  if (cached !== null) {
    return cached.accessToken;
  }

  // OAuth 교환
  const basicCredential = Buffer.from(`${uakId}:${uakSecret}`).toString("base64");

  let raw: unknown;
  try {
    raw = await ky
      .post(OAUTH_ENDPOINT, {
        headers: {
          Authorization: `Basic ${basicCredential}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
        retry: 0,
      })
      .json();
  } catch (err) {
    throw toNhnCloudCliError(err);
  }

  if (!isTokenResponse(raw)) {
    throw toNhnCloudCliError(new Error("OAuth 응답 형식이 올바르지 않습니다."));
  }

  const expiresAt = new Date(Date.now() + raw.expires_in * 1000);
  await writeToken(profile, raw.access_token, expiresAt);

  return raw.access_token;
}
