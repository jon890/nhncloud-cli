/** 볼륨 연결 정보 (in-use 볼륨이 어느 서버/디바이스에 붙었는지) */
export interface VolumeAttachment {
  server_id: string;
  device: string;
  volume_id: string;
  id: string;
}

/** Block Storage 볼륨 (Cinder volumev2) */
export interface Volume {
  id: string;
  /** 볼륨 이름 — Cinder 는 미지정 시 null (nullable, isImage 선례) */
  name: string | null;
  /** 볼륨 크기(GB) */
  size: number;
  /** creating / available / in-use 등 */
  status: string;
  /** 볼륨 타입 — nullable 가능 */
  volume_type?: string | null;
  /** 가용성 영역 — 응답에서 생략될 수 있음 */
  availability_zone?: string;
  attachments: VolumeAttachment[];
  created_at: string;
}

/** `POST /volumes` 요청 파라미터 */
export interface CreateVolumeParams {
  /** 볼륨 크기(GB) — 필수 */
  size: number;
  name?: string;
  description?: string;
  volume_type?: string;
  availability_zone?: string;
  snapshot_id?: string;
}

/** `GET /volumes/detail` 쿼리 파라미터 */
export interface VolumeListParams {
  sort?: string;
  limit?: number;
  offset?: number;
  marker?: string;
}
