# Phase 02 — volume list/get/create 명령 (services/blockstorage)

## 목표

Block Storage 볼륨 조회·발급 명령을 추가한다.

- `volume list` — 볼륨 목록 (`GET /v2/{tenantId}/volumes`)
- `volume get <id>` — 단일 볼륨 (`GET /v2/{tenantId}/volumes/{volumeId}`)
- `volume create` — 볼륨 발급 (`POST /v2/{tenantId}/volumes`)

새 서비스이므로 **새 디렉터리** `src/services/blockstorage/` + `src/commands/volume/` 를 만든다.
endpoint 해석은 phase-01 의 `blockStorageEndpoint` 를 쓰고, 인증은 기존 Keystone `X-Auth-Token` 재사용.

> **⚠️ 1-26 (volume create = 쓰기)**: `volume create` 는 실제 볼륨을 발급하는 **쓰기 작업**(비용 발생)이라 executor 가 자율 호출하지 않는다 (코드만, 실제 발급은 수동 QA). list/get(읽기)는 executor 가 확인 가능. create 응답 축약형 여부는 수동 QA 첫 호출로 확정하되, 코드는 Cinder 표준 `{volume:{id,status,...}}` 가정으로 작성한다.
> **결정 docs(adr/CLAUDE/flow/code-architecture)는 phase-04 의 team-lead docs-first** — phase-02 는 코드만.

## 선행 의존

- **phase-01 완료** — `getIaasToken` 이 `blockStorageEndpoint` 를 반환하고 캐시에 보관하는 상태.

## API 스펙 (NHN Cloud Block Storage public-api docs 확정)

| 동작 | 메서드 + 경로 | 비고 |
|------|---------------|------|
| 목록 | `GET /v2/{tenantId}/volumes` | query `sort`/`limit`/`offset`/`marker` |
| 단건 | `GET /v2/{tenantId}/volumes/{volumeId}` | — |
| 발급 | `POST /v2/{tenantId}/volumes` | body `{"volume": {"size": N, "name"?, "description"?, "volume_type"?, "snapshot_id"?}}` |

응답 볼륨 객체 필드:

```
volumes[].{
  id, name, size(GB), status(creating/available/in-use),
  volume_type, attachments[], created_at
}
```

> `{tenantId}` 는 phase-01 의 `blockStorageEndpoint` 에 이미 포함돼 있다 — client 는 endpoint 뒤에 `/volumes` 만 붙인다.

## 새 디렉터리 / 파일 (5개)

1. `src/services/blockstorage/types.ts` — `Volume` / `VolumeAttachment` / `CreateVolumeParams` / `VolumeListParams`
2. `src/services/blockstorage/client.ts` — `BlockStorageClient`(list/get/create + 응답 타입 가드)
3. `src/commands/volume/helpers.ts` — `resolveVolumeClient(opts)` (instance/helpers.ts 의 `resolveInstanceClient` 패턴 복제, endpoint 만 `blockStorageEndpoint`)
4. `src/commands/volume/list.ts` · `src/commands/volume/get.ts` · `src/commands/volume/create.ts`
5. `src/index.ts` — `volume` 커맨드 그룹 등록 (instance 그룹 옆)

## 회피 항목 (code-review-pitfalls 사전 확인)

- **1-2 (spinner leak)**: 모든 명령에서 `resolveVolumeClient` 는 spinner **앞**, API 호출은 spinner 내부 try/catch 로 감싸고 catch 에서 `stopSpinner(false)` 후 re-throw (list/get.ts 패턴 그대로). `create` 가 발급 후 polling 등 다단계 spinner 를 쓰면 두 번째 `startSpinner` 전에 첫 spinner 를 `stopSpinner(true)` 로 닫는다 — 단, MVP 는 발급 요청 1회만(폴링 없음)으로 단순화 권장.
- **5-4 (배열 가드)**: `list` 응답의 `volumes` 배열과 각 볼륨의 `attachments` 배열을 순회하기 전에 `Array.isArray` 가드 후 요소 타입 가드. `attachments` 가 primitive 가 아니라 객체임을 가드하고, 표 셀에 넣을 때 `String(...)` 으로 안전 변환.
- **9-1 (exit code 리터럴 금지)**: 응답 형식 오류는 `EXIT_API_ERROR` **상수**, 입력 검증 오류는 `EXIT_PARAM_ERROR` **상수**. 숫자 리터럴 금지.
- **4-2 (동기화)**: `resolveVolumeClient` 의 `--region` override 처리는 `resolveInstanceClient` 와 동일 패턴 — region 허용값을 새로 정의하지 말고 phase-01 의 `blockStorageHost` 가 던지는 에러에 위임(별도 region 목록 정의 금지).

## 작업 상세

### 1. `src/services/blockstorage/types.ts`

```ts
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
  volume_type: string | null;
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
  snapshot_id?: string;
}

/** `GET /volumes` 쿼리 파라미터 */
export interface VolumeListParams {
  sort?: string;
  limit?: number;
  offset?: number;
  marker?: string;
}
```

### 2. `src/services/blockstorage/client.ts`

`InstanceClient`(instance/client.ts) 와 같은 형태 — 생성자에 `tokenId`·`blockStorageEndpoint`, `X-Auth-Token` 헤더, ky retry 0 / timeout.

응답 타입 가드(5-4): `isVolume`, `isVolumesResponse`(`volumes` 가 `Array.isArray` + every `isVolume`), `isVolumeResponse`(`volume` 이 `isVolume`).
**⚠️ `name` 은 nullable (MAJOR — isImage 선례)**: Cinder 볼륨은 `--name` 미지정 시 `name: null` 이다. 이 코드베이스는 이미 같은 교훈을 학습했다 — `src/services/instance/client.ts` 의 `isImage` 가 `(typeof name === "string" || name === null)` 로 nullable 을 허용한다("null 인 항목 하나가 페이지 전체를 거부하지 않게"). `isVolume` 도 **동일하게 name 을 `string|null` 로 허용**한다. 안 그러면 이름 없는 볼륨 하나가 `volume list`(executor read-only) 전체 200 응답을 `EXIT_API_ERROR` 로 거부한다. `volume_type` 도 nullable 가능성이 있어 최소 보장 필드(id·size·status)만 strict 로 두고 나머지는 느슨하게.

```ts
function isVolume(val: unknown): val is Volume {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj["id"] === "string" &&
    (typeof obj["name"] === "string" || obj["name"] === null) &&  // nullable (isImage 선례)
    typeof obj["size"] === "number" &&
    typeof obj["status"] === "string" &&
    Array.isArray(obj["attachments"])
  );
}
```
`create` 응답은 발급 직후라 `status==="creating"` 일 수 있으므로 `isVolumeResponse` 로 검증(축약형 여부는 수동 QA 첫 호출로 확정 — Cinder 표준은 전체 볼륨 객체 반환 가정).

```ts
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
      const raw = await ky.get(url, { headers: this.authHeaders(), searchParams, retry: 0, timeout: DEFAULT_TIMEOUT_MS }).json();
      if (!isVolumesResponse(raw)) {
        throw new NhnCloudCliError("volume list 응답 형식이 올바르지 않습니다 — volumes 배열이 없습니다.", EXIT_API_ERROR);
      }
      return raw.volumes;
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  async get(id: string): Promise<Volume> { /* GET /volumes/{id}, isVolumeResponse 가드 */ }

  async create(params: CreateVolumeParams): Promise<Volume> {
    const url = `${this.endpoint}/volumes`;
    const volumeBody: Record<string, unknown> = { size: params.size };
    if (params.name !== undefined) volumeBody["name"] = params.name;
    if (params.description !== undefined) volumeBody["description"] = params.description;
    if (params.volume_type !== undefined) volumeBody["volume_type"] = params.volume_type;
    if (params.snapshot_id !== undefined) volumeBody["snapshot_id"] = params.snapshot_id;
    try {
      const raw = await ky.post(url, { headers: this.authHeaders(), json: { volume: volumeBody }, retry: 0, timeout: DEFAULT_TIMEOUT_MS }).json();
      if (!isVolumeResponse(raw)) {
        throw new NhnCloudCliError("volume create 응답에 volume 객체가 없습니다.", EXIT_API_ERROR);
      }
      return raw.volume;
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }
}
```

> NHN docs 의 `POST /volumes` 예제 JSON 으로 응답 형태를 1:1 대조한다(CLAUDE.md API 스펙 확인 절차). Cinder 가 발급 응답을 축약형으로 주면(instance create 처럼 id 만) `create` 가 get 재조회하도록 바꾼다 — phase-02 첫 실제 호출에서 확인.

### 3. `src/commands/volume/helpers.ts` — `resolveVolumeClient`

`resolveInstanceClient` 복제 + endpoint 만 `blockStorageEndpoint`:

```ts
import { resolveProfileName, getIaasCredential } from "../../config/credentials.js";
import { getIaasToken } from "../../api/keystone.js";
import { BlockStorageClient } from "../../services/blockstorage/client.js";

export async function resolveVolumeClient(opts: {
  profile?: string;
  region?: string;
}): Promise<{ client: BlockStorageClient; profileName: string }> {
  const profileName = await resolveProfileName(opts.profile);
  const iaas = await getIaasCredential(profileName);
  const effectiveIaas = opts.region ? { ...iaas, region: opts.region } : iaas;
  const { tokenId, blockStorageEndpoint } = await getIaasToken(profileName, effectiveIaas);
  return { client: new BlockStorageClient(tokenId, blockStorageEndpoint), profileName };
}
```

### 4. command 파일

- `list.ts` — `instance/list.ts` 패턴. 표 컬럼 `["id", "name", "size", "status", "type"]`(size 는 `${s.size}` 문자열화). `attachments` 는 표에 안 넣고 `--json` 으로 노출(5-4). `--sort`/`--limit`/`--offset`/`--marker` 옵션.
- `get.ts` — `instance/get.ts` 패턴. `.argument("<id>", "볼륨 ID")`. field/value 표에 id·name·size·status·volume_type·created_at + attachments 요약(연결 server_id 목록, 배열 가드).
- `create.ts` — `--size <gb>`(필수, `requiredOption`) + `--name`/`--description`/`--volume-type`/`--snapshot-id` 옵션. `--size` 는 `Number()` 파싱 후 양의 정수 검증(`EXIT_PARAM_ERROR`). `requiredOption` 으로 강제되는 `--size` 존재는 action 내부에서 재검증 금지(4-3) — 값의 *형식*(정수>0)만 검증.

> create 출력: 발급은 부수효과 명령 — 성공 메시지는 stderr, 데이터(`--json`)는 stdout. delete.ts 의 출력 분리 패턴 참고.

### 5. `src/index.ts` — volume 커맨드 그룹 등록

```ts
import { listCommand as volumeListCommand } from "./commands/volume/list.js";
import { getCommand as volumeGetCommand } from "./commands/volume/get.js";
import { createCommand as volumeCreateCommand } from "./commands/volume/create.js";

// volume 커맨드 그룹 (instance 그룹 뒤)
const volumeCommand = new Command("volume").description("Block Storage 볼륨 관련 명령");
volumeCommand.addCommand(volumeListCommand);
volumeCommand.addCommand(volumeGetCommand);
volumeCommand.addCommand(volumeCreateCommand);
program.addCommand(volumeCommand);
```

> 이름 충돌 주의: instance 의 `listCommand`/`getCommand`/`createCommand` import 와 같은 식별자다 — alias(`as volume*Command`)로 import 한다(2-2 와 무관, 단순 충돌 회피).

## 성공 기준 (검증 명령 + 기대값)

```bash
# cwd: <repo root 또는 worktree>

# 1. 타입 체크
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l
# 기대: 0

# 2. 빌드
pnpm build
# 기대: dist/index.js 생성, exit 0

# 3. volume 그룹 + 3개 하위 명령 등록
node dist/index.js volume --help 2>&1 | grep -Ec "list|get|create"
# 기대: 3

# 4. create 의 --size 가 requiredOption (미지정 시 에러)
node dist/index.js volume create 2>&1 | grep -Ec "required option|--size"
# 기대: 1 이상 (size 누락 안내)

# 5. spinner ↔ resolveVolumeClient 순서 (1-2) — resolver 가 spinner 앞
for f in src/commands/volume/list.ts src/commands/volume/get.ts; do
  awk '/\.action\(async/,/^  \}\)\;/' "$f" | grep -nE "(startSpinner|resolveVolumeClient)" | head -3
done
# 기대: 각 파일에서 resolveVolumeClient 가 startSpinner 보다 먼저 등장

# 6. attachments/volumes 배열 가드 (5-4) — Array.isArray 가 client 가드에 존재
grep -cE "Array\.isArray" src/services/blockstorage/client.ts
# 기대: 2 이상 (volumes + attachments)

# 7. exit code 리터럴 없음 (9-1)
grep -rnE "NhnCloudCliError\([^,]+,\s*[0-9]+" src/services/blockstorage/ src/commands/volume/ | wc -l
# 기대: 0

# 8. requiredOption 뒤 dead 재검증 없음 (4-3)
grep -nE "if \(!opts\.size\)" src/commands/volume/create.ts | wc -l
# 기대: 0 (존재 검증은 requiredOption 이 담당 — 형식 검증만 둠)
```

## 수동 확인 (실측 — 자격증명 필요, 사용자/구현자 직접 수행)

```bash
# Block Storage host/경로 첫 실제 호출 검증 (phase-01 host 확정 + create 응답 형태)
#   <volume-id>: 발급된 볼륨 id (placeholder — 실제 UUID 노출 금지)

# (a) 목록 — 200 + volumes 배열
node dist/index.js volume list --json | head -40
# 기대: volumes[].{id,name,size,status,volume_type,attachments,created_at} 형태

# (b) 발급 — 최소 인자(--size)로 1GB 볼륨 생성 후 status 확인
node dist/index.js volume create --size 10 --name test-vol --json
# 기대: 발급된 volume 객체(status creating/available). 응답이 축약형이면 client.create 를 get 재조회로 보강

# (c) 단건 — 발급된 id 로 조회
node dist/index.js volume get <volume-id> --json
# 기대: 단일 volume 객체

# 정리: 실측 후 테스트 볼륨은 삭제(콘솔 또는 후속 delete 명령) — 비용 발생 리소스
```

> 실측에서 `create` 응답이 instance create 처럼 축약형이면 `client.create` 가 `get` 재조회하도록 보강한 뒤 확정한다(추측 구현 금지 — CLAUDE.md API 스펙 확인 절차).
