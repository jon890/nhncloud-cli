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
  image: { id: string };
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
  /** NHN 확장: 임시 디스크 크기(GB). 정의 시에만 payload 에 포함 */
  ephemeralDiskSize?: number;
  /** NHN 확장: 삭제 방지 여부. 정의 시에만 payload 에 포함 */
  protect?: boolean;
}
