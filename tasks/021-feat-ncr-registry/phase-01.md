# Phase 01 — NCR 레지스트리 조회 client + 명령 + 테스트

## 목표 (검증 가능)

`nhncloud ncr list` / `nhncloud ncr get <registry>` 가 공통 UAK 정적 헤더로 NCR Management API 를 호출해 레지스트리를 조회하고, client 단위테스트가 그린이다.

- 검증: `pnpm tsc --noEmit` 0 에러, `pnpm run build` 정상, `pnpm test` 신규 NCR 테스트 PASS.
- 실측 검증(자격증명 있을 때): `node dist/index.js ncr list --app-key <appkey>` 가 200 으로 레지스트리 목록을 반환(또는 401/404 면 ADR-016 실측 pending 항목 교정).

## 선행 — docs 단일 소스 재확인

본 task 의 설계 결정은 **ADR-016 이 단일 소스**다. 코드는 ADR-016 과 1:1 이어야 한다. 작성 전 `docs/adr.md` 의 ADR-016 을 읽는다. planning 결정 docs(adr/code-architecture/CLAUDE.md/flow)는 이미 선반영됨 — 본 phase 에서 **수정 금지**(코드↔docs mismatch 회피). README·SKILL 만 phase-02 에서.

## 구현 항목

### 1. `src/api/endpoints.ts` — NCR region host 맵 + URL 빌더

instance 의 region 맵 패턴을 답습한다.

```ts
const NCR_HOST: Record<string, string> = {
  kr1: "kr1-ncr.api.nhncloudservice.com",
  kr2: "kr2-ncr.api.nhncloudservice.com",
  kr3: "kr3-ncr.api.nhncloudservice.com",
};

export function ncrHost(region: string): string {
  const host = NCR_HOST[region];
  if (!host) {
    throw new NhnCloudCliError(
      `지원하지 않는 region 입니다: "${region}". 사용 가능한 region: ${Object.keys(NCR_HOST).join(", ")}`,
      EXIT_PARAM_ERROR,
    );
  }
  return host;
}
```

- **4-2 회피(enum 두 곳 동기화)**: region 허용값을 configure 의 region 선택지나 다른 곳에 **중복 정의하지 않는다**. NCR region 은 IaaS region(`INSTANCE_HOST`)과 별개 축이며, 단일 소스는 `NCR_HOST`. configure 의 ncr 입력은 region 을 묻지 않고 명령 `--region`(기본 kr1)으로만 받는다 → 중복 enum 자체를 만들지 않음.
- jp1 등은 host 패턴 실측 전까지 넣지 않는다(미검증 region 을 맵에 넣으면 잘못된 host 로 호출). kr1~kr3 만 — 조사에서 확인된 region.

### 2. `src/services/ncr/types.ts`

```ts
export interface Registry {
  name: string;
  project_id?: number | string;
  repo_count?: number | string;   // 6-2 회피 — 수치 메타가 string 일 수 있음
  uri?: string | null;
  private_uri?: string | null;
}

export interface RegistryListParams {
  appKey: string;
  region: string;
}
```

- 타입 가드 `isRegistry`: **5-6 회피** — Harbor/NHN 응답에서 nullable 가능한 필드(`uri` 등)를 string-only 로 막지 않는다. 핵심 식별 필드(`name`)만 `typeof === "string"` 으로 요구하고 나머지는 optional/nullable 허용. 기존 `isImage`/`isVolume`(name nullable 관용)을 참고.
- **실측 pending**: 실제 응답 필드명이 docs 와 다르면(예: 봉투 body 가 `{ registries: [...] }` 인지 평면 배열인지) 첫 호출로 확정 후 가드·언랩을 맞춘다.

### 3. `src/services/ncr/client.ts`

```ts
export class NcrClient {
  private readonly uakId: string;
  private readonly uakSecret: string;
  private readonly baseUrl: string;     // https://{ncrHost(region)}

  constructor(uakId: string, uakSecret: string, region: string) { ... baseUrl = `https://${ncrHost(region)}`; }

  private authHeaders(): Record<string, string> {
    return {
      "X-TC-AUTHENTICATION-ID": this.uakId,
      "X-TC-AUTHENTICATION-SECRET": this.uakSecret,
    };
  }

  async listRegistries(appKey: string): Promise<Registry[]> { ... }
  async getRegistry(appKey: string, registry: string): Promise<Registry> { ... }
}
```

- 호출: `ky.get(url, { headers: this.authHeaders(), retry: 0, timeout: DEFAULT_TIMEOUT_MS }).json<NhnEnvelope<...>>()` → `unwrap(res)`. try/catch → `toNhnCloudCliError(err)`.
- path 세그먼트 `encodeURIComponent(appKey)` / `encodeURIComponent(registry)` (경로 주입·인코딩 — deploy 선례 ADR-015 round, path-traversal 방지).
- 봉투 body 형태가 배열인지 `{ registries }` 객체인지는 실측 확정. **5-3 회피**: optional body 를 `as T` 로 반환하지 말고 unwrap 의 undefined guard 를 통과시킨 뒤 가드로 좁힌다.
- 헤더 표기(`X-TC-AUTHENTICATION-ID/SECRET`)는 ADR-016 실측 pending — 401 이면 대소문자/하이픈 교정.

### 4. `src/commands/ncr/helpers.ts` — client 생성 + appKey/region 해석

```ts
export async function createNcrClient(opts: { profile?: string; region?: string }):
  Promise<{ client: NcrClient; profileName: string }> {
  const profileName = await resolveProfileName(opts.profile);
  const uak = await getUserAccessKey(profileName);       // 공통 UAK 재사용
  const region = opts.region ?? "kr1";
  return { client: new NcrClient(uak.id, uak.secret, region), profileName };
}

// appKey: --app-key > profile.ncr.appkey. 둘 다 없으면 EXIT_CONFIG_ERROR
export async function resolveAppKey(profileName: string, appKeyOpt?: string): Promise<string> { ... }
```

- **2-4 회피**: `getServiceCredential("ncr", profile)` 로 ncr 블록을 읽되, `appkey` 가 없으면 `?? ""` 빈문자열 fallback 금지 → `EXIT_CONFIG_ERROR` + 설정 안내(옵션 또는 configure). 인증 secret 은 공통 UAK 라 ncr 블록 secret 은 보지 않는다.
- appKey 해석은 옵션 우선, 그다음 자격증명. 옵션이 있으면 자격증명 없어도 동작.

### 5. `src/commands/ncr/list.ts` / `get.ts`

deploy/instance 명령 패턴 답습. **spinner 순서(1-1/1-2 회피)**:

1. (spinner 전) `createNcrClient` + `resolveAppKey` — param/config 검증을 spinner 앞에.
2. `startSpinner("레지스트리 목록 조회 중...")`.
3. try { `await client.listRegistries(appKey)` } catch { `stopSpinner(false); throw e` }.
4. `stopSpinner(true)`.
5. `output(opts, { headers, rows, raw, ids })`.

- `list`: headers `["name", "repo_count", "uri"]`, ids = `registries.map(r => r.name)`. `repo_count` 등 수치는 `String(r.repo_count ?? "")`.
- `get <registry>`: 단일 레지스트리. argument `<registry>`(이름 또는 id).
- 옵션: `--region <region>`, `--app-key <key>`, `--profile <name>`. `--region` 은 자유 문자열(미등록 시 `ncrHost` 가 EXIT_PARAM_ERROR) — region enum 을 명령에 또 정의하지 않는다(4-2).
- **9-1 회피**: exit code 는 `EXIT_*` 상수 import, 숫자 리터럴 금지.

### 6. `src/index.ts` — ncr 커맨드 그룹 등록

```ts
const ncrCommand = new Command("ncr").description("NHN Container Registry 관련 명령");
ncrCommand.addCommand(listCommand);
ncrCommand.addCommand(getCommand);
program.addCommand(ncrCommand);
```

### 7. `src/config/types.ts` + `configure` — ncr appkey 수집(선택)

- `ServiceCredential`(`{ appkey?, secret? }`)을 그대로 재사용 — ncr 블록은 `{ appkey }`만 채운다(타입 변경 불요).
- `configure.ts`: 대화형에 `confirm("ncr 자격증명도 설정하시겠습니까?")` → `input("ncr appkey")`. 비대화형 `--ncr-appkey <key>`. 저장은 `setServiceCredential(profile, "ncr", { appkey })`.
- `configure-verify.ts`: `verifyNcr(uak, appkey, region="kr1")` — `NcrClient.listRegistries(appkey)` 1회 호출, 401/403(EXIT_AUTH_ERROR) → false, 그 외 통과. **인증 secret 은 공통 UAK 이므로 verify 시 UAK 도 함께 넘긴다**.
- configure 의 ncr 입력은 **region 을 묻지 않는다**(명령 `--region` 으로 충분 + 4-2 enum 중복 회피).

### 8. 단위테스트 (020 패턴 답습)

- `src/services/ncr/client.test.ts` — `vi.mock("ky")`:
  - `listRegistries` 가 봉투 unwrap 후 Registry[] 반환(mock `.json()` 에 봉투 주입).
  - `isSuccessful: false` → throw.
  - 가드: nullable `uri` 가 null/누락인 레지스트리도 거르지 않고 통과(5-6 검증).
  - region host 해석: `new NcrClient(id, secret, "kr1")` 의 호출 URL 이 `kr1-ncr.api...` 인지(ky.get 호출 인자 단언). 미등록 region("xx") → EXIT_PARAM_ERROR.
- `src/commands/ncr/helpers.test.ts`(선택) — `resolveAppKey`: 옵션 우선, 자격증명 fallback, 둘 다 없으면 EXIT_CONFIG_ERROR.
- **2-3 회피**: 에러 케이스 mock reject value 는 `toNhnCloudCliError` 매핑(401→EXIT_AUTH_ERROR, 404→EXIT_API_ERROR)을 흉내.

## 회피 항목 요약 (executor self-check — 코드 작성 직전 grep)

- **1-1/1-2 spinner**: `grep -nE "startSpinner|createNcrClient|resolveAppKey" src/commands/ncr/*.ts` — 검증/client 생성이 spinner 앞, spinner 후 호출은 try/catch.
- **2-4 빈문자열 fallback**: `grep -rnE "\?\?\s*\"\"" src/commands/ncr/ src/services/ncr/` → 0건. appKey/secret 미설정은 EXIT_CONFIG_ERROR.
- **4-2 enum 중복**: region 허용값이 `NCR_HOST` 단일 소스인가? configure·명령에 region 목록을 또 정의하지 않았는가?
- **5-3 optional body as T**: `grep -nE "\.body as |as Registry" src/services/ncr/` → unwrap guard 통과 후 가드로 좁혔는가?
- **5-6 nullable string-only 가드**: `isRegistry` 가 `uri` 등 nullable 필드를 string-only 로 과잉 거부하지 않는가?
- **6-2 수치 string/number**: `repo_count` 를 number-only 로 가정하지 않는가?
- **9-1 exit code 리터럴**: `grep -rnE "NhnCloudCliError\([^,]+,\s*[0-9]+" src/commands/ncr/ src/services/ncr/` → 0건.

## 완료 조건

1. `pnpm tsc --noEmit` 0 에러.
2. `pnpm run build` 정상 + `node dist/index.js ncr --help` 가 list/get 노출.
3. `pnpm test` — NCR client 테스트 PASS(020 스위트도 유지 그린).
4. 실측(자격증명 있을 때): `ncr list` 200 확인 또는 ADR-016 pending 항목 교정 결과를 phase 말미·커밋 메시지에 기록.
5. index.json `current_phase: 1`(phase-02 대기).
