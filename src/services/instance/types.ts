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
}
