/** 단일 네트워크 주소 항목 */
export interface ServerAddress {
  addr: string;
  version: number;
}

/** Compute 인스턴스 (OpenStack Nova v2 표준 필드 + NHN 확장) */
export interface Server {
  id: string;
  name: string;
  status: string;
  addresses: Record<string, ServerAddress[]>;
  flavor: { id: string };
  /** boot-from-volume 인스턴스는 image 가 빈 문자열("")로 온다 (객체 아님) */
  image: { id: string } | string;
  key_name: string | null;
  created: string;
  updated: string;
}

/** flavor 응답의 링크 항목 (self / bookmark) */
export interface FlavorLink {
  href: string;
  rel: string;
}

/** 인스턴스 타입(flavor) 요약 — `GET /flavors` (id·name·links 만 보장) */
export interface Flavor {
  id: string;
  name: string;
  links: FlavorLink[];
}

/**
 * 인스턴스 타입(flavor) 상세 — `GET /flavors/detail`.
 * 요약 필드에 스펙(ram·vcpus·disk 등)이 더해진다.
 */
export interface FlavorDetail extends Flavor {
  /** 메모리 크기(MB) */
  ram: number;
  /** 가상 CPU 수 */
  vcpus: number;
  /** root 블록 스토리지 크기(GB) */
  disk: number;
  swap: string | number;
  "OS-FLV-EXT-DATA:ephemeral": number;
  "OS-FLV-DISABLED:disabled": boolean;
  "os-flavor-access:is_public": boolean;
  rxtx_factor: number;
  extra_specs?: Record<string, unknown>;
}

/** 이미지 요약 — `GET /v2/images` (Glance v2). 보장 필드는 docs 예제 기준. */
export interface Image {
  id: string;
  name: string;
  status: string;
  visibility: string;
  /** 바이트 크기 (없을 수 있음) */
  size?: number;
  owner?: string;
  created_at?: string;
}

/** 이미지 목록 조회 쿼리 파라미터 (`GET /v2/images`). docs 의 query 이름 그대로. */
export interface ImageListParams {
  limit?: number;
  marker?: string;
  name?: string;
  visibility?: string;
  owner?: string;
  status?: string;
}

/**
 * 이미지 목록 결과 — marker 페이지네이션.
 * `next` 는 다음 페이지 경로(있으면). 다음 페이지는 호출부가 marker 로 이어 받는다.
 */
export interface ImageListResult {
  images: Image[];
  next?: string;
}

/** flavor 목록 조회 쿼리 파라미터 (`GET /flavors`·`GET /flavors/detail` 공통) */
export interface FlavorListParams {
  /** 최소 블록 스토리지 크기(GB) 이상만 필터 */
  minDisk?: number;
  /** 최소 RAM 크기(MB) 이상만 필터 */
  minRam?: number;
}

/** `POST /servers` 요청 파라미터 */
export interface CreateServerParams {
  name: string;
  flavorRef: string;
  imageRef: string;
  /** 연결할 네트워크 UUID 목록 */
  networks: string[];
  keyName?: string;
  securityGroups?: string[];
  /**
   * boot-from-volume root 볼륨 크기(GB). 정의 시 imageRef 대신
   * block_device_mapping_v2(image→volume)로 발급한다.
   * NHN Cloud 의 GPU(g2) 등 일부 flavor 는 boot-from-volume 이 필수다 ([[adr-010]]).
   */
  bootVolumeSize?: number;
  /** NHN 확장: 임시 디스크 크기(GB). 정의 시에만 payload 에 포함 */
  ephemeralDiskSize?: number;
  /** NHN 확장: 삭제 방지 여부. 정의 시에만 payload 에 포함 */
  protect?: boolean;
  /**
   * base64 인코딩된 cloud-init user-data. 정의 시에만 payload 의 `user_data` 로 포함.
   * 파일 읽기·인코딩·65535 한도 검증은 command 단에서 끝낸다 ([[adr-012]]).
   */
  userDataBase64?: string;
}
