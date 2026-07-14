import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const home = vi.hoisted(() => ({ dir: "" }));
vi.mock("node:os", async (orig) => {
  const actual = await orig<typeof import("node:os")>();
  return { ...actual, homedir: () => home.dir };
});

// SUT 는 정적 import 금지 — home.dir set 후 동적 로드해야 CACHE_DIR 이 temp dir 로 굳는다.
let store: typeof import("./token-store.js");
beforeAll(async () => {
  home.dir = await mkdtemp(path.join(tmpdir(), "ncc-token-"));
  store = await import("./token-store.js");
});
afterAll(async () => {
  await rm(home.dir, { recursive: true, force: true });
});

const FUTURE_EXPIRY = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const PAST_EXPIRY = new Date(Date.now() - 60 * 60 * 1000).toISOString();

describe("OAuth token cache", () => {
  it("같은 지문으로 read 시 저장된 토큰을 반환한다", async () => {
    const hash = store.credentialFingerprint("uak-id:uak-secret");
    await store.writeToken("p1", "access-token-1", new Date(FUTURE_EXPIRY), hash);

    const result = await store.readToken("p1", hash);

    expect(result).not.toBeNull();
    expect(result?.accessToken).toBe("access-token-1");
  });

  it("다른 지문으로 read 시 null 을 반환한다 (자격 변경 무효화)", async () => {
    const hash = store.credentialFingerprint("uak-id:uak-secret");
    await store.writeToken("p2", "access-token-2", new Date(FUTURE_EXPIRY), hash);

    const otherHash = store.credentialFingerprint("uak-id:other-secret");
    const result = await store.readToken("p2", otherHash);

    expect(result).toBeNull();
  });

  it("만료된 토큰은 같은 지문이어도 null 을 반환한다", async () => {
    const hash = store.credentialFingerprint("uak-id:uak-secret");
    await store.writeToken("p3", "access-token-3", new Date(PAST_EXPIRY), hash);

    const result = await store.readToken("p3", hash);

    expect(result).toBeNull();
  });

  it("캐시 파일명은 user-access-token-<profile>.json 이다 (옛 파일명 미생성)", async () => {
    const hash = store.credentialFingerprint("uak-id:uak-secret");
    await store.writeToken("p4", "access-token-4", new Date(FUTURE_EXPIRY), hash);

    const files = await readdir(path.join(home.dir, ".nhncloud", "cache"));
    const oldPrefix = ["deploy", "token"].join("-");

    expect(files).toContain("user-access-token-p4.json");
    expect(files.some((f) => f.startsWith(oldPrefix))).toBe(false);
  });
});

describe("iaas token cache", () => {
  const endpoints = {
    computeEndpoint: "https://compute.example.com/v2/tenant",
    imageEndpoint: "https://image.example.com/v2",
    networkEndpoint: "https://network.example.com/v2.0",
    blockStorageEndpoint: "https://volume.example.com/v2/tenant",
    nksEndpoint: "https://nks.example.com/v1",
  };

  it("같은 지문으로 read 시 저장된 토큰을 반환한다", async () => {
    const hash = store.credentialFingerprint("tenant:user:pass");
    await store.writeIaasToken("p1", "kr1", {
      tokenId: "token-1",
      expiresAt: FUTURE_EXPIRY,
      credentialHash: hash,
      ...endpoints,
    });

    const result = await store.readIaasToken("p1", "kr1", hash);

    expect(result).not.toBeNull();
    expect(result?.tokenId).toBe("token-1");
  });

  it("다른 지문으로 read 시 null 을 반환한다 (자격 변경 무효화)", async () => {
    const hash = store.credentialFingerprint("tenant:user:pass");
    await store.writeIaasToken("p2", "kr1", {
      tokenId: "token-2",
      expiresAt: FUTURE_EXPIRY,
      credentialHash: hash,
      ...endpoints,
    });

    const otherHash = store.credentialFingerprint("tenant:user:other-pass");
    const result = await store.readIaasToken("p2", "kr1", otherHash);

    expect(result).toBeNull();
  });

  it("만료된 토큰은 같은 지문이어도 null 을 반환한다", async () => {
    const hash = store.credentialFingerprint("tenant:user:pass");
    await store.writeIaasToken("p3", "kr1", {
      tokenId: "token-3",
      expiresAt: PAST_EXPIRY,
      credentialHash: hash,
      ...endpoints,
    });

    const result = await store.readIaasToken("p3", "kr1", hash);

    expect(result).toBeNull();
  });
});
