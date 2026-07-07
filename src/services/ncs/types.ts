/**
 * NCS(NHN Container Service) template 타입 (ADR-020).
 * 공식 docs 예제 JSON(https://docs.nhncloud.com/ko/Container/NCS/ko/public-api/) 실측 확정 필드.
 * 수치 필드(versionCount·workloadCount)는 서비스 관례상 string 혼재 가능성이 있어 string|number 허용(6-2 회피).
 */
export interface NcsTemplateSummary {
  id: string;
  name: string;
  version?: string;
  createdAt?: string;
  description?: string | null;
  versionDescription?: string | null;
  versionCount?: number | string;
  workloadCount?: number | string;
  [key: string]: unknown;
}

/**
 * NcsTemplateSummary 타입 가드.
 * 핵심 식별 필드(id·name)만 string 요구 — 나머지는 optional/nullable 허용(5-6 회피).
 */
export function isNcsTemplateSummary(val: unknown): val is NcsTemplateSummary {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return typeof obj["id"] === "string" && typeof obj["name"] === "string";
}

/** template list query 옵션 — page/size 는 API 기본 page size(10) 를 그대로 노출한다. */
export interface NcsTemplateListParams {
  page?: number;
  size?: number;
  disableContainers?: boolean;
}

/**
 * NcsTemplateDetail — `template get` 단건 조회 응답 (named 필드 `template`).
 * Summary 와 동일 핵심 필드 + containers(컨테이너 spec 배열, 정확한 필드는 실측 미확정이라 unknown[]).
 */
export interface NcsTemplateDetail extends NcsTemplateSummary {
  containers?: unknown[];
}

/** NcsTemplateDetail 타입 가드 — Summary 와 동일 필수 필드(id·name)만 검사. */
export function isNcsTemplateDetail(val: unknown): val is NcsTemplateDetail {
  return isNcsTemplateSummary(val);
}

/**
 * NcsTemplateVersionSummary — `template version list` 목록 항목.
 * version 은 숫자형 문자열("1")뿐 아니라 라벨형("second")도 관측되어 string 으로 둔다.
 */
export interface NcsTemplateVersionSummary {
  id: string;
  version: string;
  description?: string | null;
  createdAt?: string;
  workloadCount?: number | string;
  [key: string]: unknown;
}

/** NcsTemplateVersionSummary 타입 가드 — 핵심 식별 필드(id·version)만 string 요구. */
export function isNcsTemplateVersionSummary(val: unknown): val is NcsTemplateVersionSummary {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return typeof obj["id"] === "string" && typeof obj["version"] === "string";
}

/** template version list query 옵션. */
export interface NcsTemplateVersionListParams {
  q?: string;
  sort?: string;
  page?: number;
  size?: number;
}

/**
 * NcsTemplateVersionDetail — `template version get` 단건 조회 응답 (named 필드 `version`).
 * Summary 와 동일 핵심 필드 + containers(컨테이너 spec, 정확한 필드는 실측 미확정이라 unknown[]).
 */
export interface NcsTemplateVersionDetail extends NcsTemplateVersionSummary {
  containers?: unknown[];
}

/** NcsTemplateVersionDetail 타입 가드 — Summary 와 동일 필수 필드(id·version)만 검사. */
export function isNcsTemplateVersionDetail(val: unknown): val is NcsTemplateVersionDetail {
  return isNcsTemplateVersionSummary(val);
}

/**
 * NCS(NHN Container Service) workload 타입 (Phase 3, ADR-020).
 * 공식 docs 예제 JSON(https://docs.nhncloud.com/ko/Container/NCS/ko/public-api/, "워크로드" 섹션) 실측 확정 필드.
 */

/** workload list query 옵션. */
export interface NcsWorkloadListParams {
  q?: string;
  page?: number;
  size?: number;
}

/**
 * NcsWorkloadSummary — `workload list` 목록 항목.
 * status 는 docs 예제 확정 상태값(Pending/Running/Failed/Terminated/Paused/Active/Suspend).
 */
export interface NcsWorkloadSummary {
  id: string;
  name: string;
  type?: string;
  templateId?: string;
  templateVersion?: string;
  createdAt?: string;
  desired?: number;
  available?: number;
  status: string;
  url?: string;
  [key: string]: unknown;
}

/** NcsWorkloadSummary 타입 가드 — 핵심 식별 필드(id·name·status)만 검사. */
export function isNcsWorkloadSummary(val: unknown): val is NcsWorkloadSummary {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj["id"] === "string" &&
    typeof obj["name"] === "string" &&
    typeof obj["status"] === "string"
  );
}

/**
 * NcsWorkloadTaskContainer — task 내 컨테이너 런타임 상태(docs 예제 JSON 실측 확정).
 * spec 필드(env·probe·volumes 등)는 CLI 출력에 쓰이지 않아 타입을 좁히지 않고 catch-all 로 남긴다.
 */
export interface NcsWorkloadTaskContainer {
  name?: string;
  type?: string;
  image?: string;
  ip?: string;
  state?: string;
  startedAt?: string;
  finishedAt?: string;
  restartCount?: number | string;
  [key: string]: unknown;
}

/** NcsWorkloadTask — workload 의 작업(task) 단위. containers[] 가 실제 런타임 상태를 가진다. */
export interface NcsWorkloadTask {
  id: string;
  containers?: NcsWorkloadTaskContainer[];
  [key: string]: unknown;
}

/**
 * NcsWorkloadDetail — `workload get` 단건 조회 응답 (named 필드 `workload`).
 * Summary 와 동일 핵심 필드 + tasks[](런타임 상태, docs 예제 확정).
 */
export interface NcsWorkloadDetail extends NcsWorkloadSummary {
  tasks?: NcsWorkloadTask[];
}

/** NcsWorkloadDetail 타입 가드 — Summary 와 동일 필수 필드만 검사. */
export function isNcsWorkloadDetail(val: unknown): val is NcsWorkloadDetail {
  return isNcsWorkloadSummary(val);
}

/**
 * workload logs query 옵션.
 * wire 쿼리 키는 docs 확정상 `containerName` 이지만(6-2 유사 함정), CLI/client 시그니처는
 * 다른 명령(--container)과의 일관성을 위해 `container` 로 받고 client 내부에서 매핑한다.
 * container 누락 시 EXIT_PARAM_ERROR(docs: containerName 필수).
 */
export interface NcsWorkloadLogsParams {
  container: string;
  from?: string;
  to?: string;
  page?: number;
  size?: number;
}

/** NcsWorkloadLog — `workload logs` 응답 항목 (named 필드 `logs`, docs 예제 확정). */
export interface NcsWorkloadLog {
  log: string;
  time: string;
  [key: string]: unknown;
}

/** NcsWorkloadLog 타입 가드. */
export function isNcsWorkloadLog(val: unknown): val is NcsWorkloadLog {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return typeof obj["log"] === "string" && typeof obj["time"] === "string";
}

/** workload events query 옵션 (docs 확정: type/q/from/to/page/size). */
export interface NcsWorkloadEventsParams {
  type?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: number;
  size?: number;
}

/** NcsWorkloadEvent — `workload events` 응답 항목 (named 필드 `events`, docs 예제 확정). */
export interface NcsWorkloadEvent {
  type: string;
  reason: string;
  message: string;
  createTimestamp: string;
  lastTimestamp: string;
  count: number;
  [key: string]: unknown;
}

/** NcsWorkloadEvent 타입 가드 — 핵심 필드(type·reason·message)만 검사. */
export function isNcsWorkloadEvent(val: unknown): val is NcsWorkloadEvent {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj["type"] === "string" &&
    typeof obj["reason"] === "string" &&
    typeof obj["message"] === "string"
  );
}

/** workload history list query 옵션 (docs 확정: page/size/sort). */
export interface NcsWorkloadHistoryListParams {
  page?: number;
  size?: number;
  sort?: string;
}

/** NcsWorkloadHistorySummary — `workload history` 목록 항목 (named 필드 `history`, docs 예제 확정). */
export interface NcsWorkloadHistorySummary {
  id: number;
  createdAt: string;
  deletedAt?: string | null;
  templateId?: string;
  templateVersion?: string;
  name?: string;
  status: string;
  [key: string]: unknown;
}

/** NcsWorkloadHistorySummary 타입 가드 — 핵심 필드(id·status)만 검사. */
export function isNcsWorkloadHistorySummary(val: unknown): val is NcsWorkloadHistorySummary {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return typeof obj["id"] === "number" && typeof obj["status"] === "string";
}

/**
 * NcsWorkloadHistoryDetail — `workload history get` 단건 응답.
 * docs 예제 JSON 은 named 필드 `history`(요약과 동일 필드) 옆에 `template`(당시 사용한 템플릿 스냅샷)을
 * sibling 필드로 반환한다 — history 객체 안에 중첩되지 않는다. CLI 소비 편의를 위해 하나의 타입으로 합친다.
 */
export interface NcsWorkloadHistoryDetail extends NcsWorkloadHistorySummary {
  template?: unknown;
}

/** NcsWorkloadHistoryDetail 타입 가드 — Summary 와 동일 필수 필드만 검사. */
export function isNcsWorkloadHistoryDetail(val: unknown): val is NcsWorkloadHistoryDetail {
  return isNcsWorkloadHistorySummary(val);
}

/**
 * NcsWorkloadScheduleHistory — `workload schedule-history` 응답 항목
 * (named 필드 `schedulehistory`, docs 예제 확정).
 */
export interface NcsWorkloadScheduleHistory {
  id: string;
  createdAt: string;
  finishedAt?: string;
  status: string;
  [key: string]: unknown;
}

/** NcsWorkloadScheduleHistory 타입 가드 — 핵심 필드(id·status)만 검사. */
export function isNcsWorkloadScheduleHistory(val: unknown): val is NcsWorkloadScheduleHistory {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return typeof obj["id"] === "string" && typeof obj["status"] === "string";
}

/**
 * NCS(NHN Container Service) workload 생성/변경 실측 확정 (Phase 3, ADR-020).
 * 공식 docs 예제 JSON(https://docs.nhncloud.com/ko/Container/NCS/ko/public-api/, "워크로드 생성/변경/부분 변경" 섹션) 실측.
 *
 * - `POST /workloads`(create), `PUT /workloads/{id}`(update), `PATCH /workloads/{id}`(patch)
 *   모두 응답이 named 필드 `workload` 로 전체 workload 객체를 반환한다(id 만 반환하는 축약 응답이 아니다).
 *   기존 getWorkload 의 NcsWorkloadDetail·응답 타입을 그대로 재사용한다.
 * - `status` enum 은 docs 예제 JSON 상 실제로 빈 문자열(`""`)로 관측되나(생성 직후 상태 미확정 구간으로 추정),
 *   목록/조회 필드 설명에 명시된 전체 값은 `Pending`(진행중)·`Running`(완료)·`Failed`(실패)·`Terminated`(종료)·
 *   `Paused`(중지)·`Active`(예약 실행 중)·`Suspend`(예약 중지) 7종이다 — 강타입 enum 화하지 않고 string 유지(5-6 회피).
 * - `workload.internalLoadBalancing.enalbed` 는 docs 필드 표기가 오타이고, 실제 예제 JSON·응답 필드는
 *   `enabled`(정상 철자)로 온다 — 코드에서 `enalbed` 를 참조하지 않는다.
 */

/**
 * NcsMalwareConfig — `malware config get/set` 응답/요청 공용 (named 필드 없이 top-level `enabled`).
 * docs 필드 표(형식=String)와 실제 JSON 예제(`"enabled": true` — quote 없는 리터럴)가 불일치한다.
 * ADR-006 유사 함정과 동일하게 실제 wire 타입은 boolean 이다(docs 표기 오류, 실측 확정).
 */
export interface NcsMalwareConfig {
  enabled: boolean;
  [key: string]: unknown;
}

/** NcsMalwareConfig 타입 가드. */
export function isNcsMalwareConfig(val: unknown): val is NcsMalwareConfig {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return typeof obj["enabled"] === "boolean";
}

/**
 * NcsMalwareReport — `malware result` 응답의 reports[] 항목 (docs 예제 JSON 확정).
 * result 는 `Clean`/`Infected` 값을 갖지만 향후 값 추가 가능성을 열어 string 으로 둔다(5-6 회피).
 */
export interface NcsMalwareReport {
  image: string;
  digest: string;
  layer: string;
  detection: string;
  result: string;
  [key: string]: unknown;
}

/** NcsMalwareReport 타입 가드 — 핵심 필드(image·result)만 검사. */
export function isNcsMalwareReport(val: unknown): val is NcsMalwareReport {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return typeof obj["image"] === "string" && typeof obj["result"] === "string";
}

/**
 * NcsMalwareResult — `malware result` 응답 (named 필드 없이 header 와 나란히 flat top-level 필드,
 * config get/set 과 동일한 flat 패턴 — docs 예제 JSON 확정).
 * infectedFiles·scannedDirectories·scannedFiles 는 docs 형식 표기가 String 이나 예제 JSON 은
 * quote 없는 숫자 리터럴(0, 689, 4210) — malware.enabled 와 동일한 docs 표기 오류 패턴이라
 * 실제로는 number 로 오는 것이 유력하지만, 이 필드들은 CLI 출력에서 String() 캐스팅으로만 쓰여
 * number|string 양쪽을 그대로 수용해도 안전하다(6-2 회피).
 */
export interface NcsMalwareResult {
  scannedAt?: string;
  infectedFiles?: number | string;
  scannedDirectories?: number | string;
  scannedFiles?: number | string;
  reports?: NcsMalwareReport[];
  [key: string]: unknown;
}
