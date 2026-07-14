# Phase 01 — volume list 를 /volumes/detail 로 전환 + 에러 메시지 구분

## 목표

`volume list` 가 볼륨이 있을 때 "volumes 배열이 없습니다" 로 실패하는 문제를 고친다.
`BlockStorageClient.list()` 를 Cinder detail 엔드포인트로 바꿔 가드가 요구하는 필드를 받게 한다.

- 검증: `pnpm tsc --noEmit`, `pnpm run build`, `pnpm test`.
- 회귀 재현 테스트: detail 응답 파싱 + `/volumes/detail` 호출 URL 확인.

## 선행 (원인 확정 — 재조사 불요)

- `BlockStorageClient.list()` (src/services/blockstorage/client.ts:53) 가 `GET ${endpoint}/volumes` 호출.
- Cinder v2/v3 에서 `GET /volumes` 는 **summary** 뷰 — `id`·`links`·`name` 만 반환하고 `size`·`status`·`attachments`·`availability_zone` 를 생략한다 (OpenStack Block Storage API 레퍼런스로 확정).
- `isVolume` 가드(client.ts:11)는 `size`(number)·`status`(string)·`attachments`(Array) 를 요구 → summary element 는 전부 실패 → `isVolumesResponse` 의 `.every(isVolume)` 가 false → `list()` 가 "volumes 배열이 없습니다" throw.
- 볼륨 0개면 `[].every(...) === true` 라 통과 → 이슈 증상(1개 이상일 때만 실패)과 정확히 일치.
- 선례: `InstanceClient` 는 목록에 `GET /servers/detail` 을 쓴다 (src/services/instance/client.ts:247) — 그래서 instance list 는 정상. volume 만 summary 를 써서 비대칭.
- detail 응답도 동일하게 `{ volumes: [...] }` 키를 쓴다 (detail list 뷰) — `isVolumesResponse`/반환 계약 변경 불요.

## 구현 항목

### 1. list() → /volumes/detail (src/services/blockstorage/client.ts)

- `list()` 의 `const url = ${this.endpoint}/volumes;` → `${this.endpoint}/volumes/detail`.
- 왜 detail 인지 1줄 주석: summary(`/volumes`)는 id·name·links 만 반환해 size·status·attachments 가 없다 → 가드 실패. instance 의 `/servers/detail` 선례와 동일.
- `get()`(`/volumes/{id}`)·`create()`(POST `/volumes`)는 변경하지 않는다 — 단건 GET·POST 는 전체 필드를 반환한다.
- 기존 쿼리 파라미터(sort·limit·offset·marker)는 detail 엔드포인트도 동일 지원 → 그대로 유지.

### 2. 에러 메시지 구분 (같은 파일, 이슈 제안 #2)

`list()` 의 `isVolumesResponse` 단일 실패 분기를 두 경우로 나눠 향후 필드 변동을 진단 가능하게 한다.

- `volumes` 키가 없거나 배열이 아니면 → 기존 문구 "volume list 응답 형식이 올바르지 않습니다 — volumes 배열이 없습니다."
- `volumes` 는 배열인데 element 가 `isVolume` 를 통과 못 하면 → 별도 문구 (예: "volume list 응답의 볼륨 항목 형식이 예상과 다릅니다 — API 응답 필드를 확인하세요.").
- 두 분기 모두 `EXIT_API_ERROR`. raw 본문 전체를 stderr 로 덤프하지는 않는다 (크기·민감정보 우려) — 메시지 구분까지만.
- 구현은 `isVolumesResponse` 대신 `list()` 안에서 `Array.isArray((raw as any)?.volumes)` 먼저 판정 후 `.every(isVolume)` 를 나눠 검사하는 형태로. 타입 가드는 유지하되 메시지 분기를 위해 조건을 풀어 쓴다.
- **`isVolumesResponse` 함수(client.ts:25-29)는 제거한다** — 유일 호출부가 list() 이고 인라인 검사로 대체되므로 orphan dead code 로 남는다 (CLAUDE.md orphan-identifier 정리 규칙). `isVolume`·`isVolumeResponse` 는 유지 (get()/create() 에서 사용 중).

### 3. tests — src/services/blockstorage/client.test.ts (list describe 추가)

기존 `create` describe 는 그대로 두고 `describe("BlockStorageClient.list")` 추가. `ky.get` 을 mock (create 테스트의 `ky.post` mock 패턴 대칭).

- **호출 URL 이 `/volumes/detail` 인지** — `expect(ky.get).toHaveBeenCalledWith("https://example.com/v2/tenant/volumes/detail", ...)` (회귀 가드 — summary 로 되돌아가면 실패).
- detail 응답(`{ volumes: [{ id, name, size, status, attachments: [], availability_zone, volume_type }] }`) → 볼륨 배열 반환·필드 보존.
- 빈 목록 `{ volumes: [] }` → `[]` 반환 (0개 정상 처리).
- summary 형태 응답(`{ volumes: [{ id, name, links }] }`, size·status·attachments 없음) → element 형식 이상 메시지로 throw (why-detail 을 문서화하는 테스트).
- sort/limit/offset/marker 전달 시 `searchParams` 에 실림 (기존 동작 유지 확인 — 선택).

### 4. task 상태

- `tasks/040-fix-volume-list-detail-endpoint/index.json` Phase 1 `completed`, `status` `completed`.

## 회피 항목 (code-review self-check)

- **new-endpoint-envelope-assumed**: detail 응답 봉투가 summary 와 같은 `{ volumes: [...] }` 인지 — OpenStack 레퍼런스로 확정(위 선행). 테스트 fixture 로 고정.
- **list-output-column-docs-mismatch**: 출력 컬럼(id·name·size·status·type)은 불변 — detail 이 모든 필드를 제공하므로 formatter(list.ts) 변경 불요. AGENTS.md volume list 설명(id·name·size·status)도 그대로 유효.
- **function-signature-unverified**: `list()` 시그니처·반환 타입(`Promise<Volume[]>`) 불변 → 호출부(commands/volume/list.ts) cascade 없음.
- 리터럴 exit code 금지 — 새 메시지도 `EXIT_API_ERROR` 상수 사용, 리터럴 숫자 금지.
- 정밀한 변경 — get()·create() URL 은 건드리지 않는다 (list 만 결함).

## 완료 조건

1. `pnpm tsc --noEmit` 0.
2. `pnpm run build` 정상.
3. `pnpm test` 정상 (list describe: /volumes/detail URL·detail 파싱·빈 목록·summary 거부 케이스 포함).
4. `rg -n "/volumes/detail" src/services/blockstorage/client.ts` → 1건 (list). `rg -n "\`\\$\\{this.endpoint\\}/volumes\`" src/services/blockstorage/client.ts` 에 list 라인 없음.
5. index.json Phase 1 completed.

## 변경 파일 (정확)

- `src/services/blockstorage/client.ts`
- `src/services/blockstorage/client.test.ts`
- `tasks/040-fix-volume-list-detail-endpoint/index.json`

## 커밋

```bash
git commit -m "fix(volume): use /volumes/detail so list returns full fields (#52)"
```

## 실측 검증 (자격증명 있을 때 — 선택)

1. iaas 자격 profile 로 `nhncloud volume list` → 볼륨 목록 정상 출력(에러 없음).
2. `nhncloud volume list --json` → detail 필드 포함 raw 출력.
3. 볼륨 0개 profile → 빈 목록 정상.
