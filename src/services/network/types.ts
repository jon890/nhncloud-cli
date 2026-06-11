/**
 * VPC 요약 — `GET /v2.0/vpcs` (NHN VPC). 보장 필드는 실측·docs 예제 기준.
 * `router:external` 은 콜론 포함 키라 따옴표로 선언하고 대괄호로 접근한다.
 * 실측 확정 (2026-06-11): id·name·state·cidrv4·router:external 모두 항상 존재.
 * instance create --network 가 받는 uuid 는 VPC id 임을 실측으로 확정
 * (instance addresses 키가 VPC name 과 일치).
 */
export interface Vpc {
  id: string;
  name: string;
  /** VPC IPv4 CIDR (예: 192.168.0.0/16) */
  cidrv4: string;
  /** 상태 (예: AVAILABLE) */
  state: string;
  /** 외부 라우터 연결 여부 (콜론 포함 키) */
  "router:external": boolean;
}

/**
 * 서브넷 요약 — `GET /v2.0/vpcsubnets` (NHN VPC).
 * 실측 확정 (2026-06-11): gateway·available_ip_count 모두 항상 존재.
 */
export interface VpcSubnet {
  id: string;
  /** 서브넷 CIDR (예: 192.168.0.0/24) */
  cidr: string;
  /** 소속 VPC id */
  vpc_id: string;
  /** 게이트웨이 IP */
  gateway: string;
  /** 사용 가능한 IP 수 */
  available_ip_count: number;
}
