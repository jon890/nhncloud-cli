import ky from "ky";
import { toNhnCloudCliError } from "../../api/httpError.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_API_ERROR } from "../../utils/exit-codes.js";
import type { Volume, VolumeListParams, CreateVolumeParams } from "./types.js";

const DEFAULT_TIMEOUT_MS = 30_000;

// ── 응답 타입 가드 ─────────────────────────────────────────────────────────────

function isVolume(val: unknown): val is Volume {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj["id"] === "string" &&
    // Cinder 는 --name 미지정 시 null — null 인 볼륨 하나가 list 전체를 거부하지 않게 허용 (isImage 선례).
    (typeof obj["name"] === "string" || obj["name"] === null) &&
    typeof obj["size"] === "number" &&
    typeof obj["status"] === "string" &&
    Array.isArray(obj["attachments"])
  );
}

function isVolumesResponse(val: unknown): val is { volumes: Volume[] } {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return Array.isArray(obj["volumes"]) && obj["volumes"].every(isVolume);
}

function isVolumeResponse(val: unknown): val is { volume: Volume } {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return isVolume(obj["volume"]);
}

// ── BlockStorageClient ────────────────────────────────────────────────────────

export class BlockStorageClient {
  private readonly tokenId: string;
  private readonly endpoint: string; // blockStorageEndpoint (/v2/{tenantId} 까지 포함)

  constructor(tokenId: string, blockStorageEndpoint: string) {
    this.tokenId = tokenId;
    this.endpoint = blockStorageEndpoint;
  }

  private authHeaders(): Record<string, string> {
    return { "X-Auth-Token": this.tokenId };
  }

  async list(params?: VolumeListParams): Promise<Volume[]> {
    const url = `${this.endpoint}/volumes`;
    const searchParams: Record<string, string | number> = {};
    if (params?.sort !== undefined) searchParams["sort"] = params.sort;
    if (params?.limit !== undefined) searchParams["limit"] = params.limit;
    if (params?.offset !== undefined) searchParams["offset"] = params.offset;
    if (params?.marker !== undefined) searchParams["marker"] = params.marker;
    try {
      const raw = await ky
        .get(url, { headers: this.authHeaders(), searchParams, retry: 0, timeout: DEFAULT_TIMEOUT_MS })
        .json();
      if (!isVolumesResponse(raw)) {
        throw new NhnCloudCliError(
          "volume list 응답 형식이 올바르지 않습니다 — volumes 배열이 없습니다.",
          EXIT_API_ERROR,
        );
      }
      return raw.volumes;
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  async get(id: string): Promise<Volume> {
    const url = `${this.endpoint}/volumes/${encodeURIComponent(id)}`;
    try {
      const raw = await ky
        .get(url, { headers: this.authHeaders(), retry: 0, timeout: DEFAULT_TIMEOUT_MS })
        .json();
      if (!isVolumeResponse(raw)) {
        throw new NhnCloudCliError(
          "volume get 응답 형식이 올바르지 않습니다 — volume 객체가 없습니다.",
          EXIT_API_ERROR,
        );
      }
      return raw.volume;
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  async create(params: CreateVolumeParams): Promise<Volume> {
    const url = `${this.endpoint}/volumes`;
    const volumeBody: Record<string, unknown> = { size: params.size };
    if (params.name !== undefined) volumeBody["name"] = params.name;
    if (params.description !== undefined) volumeBody["description"] = params.description;
    if (params.volume_type !== undefined) volumeBody["volume_type"] = params.volume_type;
    if (params.snapshot_id !== undefined) volumeBody["snapshot_id"] = params.snapshot_id;
    try {
      const raw = await ky
        .post(url, {
          headers: this.authHeaders(),
          json: { volume: volumeBody },
          retry: 0,
          timeout: DEFAULT_TIMEOUT_MS,
        })
        .json();
      if (!isVolumeResponse(raw)) {
        throw new NhnCloudCliError(
          "volume create 응답에 volume 객체가 없습니다.",
          EXIT_API_ERROR,
        );
      }
      return raw.volume;
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }
}
