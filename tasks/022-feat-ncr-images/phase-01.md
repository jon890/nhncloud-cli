# Phase 01 — NCR 이미지/태그 조회 (Harbor REST 데이터플레인 client + 명령 + 테스트)

## 목표 (검증 가능)

`nhncloud ncr images <registry>` / `nhncloud ncr tags <registry> <repository>` 가 레지스트리 데이터플레인 host 의 Harbor REST `/api/v2.0` 을 UAK Basic Auth 로 호출해 이미지(repository)·태그를 조회하고, client 단위테스트가 그린이다.

- 검증: `pnpm tsc --noEmit` 0, `pnpm run build` 정상, `pnpm test` 신규 harbor 테스트 PASS(기존 스위트도 그린).
- 실측(자격증명 있을 때): `node dist/index.js ncr images <registry>` 가 repository 목록 200 반환.

## 선행 — 단일 소스 ADR-017

본 task 의 설계 결정은 **ADR-017 이 단일 소스**다. 코드는 ADR-017 과 1:1 이어야 한다. 작성 전 `docs/adr.md` 의 ADR-017 을 읽는다. planning 결정 docs(adr/code-architecture/CLAUDE.md/flow/prd)는 이미 선반영됨 — 본 phase 에서 **수정 금지**(코드↔docs mismatch 회피). README·공개 SKILL 만 phase-02.

실측(2026-06-12 playground 자격증명)으로 경로·인증·응답이 모두 확정됐다 — 추측 구현이 아니라 실측을 코드로 옮긴다:
- repository 목록: `GET https://{host}/api/v2.0/projects/{project}/repositories` → 평면 배열 `[{ name, artifact_count, pull_count, update_time, ... }]`. `name` 은 `{project}/{repo}`.
- artifact 목록: `GET https://{host}/api/v2.0/projects/{project}/repositories/{repo}/artifacts` → `[{ digest, size, push_time, tags: [{ name, push_time }] | null, ... }]`.
- 인증: UAK id/secret 을 `Authorization: Basic base64(id:secret)`. 응답은 NHN 봉투가 아닌 Harbor 평면 JSON — `unwrap`/`unwrapHeader` **호출 금지**.

## 구현 항목

### 1. `src/services/ncr/types.ts` — Repository / Artifact 추가

기존 `Registry`/`isRegistry` 는 유지하고 아래를 추가:

```ts
export interface Repository {
  name: string;                       // "{project}/{repo}" 형태
  artifact_count?: number | string;   // 6-2 — 수치 메타 string 가능
  pull_count?: number | string;
  update_time?: string | null;
  [key: string]: unknown;
}

export interface ArtifactTag {
  name: string;
  push_time?: string | null;
  [key: string]: unknown;
}

export interface Artifact {
  digest?: string;
  size?: number | string;
  push_time?: string | null;
  tags?: ArtifactTag[] | null;        // 5-6 — dangling artifact 는 tags=null
  [key: string]: unknown;
}
```

- 가드 `isRepository`: `name` 만 `typeof === "string"` 요구(5-6, 나머지 optional/nullable). `isArtifact`: object·non-null 이면 통과(digest 등 전부 optional).

### 2. `src/services/ncr/harbor-client.ts` — HarborClient (신규)

```ts
export class HarborClient {
  constructor(uakId: string, uakSecret: string, host: string) { ... }   // host = scheme 없는 데이터플레인 도메인
  private basicAuthHeaders(): Record<string, string> {
    const token = Buffer.from(`${this.uakId}:${this.uakSecret}`).toString("base64");
    return { Authorization: `Basic ${token}` };
  }
  async listRepositories(project: string): Promise<Repository[]> { ... }
  async listArtifacts(project: string, repository: string): Promise<Artifact[]> { ... }
}
```

- `DEFAULT_TIMEOUT_MS`(`30_000`) + `PAGE_SIZE`(`100`) 는 모듈 로컬 const(export 아님 — deploy/ncr client 패턴). Harbor 최대 page_size 가 100.
- **pagination 전수 수집 (필수 — 실측: 한 repo 에 artifact 60개, Harbor 기본 page_size 로 앞부분만 와 silent truncation)**: Harbor REST `/repositories`·`/artifacts` 는 `?page=N&page_size=100` + 응답 `Link: <...?page=N+1...>; rel="next"` 헤더로 페이지네이션한다(2026-06-12 실측 확정 — `x-total-count: 60`, `Link ... rel="next"`). private helper 로 전 페이지를 누적한다:
  ```ts
  private async getAllPages(path: string): Promise<unknown[]> {
    const acc: unknown[] = [];
    let page = 1;
    try {
      for (;;) {
        const url = `https://${this.host}${path}?page=${page}&page_size=${PAGE_SIZE}`;
        const res = await ky.get(url, { headers: this.basicAuthHeaders(), retry: 0, timeout: DEFAULT_TIMEOUT_MS });
        const data = await res.json<unknown>();
        if (!Array.isArray(data)) {
          throw new NhnCloudCliError("Harbor REST 응답 형식 오류: 배열이 아닙니다.", EXIT_API_ERROR);
        }
        acc.push(...data);
        const link = res.headers.get("link");
        if (!link || !link.includes('rel="next"')) break;   // 다음 페이지 없으면 종료
        page++;
      }
    } catch (err) {
      if (err instanceof NhnCloudCliError) throw err;
      throw toNhnCloudCliError(err);                          // 401/403→AUTH, 그 외→API
    }
    return acc;
  }
  ```
  - `ky.get(...)` 는 Response 를 반환하므로 `.json()` 과 `.headers.get("link")` 를 **함께** 쓴다(기존 ncr client 의 `.json<T>()` 체이닝과 다름 — 페이지네이션 Link 헤더 접근이 필요). 기존 client 처럼 `.json<NhnEnvelope>()` 체이닝하면 헤더를 못 본다.
  - **봉투 미적용(ADR-017)**: Harbor 응답은 평면 배열이라 `unwrap`/`unwrapHeader` 를 호출하지 않는다. `Array.isArray` 가드만 둔다.
- `listRepositories(project)`: `getAllPages("/api/v2.0/projects/{enc}/repositories")` → `.filter(isRepository)`.
- `listArtifacts(project, repository)`: `getAllPages("/api/v2.0/projects/{enc}/repositories/{enc}/artifacts")` → `.filter(isArtifact)`.
- **path-traversal 방지**: project·repository 모두 `encodeURIComponent`(repo 의 `/` 도 `%2F` 로).

### 3. `src/commands/ncr/helpers.ts` — host 해석 추가 (ncr get 재사용)

기존 `createNcrClient`/`resolveAppKey` 옆에 추가:

```ts
// 데이터플레인 host 는 ncr get(Management API)으로 얻은 registry.uri 에서 추출한다.
export async function createHarborClient(opts: { profile?: string; region?: string; appKey?: string }, registryArg: string):
  Promise<{ harbor: HarborClient; project: string }> {
  const { client: ncrClient, profileName } = await createNcrClient(opts);
  const appKey = await resolveAppKey(profileName, opts.appKey);
  const uak = await getUserAccessKey(profileName);
  const reg = await ncrClient.getRegistry(appKey, registryArg);   // 021 재사용 — registry.uri/name 획득
  const host = parseHarborHost(reg.uri);
  const project = typeof reg.name === "string" ? reg.name : registryArg;
  return { harbor: new HarborClient(uak.id, uak.secret, host), project };
}

// uri "{host}/{registryName}" (scheme 유무 무관) → host 부분만.
// 단위테스트 대상이라 export 한다(§6).
export function parseHarborHost(uri?: string | null): string {
  if (!uri) throw new NhnCloudCliError("레지스트리 uri 가 없어 이미지 host 를 해석할 수 없습니다.", EXIT_API_ERROR);
  const noScheme = uri.replace(/^https?:\/\//, "");
  const host = noScheme.split("/")[0];
  if (!host) throw new NhnCloudCliError("레지스트리 uri 형식 오류 — host 추출 실패.", EXIT_API_ERROR);
  return host;
}
```

- `getUserAccessKey`/`createNcrClient`/`resolveAppKey` 는 기존 export. 새 import 만 추가.
- `EXIT_API_ERROR` 등 exit code 상수 import 확인.

### 4. `src/commands/ncr/images.ts` / `tags.ts`

**spinner 순서(1-1/1-2)**: (spinner 전) registry 인자 빈값 검증 + host 해석 — `createHarborClient` 는 내부에서 ncr get 호출이라 spinner 앞. → `startSpinner` → try/catch(`stopSpinner(false); throw e`) → `stopSpinner(true)` → `output`.

- `images <registry>`:
  - registry 빈값(`registry.trim()` 비어있음)은 spinner 전 EXIT_PARAM_ERROR(CLI15, get.ts 선례).
  - `const { harbor, project } = await createHarborClient(opts, registry);`
  - `const repos = await harbor.listRepositories(project);`
  - 표시: repository name 은 `{project}/{repo}` 라 **project 접두를 떼어 짧은 이름**으로 보여 사용자가 그대로 `ncr tags` 인자로 쓰게 한다. `const short = r.name.startsWith(project + "/") ? r.name.slice(project.length + 1) : r.name;`
  - headers `["repository", "artifact_count", "pull_count"]`, rows 는 short·`String(r.artifact_count ?? "")`·`String(r.pull_count ?? "")`, ids = short 목록.
- `tags <registry> <repository>`:
  - registry·repository 빈값은 spinner 전 EXIT_PARAM_ERROR.
  - `const { harbor, project } = await createHarborClient(opts, registry);`
  - **repository 인자 정규화(critic MINOR)**: 사용자가 `ncr images` 의 짧은 이름 대신 full `{project}/{repo}` 를 복사해 넣어도 동작하게, project 접두가 있으면 떼어낸다 — `const repo = repository.startsWith(project + "/") ? repository.slice(project.length + 1) : repository;`. 안 떼면 `encodeURIComponent` 가 prefix 의 `/` 까지 인코딩해 404.
  - `const artifacts = await harbor.listArtifacts(project, repo);`
  - flatten: `artifacts.flatMap(a => (a.tags ?? []).map(t => ({ tag: t.name, push_time: t.push_time ?? a.push_time, size: a.size })))` — tags=null dangling artifact 는 자동 제외.
  - headers `["tag", "push_time", "size"]`, rows 의 size 는 `String(... ?? "")`, ids = tag 목록.
- 옵션: `--region`, `--app-key`, `--profile`(images·tags 공통). 9-1: exit code 는 `EXIT_*` 상수, 숫자 리터럴 금지.

### 5. `src/index.ts` — images/tags 등록 (**import alias 필수**)

`src/index.ts:33` 에 이미 `import { imagesCommand } from "./commands/instance/images.js"` 가 있다(instance images). ncr 쪽을 bare `imagesCommand` 로 import 하면 **duplicate identifier → tsc 실패**. ncr list/get 과 같은 alias 컨벤션을 따른다:

```ts
import { imagesCommand as ncrImagesCommand } from "./commands/ncr/images.js";
import { tagsCommand as ncrTagsCommand } from "./commands/ncr/tags.js";
// ...
ncrCommand.addCommand(ncrImagesCommand);
ncrCommand.addCommand(ncrTagsCommand);
```

(ncr images.ts/tags.ts 내부 export 이름은 `imagesCommand`/`tagsCommand` 로 두되 import 시 alias.)

### 6. 단위테스트 `src/services/ncr/harbor-client.test.ts` (020 패턴)

**`src/services/ncr/harbor-client.test.ts`** — `vi.mock("ky")`. pagination 때문에 mock 은 `.json()` 체이닝이 아니라 **Response 객체(`json` + `headers.get`)** 를 반환한다:
```ts
function page(data: unknown, hasNext: boolean) {
  return {
    json: async () => data,
    headers: { get: (k: string) => (k === "link" && hasNext ? '<...>; rel="next"' : null) },
  } as never;
}
```
- `listRepositories`: 단일 페이지(`page([...], false)`) → Repository[] 반환. name·artifact_count(string/number 6-2) 수용.
- **pagination 전수 수집(silent truncation 회귀 가드 — 핵심)**: `vi.mocked(ky.get).mockResolvedValueOnce(page([r1], true)).mockResolvedValueOnce(page([r2], false))` 로 2페이지 → 결과 길이 2, `ky.get` **2회** 호출(`page=1`·`page=2`) 단언. Link 에 rel="next" 가 없을 때 멈추는지 확인.
- `listArtifacts`: 평면 배열, tags=null artifact 포함 → 그대로 반환(flatten 은 command 레벨).
- **Basic Auth 헤더 단언**: `ky.get` 호출 인자에 `Authorization: Basic ${Buffer.from("id:secret").toString("base64")}` 가 들어가는지(`expect.objectContaining`).
- URL 단언: `/api/v2.0/projects/{project}/repositories` host 포함 + `page_size=100`.
- 비배열 응답(`page({}, false)`) → 형식 오류 throw(EXIT_API_ERROR).
- 4xx mock(2-3): `ky.get` 이 reject → `toNhnCloudCliError` 매핑(401→AUTH, 404→API). `vi.mock(ky)` 가 HTTPError instanceof 를 깨므로 `NhnCloudCliError` 직접 throw 로 흉내(021 `client.test.ts` 선례).

**`src/commands/ncr/helpers.test.ts`** — `parseHarborHost`(export) 순수 함수:
- `"host.example.com/myreg"` → `"host.example.com"`.
- `"https://host.example.com/myreg"` → scheme 제거 후 host.
- `undefined`/`null`/`""` → EXIT_API_ERROR throw.
- 중첩 경로 `"host.example.com/a/b"` → `"host.example.com"`(첫 `/` 앞).

## 회피 항목 (executor self-check — 작성 직전 grep)

- **봉투 미적용**: `grep -nE "unwrap|unwrapHeader" src/services/ncr/harbor-client.ts` → 0건(Harbor 는 평면 JSON, ADR-017).
- **Basic Auth**: `Authorization: Basic` + `Buffer...base64`. 정적 X-TC 헤더 재사용 금지.
- **path-traversal**: project·repository 모두 `encodeURIComponent`. `grep -nE "encodeURIComponent" src/services/ncr/harbor-client.ts`.
- **nullable tags(5-6)**: `a.tags ?? []` flatten. tags=null 거르지 않고 빈 처리.
- **수치 string/number(6-2)**: artifact_count·pull_count·size 를 number-only 가정 금지.
- **비배열 가드**: `Array.isArray` 후 filter — `.filter is not a function` 방지(021 hotfix PR #27 교훈).
- **pagination 전수 수집**: `getAllPages` 가 `Link: rel="next"` 가 없을 때까지 누적하는가? `grep -nE "rel=.next.|page_size" src/services/ncr/harbor-client.ts` — 실측상 한 repo 에 60개라 단일 호출이면 truncation.
- **import alias**: `grep -nE "imagesCommand|tagsCommand" src/index.ts` — ncr 쪽이 `as ncrImagesCommand`/`as ncrTagsCommand` 인가(instance imagesCommand 와 충돌 금지).
- **9-1 exit code 리터럴**: `grep -rnE "NhnCloudCliError\([^,]+,\s*[0-9]+" src/commands/ncr/ src/services/ncr/` → 0건.
- **spinner 순서(1-1/1-2)**: host 해석(createHarborClient)·registry 빈값 검증이 startSpinner 앞.

## 완료 조건

1. `pnpm tsc --noEmit` 0.
2. `pnpm run build` 정상 + `node dist/index.js ncr images --help` / `ncr tags --help` 노출.
3. `pnpm test` — harbor client 테스트 PASS(기존 NCR·020 스위트 그린 유지).
4. (자격증명 있으면) `ncr images <registry>` 200 실측 결과를 커밋 메시지에 기록.
5. index.json `current_phase: 1`(phase-02 대기).
