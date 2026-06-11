# Phase 03 — instance volume attach/detach/volumes (실측 후 compute endpoint)

## 목표

인스턴스에 볼륨을 연결·해제·조회하는 명령을 추가한다.

- `instance volume attach <id> --volume <volumeId>` — 연결
- `instance volume detach <id> <volumeId>` — 해제
- `instance volumes <id>` — 인스턴스에 연결된 볼륨 목록

이들은 **Block Storage(volumev2)가 아니라 compute endpoint 의 Nova `os-volume_attachments` 확장**을 쓴다.
따라서 `src/services/instance/client.ts`(`InstanceClient`, computeEndpoint)에 메서드를 추가하고,
새 명령은 `src/commands/instance/` 에 둔다(volume 그룹이 아니라 instance 그룹의 하위).

## ⚠️ os-volume_attachments — Nova 표준으로 설계, 쓰기 실측은 수동 QA (1-26)

`os-volume_attachments` 는 **OpenStack Nova 표준 확장**이고 NHN Instance 는 Nova v2 호환([[adr-010]])이라 **지원을 기본 전제**로 설계한다. 단 attach(POST)·detach(DELETE)는 **실제 인스턴스에 볼륨을 붙이고 떼는 쓰기 작업**이라 executor 가 자율 호출하지 않는다 (사용자 정책: 코드만, 실제 attach/detach 는 수동 QA — 1-26).

- **executor 가 할 수 있는 read-only 확인**: 기존 인스턴스에 `GET .../os-volume_attachments`(연결 목록) 1회 호출로 **endpoint 지원 여부(200 vs 404/501)와 응답 필드명**을 확인한다 (읽기 전용 — 안전). 200 이면 지원 확정·필드명 1:1 반영.
- **쓰기(attach/detach) 실측 = 수동 QA**: 실제 attach/detach round-trip 은 사용자가 테스트 인스턴스+볼륨으로 확인한다 (아래 "수동 확인" 절).
- **필드명 견고성 (1-27)**: 응답 필드는 Nova 표준 `volumeAttachment.{id, serverId, volumeId, device}` 로 가정하되, `volumeId`/`volume_id` 혼재 가능성에 가드를 양쪽 수용하게 한다.
- **read-only GET 가 404/501 (genuinely 미지원)**: phase 를 `blocked` 로 두고 사용자 보고 (attach/detach 제외하고 list/get/create 만, 또는 Block Storage 별도 attach API 재조사).

```bash
# 실측 (자격증명 필요). placeholder 치환:
#   <token>: Keystone X-Auth-Token,  <compute-host>: <region>-api-instance-infrastructure.nhncloudservice.com
#   <tenant-id> / <instance-id> / <volume-id>: 실제 값 (노출 금지 — placeholder)

# (a) 연결 목록 — 200 + volumeAttachments 배열이면 지원 확정
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "X-Auth-Token: <token>" \
  "https://<compute-host>/v2/<tenant-id>/servers/<instance-id>/os-volume_attachments"
# 기대: 200 (404/501 이면 미지원 → 아래 분기)

# (b) 연결 — phase-02 에서 발급한 available 볼륨을 attach
curl -s -X POST \
  -H "X-Auth-Token: <token>" -H "Content-Type: application/json" \
  -d '{"volumeAttachment": {"volumeId": "<volume-id>"}}' \
  "https://<compute-host>/v2/<tenant-id>/servers/<instance-id>/os-volume_attachments"
# 기대: 200/202 + volumeAttachment.{device,id,serverId,volumeId}
#   ⚠️ 필드명 실측 확정: docs 는 volumeId(camel) 로 표기하나 Nova 표준은 volumeId/volume_id 혼재 — 응답 JSON 으로 1:1 확인

# (c) 해제 — DELETE
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE \
  -H "X-Auth-Token: <token>" \
  "https://<compute-host>/v2/<tenant-id>/servers/<instance-id>/os-volume_attachments/<volume-id>"
# 기대: 202 (무응답 본문)
```

> 위 curl 중 **(a) GET 은 read-only 라 executor 가 실행해 지원 여부 확인 가능**. **(b) POST attach·(c) DELETE detach 는 쓰기라 수동 QA** (사용자가 테스트 인스턴스+볼륨으로). executor 는 (a)만 한다.

### 결과 분기

- **(a) GET 200**: 지원 확정. Nova 표준 응답 필드명(`device`/`id`/`serverId`/`volumeId`)을 GET 응답 JSON 과 1:1 로 맞추고 구현. attach/detach 의 실제 동작은 수동 QA 로 확정.
- **(a) GET 404/501 (미지원)**: phase 를 멈추고 `index.json` 의 `status` 를 `blocked`, `blocked_reason` 에 기록 후 사용자 보고 (attach 제외, list·create 만 / Block Storage attach API 재조사).
- list/get/create(phase-02)는 실측과 무관하게 확정 — phase-03 blocked 여도 phase-02 까지 완료 가능.
- **egress 막혀 GET 도 불가**: Nova 표준 전제로 코드는 작성하되(지원 가정), 지원 여부 확정은 수동 QA 로 미루고 그 사실을 보고한다.

## API 스펙 (실측으로 확정 대상)

| 동작 | 메서드 + 경로(compute endpoint) | body / 응답 |
|------|--------------------------------|-------------|
| 연결 목록 | `GET /v2/{tenantId}/servers/{serverId}/os-volume_attachments` | 응답 `volumeAttachments[].{device,id,serverId,volumeId}` |
| 연결 | `POST /v2/{tenantId}/servers/{serverId}/os-volume_attachments` | body `{"volumeAttachment": {"volumeId": "<id>"}}`, 응답 `volumeAttachment.{device,id,serverId,volumeId}` |
| 해제 | `DELETE /v2/{tenantId}/servers/{serverId}/os-volume_attachments/{volumeId}` | 202, 본문 없음 |

> `{tenantId}` 는 `computeEndpoint` 에 이미 포함 — client 는 `${computeEndpoint}/servers/{serverId}/os-volume_attachments...` 로 구성.

## 변경 파일 (4개)

1. `src/services/instance/types.ts` — `VolumeAttachment` 타입 추가 (Nova 응답 형태, blockstorage 의 것과 별개 — 필드명 다름)
2. `src/services/instance/client.ts` — `InstanceClient` 에 `listVolumeAttachments` / `attachVolume` / `detachVolume` 추가
3. `src/commands/instance/volume.ts` + `src/commands/instance/volumes.ts` — `instance volume attach/detach` 서브그룹 + `instance volumes` 단일 명령
4. `src/index.ts` — instance 그룹에 `volume`(attach/detach 서브그룹) + `volumes` 등록

## 회피 항목 (code-review-pitfalls 사전 확인)

- **1-2 (spinner leak)**: `resolveInstanceClient` 는 spinner 앞, API 호출은 spinner 내부 try/catch + `stopSpinner(false)` 후 re-throw. attach 후 상태 폴링을 넣지 않는다(MVP — 요청 1회).
- **5-4 (배열 가드)**: `listVolumeAttachments` 응답의 `volumeAttachments` 배열을 `Array.isArray` 가드 후 요소 타입 가드. 표 셀 값은 `String(...)` 안전 변환.
- **9-1 (exit code 리터럴 금지)**: 응답 형식 오류 `EXIT_API_ERROR` 상수, `--volume` 누락은 `requiredOption`(attach). 숫자 리터럴 금지.
- **4-2 (동기화)**: attach/detach 는 compute endpoint 라 region 맵을 새로 안 건드린다 — `resolveInstanceClient` 그대로 재사용(host 맵 추가 없음). region 집합 동기화는 phase-01 에서 이미 검증.

## 작업 상세

### 1. `src/services/instance/types.ts`

> Nova 의 attachment 응답은 blockstorage(Cinder)의 `VolumeAttachment`(server_id/volume_id snake)와 **필드명이 다르다**(serverId/volumeId camel). 같은 이름이 두 서비스에 생기므로 instance 쪽은 `ServerVolumeAttachment` 로 명명해 충돌·혼동을 피한다.

```ts
/** Nova os-volume_attachments 응답 항목 (compute endpoint — Cinder 의 VolumeAttachment 와 필드명 다름) */
export interface ServerVolumeAttachment {
  /** 게스트에 노출되는 디바이스 경로 (예: /dev/vdb) */
  device: string;
  /** attachment id (= 보통 volumeId 와 동일) */
  id: string;
  serverId: string;
  volumeId: string;
}
```

### 2. `src/services/instance/client.ts` — InstanceClient 메서드 추가

```ts
/** 인스턴스에 연결된 볼륨 목록 (GET .../os-volume_attachments). */
async listVolumeAttachments(serverId: string): Promise<ServerVolumeAttachment[]> {
  const url = `${this.computeEndpoint}/servers/${encodeURIComponent(serverId)}/os-volume_attachments`;
  try {
    const raw = await ky.get(url, { headers: this.authHeaders(), retry: 0, timeout: DEFAULT_TIMEOUT_MS }).json();
    if (!isVolumeAttachmentsResponse(raw)) {
      throw new NhnCloudCliError("instance volumes 응답 형식이 올바르지 않습니다 — volumeAttachments 배열이 없습니다.", EXIT_API_ERROR);
    }
    return raw.volumeAttachments;
  } catch (err) { throw toNhnCloudCliError(err); }
}

/** 볼륨을 인스턴스에 연결 (POST .../os-volume_attachments). */
async attachVolume(serverId: string, volumeId: string): Promise<ServerVolumeAttachment> {
  const url = `${this.computeEndpoint}/servers/${encodeURIComponent(serverId)}/os-volume_attachments`;
  try {
    const raw = await ky.post(url, {
      headers: this.authHeaders(),
      json: { volumeAttachment: { volumeId } },
      retry: 0, timeout: DEFAULT_TIMEOUT_MS,
    }).json();
    if (!isVolumeAttachmentResponse(raw)) {
      throw new NhnCloudCliError("instance volume attach 응답에 volumeAttachment 가 없습니다.", EXIT_API_ERROR);
    }
    return raw.volumeAttachment;
  } catch (err) { throw toNhnCloudCliError(err); }
}

/** 볼륨 연결 해제 (DELETE .../os-volume_attachments/{volumeId}, 202 무응답). */
async detachVolume(serverId: string, volumeId: string): Promise<void> {
  const url = `${this.computeEndpoint}/servers/${encodeURIComponent(serverId)}/os-volume_attachments/${encodeURIComponent(volumeId)}`;
  try {
    await ky.delete(url, { headers: this.authHeaders(), retry: 0, timeout: DEFAULT_TIMEOUT_MS });
  } catch (err) { throw toNhnCloudCliError(err); }
}
```

타입 가드(5-4):

```ts
function isServerVolumeAttachment(val: unknown): val is ServerVolumeAttachment {
  if (typeof val !== "object" || val === null) return false;
  const o = val as Record<string, unknown>;
  return typeof o["id"] === "string" && typeof o["volumeId"] === "string";
}
function isVolumeAttachmentsResponse(val: unknown): val is { volumeAttachments: ServerVolumeAttachment[] } {
  if (typeof val !== "object" || val === null) return false;
  const arr = (val as Record<string, unknown>)["volumeAttachments"];
  return Array.isArray(arr) && arr.every(isServerVolumeAttachment);
}
function isVolumeAttachmentResponse(val: unknown): val is { volumeAttachment: ServerVolumeAttachment } {
  if (typeof val !== "object" || val === null) return false;
  return isServerVolumeAttachment((val as Record<string, unknown>)["volumeAttachment"]);
}
```

> 가드의 필수 필드(`id`/`volumeId`)는 실측 JSON 으로 확정한 최소 보장 필드만 검사한다. `device`/`serverId` 가 응답에 항상 오는지 실측으로 확인하고, 항상 오면 가드에 추가한다.

### 3. command 파일

`instance volume` 은 attach/detach 두 동작을 묶는 **서브그룹**, `instance volumes` 는 조회 단일 명령이다.

`src/commands/instance/volume.ts`:

```ts
// instance volume attach <id> --volume <volumeId>
const attachCommand = new Command("attach")
  .description("볼륨을 인스턴스에 연결한다")
  .argument("<id>", "인스턴스 ID")
  .requiredOption("--volume <volumeId>", "연결할 볼륨 ID")
  .option("--region <region>", "region override")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (id: string, _o: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<{ volume: string; region?: string; profile?: string }>();
    const { client } = await resolveInstanceClient(opts);
    startSpinner("볼륨 연결 중...");
    let att;
    try { att = await client.attachVolume(id, opts.volume); }
    catch (e) { stopSpinner(false); throw e; }
    stopSpinner(true);
    // 부수효과 명령: 성공은 stderr, 데이터는 --json 으로 stdout
    output(opts, { headers: ["field","value"], rows: [["device",att.device],["volumeId",att.volumeId],["serverId",att.serverId]], raw: att, ids: [att.id] });
  });

// instance volume detach <id> <volumeId>
const detachCommand = new Command("detach")
  .description("볼륨 연결을 해제한다")
  .argument("<id>", "인스턴스 ID")
  .argument("<volumeId>", "해제할 볼륨 ID")
  // ... resolveInstanceClient → spinner try/catch → client.detachVolume → stderr 성공 메시지

export const volumeCommand = new Command("volume").description("인스턴스 볼륨 연결/해제");
volumeCommand.addCommand(attachCommand);
volumeCommand.addCommand(detachCommand);
```

`src/commands/instance/volumes.ts`(조회):

```ts
// instance volumes <id> — list.ts 패턴, 표 컬럼 ["id","volumeId","device"]
export const volumesCommand = new Command("volumes")
  .description("인스턴스에 연결된 볼륨 목록을 조회한다")
  .argument("<id>", "인스턴스 ID")
  // resolveInstanceClient → spinner try/catch → client.listVolumeAttachments(id) → output
```

> attach 가 requiredOption(`--volume`)으로 강제하는 값은 action 내부 재검증 금지(4-3).

### 4. `src/index.ts` — instance 그룹에 등록

```ts
import { volumeCommand as instanceVolumeCommand } from "./commands/instance/volume.js";
import { volumesCommand } from "./commands/instance/volumes.js";
// ...
instanceCommand.addCommand(instanceVolumeCommand);  // instance volume attach/detach
instanceCommand.addCommand(volumesCommand);         // instance volumes
```

## 성공 기준 (검증 명령 + 기대값)

> ⚠️ 실측(위 "구현 전 필수 실측")에서 os-volume_attachments 지원을 확인한 **뒤에만** 아래 코드 성공 기준을 적용한다. 미지원이면 phase blocked 처리(코드 변경 없음).

```bash
# cwd: <repo root 또는 worktree>

# 1. 타입 체크
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l
# 기대: 0

# 2. 빌드
pnpm build
# 기대: dist/index.js 생성, exit 0

# 3. instance volume 서브그룹(attach/detach) + instance volumes 등록
node dist/index.js instance volume --help 2>&1 | grep -Ec "attach|detach"
# 기대: 2
node dist/index.js instance --help 2>&1 | grep -Ec "volume|volumes"
# 기대: 1 이상 (volume 그룹 + volumes 명령)

# 4. attach 의 --volume 가 requiredOption
node dist/index.js instance volume attach some-id 2>&1 | grep -Ec "required option|--volume"
# 기대: 1 이상

# 5. volumeAttachments 배열 가드 (5-4)
grep -cE "Array\.isArray" src/services/instance/client.ts
# 기대: 1 이상 (volumeAttachments — 기존 가드와 합산)

# 6. exit code 리터럴 없음 (9-1)
grep -rnE "NhnCloudCliError\([^,]+,\s*[0-9]+" src/commands/instance/volume.ts src/commands/instance/volumes.ts 2>/dev/null | wc -l
# 기대: 0

# 7. detach 가 202 무응답 — .json() 호출 없이 ky.delete 만 (응답 파싱 안 함)
grep -nE "detachVolume" src/services/instance/client.ts >/dev/null && grep -A 6 "async detachVolume" src/services/instance/client.ts | grep -c "\.json()"
# 기대: 0 (delete 는 본문 파싱 안 함)
```

## 수동 확인 (실측 — 자격증명 + 실제 인스턴스/볼륨 필요)

```bash
# phase-02 에서 발급한 available 볼륨 + 기존 인스턴스로 attach → volumes → detach 1회 왕복
#   <instance-id> / <volume-id>: placeholder (실제 UUID 노출 금지)

node dist/index.js instance volume attach <instance-id> --volume <volume-id> --json
# 기대: volumeAttachment.{device,id,serverId,volumeId}

node dist/index.js instance volumes <instance-id> --json
# 기대: 방금 연결한 volumeId 가 목록에 포함

node dist/index.js instance volume detach <instance-id> <volume-id>
# 기대: 성공 메시지(stderr), 이후 instance volumes 에서 해당 volumeId 사라짐
```

> 실측 응답 JSON 으로 요청 body 키(`volumeId`)·응답 필드명을 1:1 확정한 뒤 client·타입 가드를 그 값에 맞춘다.
