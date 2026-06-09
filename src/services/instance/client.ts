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
  Keypair,
  KeypairDetail,
  CreateKeypairParams,
  CreateKeypairResult,
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

// ── 키페어 타입 가드 ──────────────────────────────────────────────────────────

function isKeypair(val: unknown): val is Keypair {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj["name"] === "string" &&
    typeof obj["public_key"] === "string" &&
    typeof obj["fingerprint"] === "string"
  );
}

/** 목록 응답: { keypairs: [{ keypair: {...} }] } — 원소가 한 단계 더 감싸짐 */
function isKeypairsResponse(val: unknown): val is { keypairs: { keypair: Keypair }[] } {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    Array.isArray(obj["keypairs"]) &&
    obj["keypairs"].every((e) => {
      if (typeof e !== "object" || e === null) return false;
      return isKeypair((e as Record<string, unknown>)["keypair"]);
    })
  );
}

/** 단건/생성 응답: { keypair: {...} } — name·public_key·fingerprint 검증 */
function isKeypairResponse(val: unknown): val is { keypair: Record<string, unknown> } {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return isKeypair(obj["keypair"]);
}

function isKeypairDetail(val: unknown): val is KeypairDetail {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj["name"] === "string" &&
    typeof obj["public_key"] === "string" &&
    typeof obj["fingerprint"] === "string" &&
    typeof obj["user_id"] === "string" &&
    typeof obj["id"] === "string" &&
    typeof obj["created_at"] === "string"
  );
}

function isKeypairDetailResponse(val: unknown): val is { keypair: KeypairDetail } {
  if (typeof val !== "object" || val === null) return false;
  return isKeypairDetail((val as Record<string, unknown>)["keypair"]);
}

// ── IP 주소 추출 helper ───────────────────────────────────────────────────────

function hasIpAddress(server: Server): boolean {
  return Object.values(server.addresses).some((list) => list.length > 0);
}

// ── InstanceClient ────────────────────────────────────────────────────────────

export class InstanceClient {
  private readonly tokenId: string;
  private readonly computeEndpoint: string;

  constructor(tokenId: string, computeEndpoint: string) {
    this.tokenId = tokenId;
    this.computeEndpoint = computeEndpoint;
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
   * 서버 action 을 실행한다 (POST /servers/{id}/action, 202 무본문).
   * NHN Cloud(OpenStack Nova)의 모든 전원·라이프사이클 action 의 공용 경로다.
   * payload 는 호출자가 action 별로 구성한다 (예: { "os-start": null }).
   * start/stop/reboot 가 이 helper 를 재사용하며, resize/shelve 등 향후 action 도 동일.
   */
  private async serverAction(id: string, payload: Record<string, unknown>): Promise<void> {
    const url = `${this.computeEndpoint}/servers/${encodeURIComponent(id)}/action`;
    try {
      await ky.post(url, {
        headers: this.authHeaders(),
        json: payload,
        retry: 0,
        timeout: DEFAULT_TIMEOUT_MS,
      });
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  /** 인스턴스를 시작한다 (SHUTOFF → ACTIVE). */
  async start(id: string): Promise<void> {
    return this.serverAction(id, { "os-start": null });
  }

  /** 인스턴스를 정지한다 (ACTIVE/ERROR → SHUTOFF). */
  async stop(id: string): Promise<void> {
    return this.serverAction(id, { "os-stop": null });
  }

  /** 인스턴스를 재부팅한다. type 기본 SOFT, HARD 는 강제 전원 cycle. */
  async reboot(id: string, type: "SOFT" | "HARD" = "SOFT"): Promise<void> {
    return this.serverAction(id, { reboot: { type } });
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

  /** 키페어 목록을 조회한다 (GET /os-keypairs). 응답 원소의 한겹(keypair)을 풀어 반환. */
  async listKeypairs(): Promise<Keypair[]> {
    const url = `${this.computeEndpoint}/os-keypairs`;
    try {
      const raw = await ky
        .get(url, { headers: this.authHeaders(), retry: 0, timeout: DEFAULT_TIMEOUT_MS })
        .json();
      if (!isKeypairsResponse(raw)) {
        throw new NhnCloudCliError(
          "instance keypairs 응답 형식이 올바르지 않습니다 — keypairs 배열이 없습니다.",
          EXIT_API_ERROR,
        );
      }
      return raw.keypairs.map((e) => e.keypair);
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  /** 단일 키페어를 조회한다 (GET /os-keypairs/{name}). */
  async getKeypair(name: string): Promise<KeypairDetail> {
    const url = `${this.computeEndpoint}/os-keypairs/${encodeURIComponent(name)}`;
    try {
      const raw = await ky
        .get(url, { headers: this.authHeaders(), retry: 0, timeout: DEFAULT_TIMEOUT_MS })
        .json();
      if (!isKeypairDetailResponse(raw)) {
        throw new NhnCloudCliError(
          `instance keypair get(${name}) 응답 형식이 올바르지 않습니다 — keypair 상세 필드가 없습니다.`,
          EXIT_API_ERROR,
        );
      }
      return raw.keypair;
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  /**
   * 키페어를 생성한다 (POST /os-keypairs).
   * publicKey 미지정이면 NHN 이 키쌍을 생성하고 응답 keypair 에 private_key 가 1회성으로 포함된다.
   * publicKey 지정이면 기존 공개키를 등록하고 private_key 는 응답에 없다.
   */
  async createKeypair(params: CreateKeypairParams): Promise<CreateKeypairResult> {
    const url = `${this.computeEndpoint}/os-keypairs`;
    const keypairBody: Record<string, unknown> = { name: params.name };
    if (params.publicKey !== undefined) {
      keypairBody["public_key"] = params.publicKey;
    }
    let raw: unknown;
    try {
      raw = await ky
        .post(url, {
          headers: this.authHeaders(),
          json: { keypair: keypairBody },
          retry: 0,
          timeout: DEFAULT_TIMEOUT_MS,
        })
        .json();
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
    if (!isKeypairResponse(raw)) {
      throw new NhnCloudCliError(
        "instance keypair create 응답 형식이 올바르지 않습니다 — keypair 객체가 없습니다.",
        EXIT_API_ERROR,
      );
    }
    const kp = raw.keypair;
    return {
      name: kp["name"] as string,
      public_key: kp["public_key"] as string,
      fingerprint: kp["fingerprint"] as string,
      user_id: typeof kp["user_id"] === "string" ? kp["user_id"] : "",
      private_key: typeof kp["private_key"] === "string" ? kp["private_key"] : undefined,
    };
  }

  /** 키페어를 삭제한다 (DELETE /os-keypairs/{name}, 202/204 무응답). */
  async deleteKeypair(name: string): Promise<void> {
    const url = `${this.computeEndpoint}/os-keypairs/${encodeURIComponent(name)}`;
    try {
      await ky.delete(url, { headers: this.authHeaders(), retry: 0, timeout: DEFAULT_TIMEOUT_MS });
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
