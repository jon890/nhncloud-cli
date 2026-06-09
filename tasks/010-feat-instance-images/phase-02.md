# Phase 02 — images 조회 명령

## 목표

`nhncloud instance images` 로 이미지 목록을 조회한다 — `instance create --image <id>` 에 넣을 image id 소스.

- `GET /v2/images` (Glance v2, phase-01 에서 확장한 `imageEndpoint` 사용).
- 핵심 필드만 테이블(id·name·status·visibility·size), 전체는 `--json`.
- marker 페이지네이션 옵션 노출(`--limit`·`--marker`) + 필터(`--name`·`--visibility`·`--owner`·`--status`).

근거: NHN Cloud Compute > Image public-api docs.
- query: `limit`(기본 25)·`marker`·`name`·`visibility`(public/private/shared)·`owner`·`status`·`size_min`/`size_max`·`sort_key`(기본 created_at)·`sort_dir`·`member_status`.
- 응답: `{ images: [{ id, name, status, visibility, size, owner, created_at, ... }], next }`.
  - `next` 는 다음 페이지 경로(marker 방식) — 마지막 페이지면 없음/null.

## 핵심 — imageEndpoint 를 client 에 전달

phase-01 에서 `getIaasToken` 이 `imageEndpoint` 를 반환하지만,
`resolveInstanceClient`(helpers.ts)·`InstanceClient` 는 아직 `computeEndpoint` 만 쓴다.
이미지 조회를 위해 `imageEndpoint` 를 client 까지 전달한다.

- `InstanceClient` 생성자에 `imageEndpoint` 인자를 더한다(필수 인자 — create/list 등 기존 호출부는 helpers 한 곳뿐이라 동기화 쉬움).
- `resolveInstanceClient` 가 `imageEndpoint` 를 받아 `new InstanceClient(tokenId, computeEndpoint, imageEndpoint)` 로 넘긴다.
- `listImages` 는 `this.imageEndpoint` 를 base 로 호출한다(`/servers` 계열과 다른 host).

## 변경 파일 (5개)

1. `src/services/instance/types.ts` — `Image` / `ImageListParams` / (페이지네이션) `ImageListResult` 추가
2. `src/services/instance/client.ts` — 생성자에 `imageEndpoint` 추가 + `listImages()` 메서드 + 응답 가드
3. `src/commands/instance/helpers.ts` — `resolveInstanceClient` 가 `imageEndpoint` 를 client 에 전달
4. `src/commands/instance/images.ts` — 신규 명령 (입력 검증 → spinner → output)
5. `src/index.ts` — `instanceCommand.addCommand(imagesCommand)`

## 회피 항목 (code-review-pitfalls 사전 확인)

- **1-2 (spinner 후 try/catch)**: `client.listImages()` 는 `startSpinner` 직후 try/catch 로 감싸고 catch 에서 `stopSpinner(false)` 후 re-throw. `list.ts` 가 reference.
- **9-1 (exit code 리터럴 금지)**: `--limit` 검증 실패는 `EXIT_PARAM_ERROR` **상수**(숫자 리터럴·주석 금지). `--visibility` 화이트리스트 위반도 동일.
- **4-2 (목록 두 곳 동기화)**: `--visibility` 허용값 집합(public/private/shared)을 command 검증과 타입(있다면 union)에 **이중 정의하지 않는다** — 단일 `const VISIBILITY_VALUES` 배열에서 파생해 검증·help 양쪽이 같은 소스를 쓴다.
- **2-1 / type 변경 → tsc**: 새 type + 생성자 시그니처 변경 = type 변경 → 성공 기준에 `pnpm tsc --noEmit` 필수.
- **5-1 / 5-3 (캐스트 회피)**: 응답을 `as Image[]` 캐스트하지 않는다 — `isImagesResponse` 가드로 좁힌다.
- **7-2 (출력 모드 분기)**: 0건은 `output()` 이 모드별 처리(table="결과 없음"·quiet=빈·json=`[]`). early return 분기 금지.

## 작업 상세

### 1. `src/services/instance/types.ts`

`FlavorListParams` interface **뒤** 에 추가:

```ts
/** 이미지 요약 — `GET /v2/images` (Glance v2). 보장 필드는 docs 예제 기준. */
export interface Image {
  id: string;
  name: string;
  status: string;
  visibility: string;
  /** 바이트 크기 (없을 수 있음) */
  size?: number;
  owner: string;
  created_at: string;
}

/** 이미지 목록 조회 쿼리 파라미터 (`GET /v2/images`). docs 의 query 이름 그대로. */
export interface ImageListParams {
  limit?: number;
  marker?: string;
  name?: string;
  visibility?: string;
  owner?: string;
  status?: string;
}

/**
 * 이미지 목록 결과 — marker 페이지네이션.
 * `next` 는 다음 페이지 경로(있으면). 다음 페이지는 호출부가 marker 로 이어 받는다.
 */
export interface ImageListResult {
  images: Image[];
  next?: string;
}
```

> `created_at`·`owner` 가 docs 예제에 항상 있는지 phase 시작 시 docs 예제 JSON 으로 재확인(CLAUDE.md "request/response body 구조도 공식 레퍼런스 먼저"). 없을 수 있으면 `?` optional 로 낮춘다 — 추측으로 required 박지 않는다.

### 2. `src/services/instance/client.ts`

(a) import 에 새 type 추가:

```ts
import type {
  Server,
  CreateServerParams,
  Flavor,
  FlavorDetail,
  FlavorListParams,
  Image,
  ImageListParams,
  ImageListResult,
} from "./types.js";
```

(b) 생성자에 `imageEndpoint` 추가:

```ts
export class InstanceClient {
  private readonly tokenId: string;
  private readonly computeEndpoint: string;
  private readonly imageEndpoint: string;

  constructor(tokenId: string, computeEndpoint: string, imageEndpoint: string) {
    this.tokenId = tokenId;
    this.computeEndpoint = computeEndpoint;
    this.imageEndpoint = imageEndpoint;
  }
```

(c) 응답 가드 추가(`isFlavorsResponse` 근처). id·name·status 만 보장 검사:

```ts
function isImage(val: unknown): val is Image {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj["id"] === "string" &&
    typeof obj["name"] === "string" &&
    typeof obj["status"] === "string"
  );
}

function isImagesResponse(val: unknown): val is { images: Image[]; next?: string } {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return Array.isArray(obj["images"]) && obj["images"].every(isImage);
}
```

(d) `listFlavors()` **뒤** 에 `listImages()` 추가. `imageEndpoint` 사용, query 는 docs 이름 그대로:

```ts
  /**
   * 이미지 목록을 조회한다 (GET /v2/images, Glance v2).
   * compute 와 다른 host(imageEndpoint)지만 같은 Keystone 토큰을 쓴다.
   * 한 페이지(기본 limit 25)만 반환한다 — next 가 있으면 호출부가 marker 로 이어 받는다.
   */
  async listImages(params: ImageListParams = {}): Promise<ImageListResult> {
    const url = `${this.imageEndpoint}/images`;

    const searchParams: Record<string, string | number> = {};
    if (params.limit !== undefined) searchParams["limit"] = params.limit;
    if (params.marker !== undefined) searchParams["marker"] = params.marker;
    if (params.name !== undefined) searchParams["name"] = params.name;
    if (params.visibility !== undefined) searchParams["visibility"] = params.visibility;
    if (params.owner !== undefined) searchParams["owner"] = params.owner;
    if (params.status !== undefined) searchParams["status"] = params.status;

    try {
      const raw = await ky
        .get(url, {
          headers: this.authHeaders(),
          searchParams,
          retry: 0,
          timeout: DEFAULT_TIMEOUT_MS,
        })
        .json();

      if (!isImagesResponse(raw)) {
        throw new NhnCloudCliError(
          "instance images 응답 형식이 올바르지 않습니다 — images 배열이 없습니다.",
          EXIT_API_ERROR,
        );
      }
      return { images: raw.images, next: raw.next };
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }
```

### 3. `src/commands/instance/helpers.ts`

`getIaasToken` destructuring 에 `imageEndpoint` 를 더하고 client 에 전달:

```ts
  const { tokenId, computeEndpoint, imageEndpoint } = await getIaasToken(profileName, effectiveIaas);
  return {
    client: new InstanceClient(tokenId, computeEndpoint, imageEndpoint),
    profileName,
  };
```

### 4. `src/commands/instance/images.ts` (신규)

`list.ts` 패턴. `--limit` 정수 검증·`--visibility` 화이트리스트는 spinner·자격증명 resolve **앞**(fail-fast):

```ts
import { Command } from "commander";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { resolveInstanceClient } from "./helpers.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

/** --visibility 허용값 — 검증·help 가 공유하는 단일 소스 (4-2 이중정의 회피). */
const VISIBILITY_VALUES = ["public", "private", "shared"] as const;

interface ImagesGlobalOpts extends OutputOptions {
  limit?: string;
  marker?: string;
  name?: string;
  visibility?: string;
  owner?: string;
  status?: string;
  region?: string;
  profile?: string;
}

/** 옵션 문자열을 1 이상의 정수로 파싱. 비숫자·0·음수면 EXIT_PARAM_ERROR. */
function parsePositiveInt(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new NhnCloudCliError(`${flag} 는 1 이상의 정수여야 합니다 (입력: ${value}).`, EXIT_PARAM_ERROR);
  }
  return n;
}

export const imagesCommand = new Command("images")
  .description("이미지 목록을 조회한다 (create --image <id> 소스, 전체 필드는 --json)")
  .option("--limit <n>", "한 페이지 최대 개수 (기본: 서버 기본값 25)")
  .option("--marker <id>", "이 image id 다음부터 조회 (페이지네이션)")
  .option("--name <name>", "이름으로 필터")
  .option("--visibility <v>", `노출 범위 필터 (${VISIBILITY_VALUES.join("|")})`)
  .option("--owner <id>", "소유자(프로젝트 id)로 필터")
  .option("--status <status>", "상태로 필터 (예: active)")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<ImagesGlobalOpts>();

    // ── 1. 파라미터 검증 (spinner·자격증명 resolve 전 — fail-fast) ──
    const limit = parsePositiveInt(opts.limit, "--limit");
    if (opts.visibility !== undefined && !VISIBILITY_VALUES.includes(opts.visibility as (typeof VISIBILITY_VALUES)[number])) {
      throw new NhnCloudCliError(
        `--visibility 는 ${VISIBILITY_VALUES.join(" | ")} 중 하나여야 합니다 (입력: ${opts.visibility}).`,
        EXIT_PARAM_ERROR,
      );
    }

    // ── 2. 자격증명 + token (spinner 전) ──
    const { client } = await resolveInstanceClient(opts);

    // ── 3. API 호출 (spinner 내부) ──
    startSpinner("이미지 목록 조회 중...");

    let result;
    try {
      result = await client.listImages({
        limit,
        marker: opts.marker,
        name: opts.name,
        visibility: opts.visibility,
        owner: opts.owner,
        status: opts.status,
      });
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    // ── 4. 출력 ──
    output(opts, {
      headers: ["id", "name", "status", "visibility", "size"],
      rows: result.images.map((img) => [
        img.id,
        img.name,
        img.status,
        img.visibility,
        img.size === undefined ? "-" : String(img.size),
      ]),
      raw: result.images,
      ids: result.images.map((img) => img.id),
    });

    // next 페이지 안내는 stderr(데이터 오염 금지). table 모드에서만.
    // OutputOptions(formatters/table.ts) 는 json?/quiet? boolean 이라 output 필드가 없다 — 두 플래그로 판정.
    if (result.next && !opts.json && !opts.quiet) {
      const lastId = result.images.at(-1)?.id;
      if (lastId) {
        process.stderr.write(`다음 페이지: --marker ${lastId}\n`);
      }
    }
  });
```

> `--visibility` 의 `as (typeof VISIBILITY_VALUES)[number]` 는 `Array.includes` 의 리터럴 union 인자 제약을 만족시키기 위한 좁히기용 단언이다 — 값 자체를 강제 변환하지 않는다(5-3 의 "검증된 입력 좁히기" 정당 케이스). 데이터 응답 캐스트(`as Image[]`)와 다르다.
> table 모드 판정은 `!opts.json && !opts.quiet` 로 한다 — `OutputOptions` 에 `output` 문자열 필드는 없다 (json?/quiet? boolean).
> 참고: index.json description 의 query 중 `size_min/max`·`sort_key/dir`·`member_status` 는 MVP 에서 의도적으로 제외하고 limit/marker/name/visibility/owner/status 만 노출한다.

### 5. `src/index.ts`

(a) import 추가:

```ts
import { imagesCommand } from "./commands/instance/images.js";
```

(b) `instanceCommand.addCommand(listCommand);`(또는 flavors 등록) **다음** 줄에:

```ts
instanceCommand.addCommand(imagesCommand);
```

## 성공 기준 (검증 명령 + 기대값)

```bash
# cwd: <repo root 또는 worktree>

# 1. 타입 체크 — 새 type + 생성자 시그니처 변경 → 필수
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l
# 기대: 0

# 2. 빌드 성공
pnpm build
# 기대: dist/index.js 생성, exit 0

# 3. images 가 instance 하위 명령으로 노출
node dist/index.js instance --help 2>&1 | grep -c "images"
# 기대: 1 이상

# 4. images 옵션이 help 에 노출
node dist/index.js instance images --help 2>&1 | grep -Ec -- "--limit|--marker|--visibility|--name|--owner|--status"
# 기대: 6

# 5. --limit 비숫자 → EXIT_PARAM_ERROR(3) (자격증명 전 차단)
node dist/index.js instance images --limit abc; echo "exit=$?"
# 기대: stderr 에 "1 이상의 정수", exit=3

# 6. --limit 0 → EXIT_PARAM_ERROR(3)
node dist/index.js instance images --limit 0; echo "exit=$?"
# 기대: stderr 에 "1 이상의 정수", exit=3

# 7. --visibility 잘못된 값 → EXIT_PARAM_ERROR(3)
node dist/index.js instance images --visibility bogus; echo "exit=$?"
# 기대: stderr 에 "public | private | shared", exit=3

# 8. exit code 리터럴 미사용 (9-1)
grep -nE "NhnCloudCliError\([^,]+,\s*[0-9]+" src/commands/instance/images.ts | wc -l
# 기대: 0

# 9. 데이터 응답 캐스트 회피 (5-1/5-3) — images.ts 에 as Image[] 없음
grep -nE "as Image\[\]|as unknown as" src/commands/instance/images.ts | wc -l
# 기대: 0

# 10. visibility 허용값 단일 정의 (4-2) — VISIBILITY_VALUES 배열 1곳
grep -c "VISIBILITY_VALUES = \[" src/commands/instance/images.ts
# 기대: 1
```

성공 기준 5/6/7 은 param 검증이 자격증명·네트워크 전이라 실제 API 를 호출하지 않는다.

## 수동 확인 (자격증명 필요 — phase-02 후 사용자/구현자)

```bash
# 실제 이미지 목록 (개인 식별 정보 placeholder — 실제 profile/region 로 치환)
node dist/index.js instance images
# 기대: id·name·status·visibility·size 테이블, exit 0

node dist/index.js instance images --visibility public --json | head
# 기대: JSON 배열, 각 원소에 id·name

node dist/index.js instance images --limit 5
# 기대: 5건 + (다음 페이지 있으면) stderr 에 "다음 페이지: --marker <id>"
```
