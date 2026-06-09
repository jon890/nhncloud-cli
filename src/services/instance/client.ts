import ky from "ky";
import { toNhnCloudCliError } from "../../api/httpError.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_API_ERROR } from "../../utils/exit-codes.js";
import type {
  Server,
  CreateServerParams,
  Flavor,
  FlavorDetail,
  FlavorListParams,
  Image,
  ImageListParams,
  ImageListResult,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 5_000;

// ── 응답 타입 가드 ─────────────────────────────────────────────────────────────

function isServer(val: unknown): val is Server {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj["id"] === "string" &&
    typeof obj["name"] === "string" &&
    typeof obj["status"] === "string" &&
    typeof obj["addresses"] === "object" &&
    obj["addresses"] !== null
  );
}

function isServerResponse(val: unknown): val is { server: Server } {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return isServer(obj["server"]);
}

function isServersResponse(val: unknown): val is { servers: Server[] } {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return Array.isArray(obj["servers"]);
}

function isFlavor(val: unknown): val is Flavor {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return typeof obj["id"] === "string" && typeof obj["name"] === "string";
}

function isImage(val: unknown): val is Image {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj["id"] === "string" &&
    typeof obj["name"] === "string" &&
    typeof obj["status"] === "string" &&
    typeof obj["visibility"] === "string"
  );
}

function isImagesResponse(val: unknown): val is { images: Image[]; next?: string } {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return Array.isArray(obj["images"]) && obj["images"].every(isImage);
}

function isFlavorsResponse(val: unknown): val is { flavors: Flavor[] } {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return Array.isArray(obj["flavors"]) && obj["flavors"].every(isFlavor);
}

function isFlavorDetail(val: unknown): val is FlavorDetail {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj["id"] === "string" &&
    typeof obj["name"] === "string" &&
    typeof obj["vcpus"] === "number" &&
    typeof obj["ram"] === "number" &&
    typeof obj["disk"] === "number"
  );
}

function isFlavorDetailsResponse(val: unknown): val is { flavors: FlavorDetail[] } {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return Array.isArray(obj["flavors"]) && obj["flavors"].every(isFlavorDetail);
}

/**
 * POST /servers 응답은 축약형 — `{ server: { id, links, security_groups, adminPass } }`
 * 처럼 name/status/addresses 가 없다. id 만 검증한다 (전체 정보는 get 으로 재조회).
 */
function isCreateResponse(val: unknown): val is { server: { id: string } } {
  if (typeof val !== "object" || val === null) return false;
  const server = (val as Record<string, unknown>)["server"];
  if (typeof server !== "object" || server === null) return false;
  return typeof (server as Record<string, unknown>)["id"] === "string";
}

// ── IP 주소 추출 helper ───────────────────────────────────────────────────────

function hasIpAddress(server: Server): boolean {
  return Object.values(server.addresses).some((list) => list.length > 0);
}

// ── InstanceClient ────────────────────────────────────────────────────────────

export class InstanceClient {
  private readonly tokenId: string;
  private readonly computeEndpoint: string;
  private readonly imageEndpoint: string;

  constructor(tokenId: string, computeEndpoint: string, imageEndpoint: string) {
    this.tokenId = tokenId;
    this.computeEndpoint = computeEndpoint;
    this.imageEndpoint = imageEndpoint;
  }

  private authHeaders(): Record<string, string> {
    return { "X-Auth-Token": this.tokenId };
  }

  /**
   * 인스턴스 목록을 조회한다 (GET /servers/detail).
   */
  async list(): Promise<Server[]> {
    const url = `${this.computeEndpoint}/servers/detail`;
    try {
      const raw = await ky
        .get(url, {
          headers: this.authHeaders(),
          retry: 0,
          timeout: DEFAULT_TIMEOUT_MS,
        })
        .json();

      if (!isServersResponse(raw)) {
        throw new NhnCloudCliError(
          "instance list 응답 형식이 올바르지 않습니다 — servers 배열이 없습니다.",
          EXIT_API_ERROR,
        );
      }
      return raw.servers;
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  /**
   * 단일 인스턴스를 조회한다 (GET /servers/{id}).
   */
  async get(id: string): Promise<Server> {
    const url = `${this.computeEndpoint}/servers/${encodeURIComponent(id)}`;
    try {
      const raw = await ky
        .get(url, {
          headers: this.authHeaders(),
          retry: 0,
          timeout: DEFAULT_TIMEOUT_MS,
        })
        .json();

      if (!isServerResponse(raw)) {
        throw new NhnCloudCliError(
          `instance get(${id}) 응답 형식이 올바르지 않습니다 — server 객체가 없습니다.`,
          EXIT_API_ERROR,
        );
      }
      return raw.server;
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  /**
   * 인스턴스를 생성한다 (POST /servers).
   * NHN 확장 필드(ephemeralDiskSize / protect)는 정의됐을 때만 payload 에 포함한다.
   * userDataBase64 도 정의됐을 때만 `user_data` 로 포함한다 (인코딩은 command 단에서 완료).
   */
  async create(params: CreateServerParams): Promise<Server> {
    const url = `${this.computeEndpoint}/servers`;

    const serverBody: Record<string, unknown> = {
      name: params.name,
      flavorRef: params.flavorRef,
      networks: params.networks.map((uuid) => ({ uuid })),
    };

    if (params.bootVolumeSize !== undefined) {
      // boot-from-volume: image 를 root 볼륨에 풀어 부팅한다.
      // NHN Cloud 의 GPU(g2) 등 일부 flavor 는 이 방식이 필수다 (로컬 디스크 부팅 미지원).
      // imageRef 는 넣지 않는다 — block device 의 source(image)가 그 역할을 한다.
      serverBody["block_device_mapping_v2"] = [
        {
          boot_index: 0,
          uuid: params.imageRef,
          source_type: "image",
          destination_type: "volume",
          volume_size: params.bootVolumeSize,
          delete_on_termination: true,
        },
      ];
    } else {
      serverBody["imageRef"] = params.imageRef;
    }

    if (params.keyName !== undefined) {
      serverBody["key_name"] = params.keyName;
    }
    if (params.securityGroups !== undefined) {
      serverBody["security_groups"] = params.securityGroups.map((name) => ({ name }));
    }
    if (params.ephemeralDiskSize !== undefined) {
      serverBody["NHN-EXT-ATTR:ephemeral_disk_size"] = params.ephemeralDiskSize;
    }
    if (params.protect !== undefined) {
      serverBody["NHN-EXT-ATTR:protect"] = params.protect;
    }
    if (params.userDataBase64 !== undefined) {
      serverBody["user_data"] = params.userDataBase64;
    }

    let raw: unknown;
    try {
      raw = await ky
        .post(url, {
          headers: this.authHeaders(),
          json: { server: serverBody },
          retry: 0,
          timeout: DEFAULT_TIMEOUT_MS,
        })
        .json();
    } catch (err) {
      throw toNhnCloudCliError(err);
    }

    // POST 응답은 축약형(server.id 만 보장) — 전체 Server 정보는 get 으로 재조회한다.
    if (!isCreateResponse(raw)) {
      throw new NhnCloudCliError(
        "instance create 응답에 server.id 가 없습니다.",
        EXIT_API_ERROR,
      );
    }
    return this.get(raw.server.id);
  }

  /**
   * 인스턴스를 삭제한다 (DELETE /servers/{id}, 204 No Content).
   */
  async delete(id: string): Promise<void> {
    const url = `${this.computeEndpoint}/servers/${encodeURIComponent(id)}`;
    try {
      await ky.delete(url, {
        headers: this.authHeaders(),
        retry: 0,
        timeout: DEFAULT_TIMEOUT_MS,
      });
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  /**
   * 인스턴스 타입(flavor)을 조회한다.
   * - 기본: GET /flavors (id·name·links 요약)
   * - detail: GET /flavors/detail (vcpus·ram·disk 등 스펙 포함)
   * minDisk(GB)·minRam(MB)는 NHN docs 의 쿼리 파라미터로 그대로 전달한다.
   */
  async listFlavors(params?: FlavorListParams & { detail?: false }): Promise<Flavor[]>;
  async listFlavors(params: FlavorListParams & { detail: true }): Promise<FlavorDetail[]>;
  async listFlavors(
    params: FlavorListParams & { detail?: boolean } = {},
  ): Promise<Flavor[] | FlavorDetail[]> {
    const path = params.detail ? "/flavors/detail" : "/flavors";
    const url = `${this.computeEndpoint}${path}`;

    const searchParams: Record<string, number> = {};
    if (params.minDisk !== undefined) searchParams["minDisk"] = params.minDisk;
    if (params.minRam !== undefined) searchParams["minRam"] = params.minRam;

    try {
      const raw = await ky
        .get(url, {
          headers: this.authHeaders(),
          searchParams,
          retry: 0,
          timeout: DEFAULT_TIMEOUT_MS,
        })
        .json();

      // detail 분기는 vcpus·ram·disk(number)까지 검증해 응답 스키마 드리프트 시
      // "undefined" 셀 출력 대신 명확한 에러로 차단한다. 가드가 타입을 좁히므로 단언이 필요 없다.
      if (params.detail) {
        if (!isFlavorDetailsResponse(raw)) {
          throw new NhnCloudCliError(
            "instance flavors --detail 응답 형식이 올바르지 않습니다 — vcpus·ram·disk 필드가 없습니다.",
            EXIT_API_ERROR,
          );
        }
        return raw.flavors;
      }

      if (!isFlavorsResponse(raw)) {
        throw new NhnCloudCliError(
          "instance flavors 응답 형식이 올바르지 않습니다 — flavors 배열이 없습니다.",
          EXIT_API_ERROR,
        );
      }
      return raw.flavors;
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  /**
   * 이미지 목록을 조회한다 (GET /v2/images, Glance v2).
   * compute 와 다른 host(imageEndpoint)지만 같은 Keystone 토큰을 쓴다.
   * 한 페이지(기본 limit 25)만 반환한다 — next 가 있으면 호출부가 marker 로 이어 받는다.
   */
  async listImages(params: ImageListParams = {}): Promise<ImageListResult> {
    const url = `${this.imageEndpoint}/images`;

    const searchParams: Record<string, string | number> = {};
    if (params.limit !== undefined) searchParams["limit"] = params.limit;
    if (params.marker !== undefined) searchParams["marker"] = params.marker;
    if (params.name !== undefined) searchParams["name"] = params.name;
    if (params.visibility !== undefined) searchParams["visibility"] = params.visibility;
    if (params.owner !== undefined) searchParams["owner"] = params.owner;
    if (params.status !== undefined) searchParams["status"] = params.status;

    try {
      const raw = await ky
        .get(url, {
          headers: this.authHeaders(),
          searchParams,
          retry: 0,
          timeout: DEFAULT_TIMEOUT_MS,
        })
        .json();

      if (!isImagesResponse(raw)) {
        throw new NhnCloudCliError(
          "instance images 응답 형식이 올바르지 않습니다 — images 배열이 없습니다.",
          EXIT_API_ERROR,
        );
      }
      return { images: raw.images, next: raw.next };
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  /**
   * 인스턴스가 ACTIVE 상태 + IP 1개 이상이 될 때까지 폴링한다.
   *
   * - status === "ACTIVE" + addresses 에 IP 1개 이상: 즉시 반환
   * - timeout 초과: 마지막 status 를 포함한 NhnCloudCliError(EXIT_API_ERROR)
   */
  async waitForActive(
    id: string,
    opts: { intervalMs?: number; timeoutMs: number },
  ): Promise<Server> {
    const intervalMs = opts.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const deadline = Date.now() + opts.timeoutMs;

    let lastServer: Server | null = null;

    while (Date.now() < deadline) {
      const server = await this.get(id);
      lastServer = server;

      if (server.status === "ACTIVE" && hasIpAddress(server)) {
        return server;
      }

      const remaining = deadline - Date.now();
      if (remaining <= 0) break;

      await new Promise<void>((resolve) => setTimeout(resolve, Math.min(intervalMs, remaining)));
    }

    const lastStatus = lastServer ? lastServer.status : "unknown";
    throw new NhnCloudCliError(
      `인스턴스 ${id} 가 ACTIVE 가 되지 않았습니다 (마지막 상태: ${lastStatus}). ` +
        `--wait 타임아웃(${Math.round(opts.timeoutMs / 1000)}초) 초과.`,
      EXIT_API_ERROR,
    );
  }
}
