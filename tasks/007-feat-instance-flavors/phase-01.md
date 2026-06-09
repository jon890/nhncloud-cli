# Phase 01 — 코드: instance flavors 명령 (목록 + 상세)

## 목표

`nhncloud instance flavors` 로 인스턴스 타입(flavor)을 조회한다.

- 기본: `GET /flavors` → id·name
- `--detail`: `GET /flavors/detail` → vcpus·ram·disk 등 스펙
- `--min-disk <gb>` / `--min-ram <mb>`: NHN docs 의 `minDisk`/`minRam` 쿼리 파라미터로 전달
- 테이블은 핵심 5컬럼(id·name·vcpus·ram·disk), 나머지 필드는 `--json`

근거: NHN Cloud Instance public-api docs 의 flavor 응답 구조.
- `GET /flavors` 응답: `{ flavors: [{ id, name, links }] }`
- `GET /flavors/detail` 응답: 위 + `ram`(MB)·`vcpus`·`disk`(GB)·`swap`·`OS-FLV-EXT-DATA:ephemeral`·`OS-FLV-DISABLED:disabled`·`os-flavor-access:is_public`·`rxtx_factor`·`extra_specs`
- 두 API 모두 쿼리 파라미터 `minDisk`(GB)·`minRam`(MB) 지원

인증·endpoint 는 기존 `resolveInstanceClient`(ADR-010, `X-Auth-Token` + region 별 compute endpoint) 를 그대로 재사용한다.

## 변경 파일 (4개)

1. `src/services/instance/types.ts` — `FlavorLink` / `Flavor` / `FlavorDetail` / `FlavorListParams` 추가
2. `src/services/instance/client.ts` — `listFlavors()` 오버로드 메서드 추가
3. `src/commands/instance/flavors.ts` — 신규 명령 (입력 검증 → spinner → output)
4. `src/index.ts` — `instanceCommand.addCommand(flavorsCommand)`

## 회피 항목 (code-review-pitfalls 사전 확인)

- **1-2 (spinner 후 try/catch)**: `client.listFlavors()` 호출은 `startSpinner` 직후 try/catch 로 감싸고
  catch 에서 `stopSpinner(false)` 후 re-throw. `list.ts` 가 reference.
- **9-1 (exit code 리터럴 금지)**: min-disk/min-ram 검증 실패는 `EXIT_PARAM_ERROR` **상수** 사용 (숫자 3 리터럴·주석 금지).
- **2-1 / type 변경 → tsc**: 새 type 추가 = type 변경 → 성공 기준에 `pnpm tsc --noEmit` 필수 (tsup 은 type-check 우회).
- **5-1 / 5-3 (캐스트 회피)**: detail 분기를 `as FlavorDetail[]` 캐스트로 처리하지 **않는다**. `listFlavors` 를 오버로드로 선언해 `--detail` 시 `FlavorDetail[]`, 아니면 `Flavor[]` 를 반환타입으로 직접 받는다.
- **7-2 (출력 모드 분기)**: 결과 0건은 `output()` 이 모드별로 처리(table="결과 없음"·quiet=빈 출력·json=`[]`). 별도 early return 분기를 만들지 않는다 — `output()` 한 경로로만 출력.
- **9-1 파일입력 (해당 없음)**: flavors 는 파일 입력 옵션이 없다.
- **4-3 (requiredOption dead code 해당 없음)**: flavors 는 requiredOption 이 없다. min-disk/min-ram 은 옵션이라 수동 검증이 정당(dead code 아님).

## 작업 상세

### 1. `src/services/instance/types.ts`

`CreateServerParams` interface **앞** 에 추가:

```ts
/** flavor 응답의 링크 항목 (self / bookmark) */
export interface FlavorLink {
  href: string;
  rel: string;
}

/** 인스턴스 타입(flavor) 요약 — `GET /flavors` (id·name·links 만 보장) */
export interface Flavor {
  id: string;
  name: string;
  links: FlavorLink[];
}

/**
 * 인스턴스 타입(flavor) 상세 — `GET /flavors/detail`.
 * 요약 필드에 스펙(ram·vcpus·disk 등)이 더해진다.
 */
export interface FlavorDetail extends Flavor {
  /** 메모리 크기(MB) */
  ram: number;
  /** 가상 CPU 수 */
  vcpus: number;
  /** root 블록 스토리지 크기(GB) */
  disk: number;
  swap: string | number;
  "OS-FLV-EXT-DATA:ephemeral": number;
  "OS-FLV-DISABLED:disabled": boolean;
  "os-flavor-access:is_public": boolean;
  rxtx_factor: number;
  extra_specs?: Record<string, unknown>;
}

/** flavor 목록 조회 쿼리 파라미터 (`GET /flavors`·`GET /flavors/detail` 공통) */
export interface FlavorListParams {
  /** 최소 블록 스토리지 크기(GB) 이상만 필터 */
  minDisk?: number;
  /** 최소 RAM 크기(MB) 이상만 필터 */
  minRam?: number;
}
```

### 2. `src/services/instance/client.ts`

(a) import 에 새 type 추가:

```ts
import type { Server, CreateServerParams, Flavor, FlavorDetail, FlavorListParams } from "./types.js";
```

(b) 응답 타입 가드 추가 (기존 `isServersResponse` 근처). 두 API 모두 `{ flavors: [...] }` 형태라 가드 하나로 충분(요약·상세 공통: id·name 보장). 상세 필드는 오버로드 반환타입으로 정적 보장:

```ts
function isFlavor(val: unknown): val is Flavor {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return typeof obj["id"] === "string" && typeof obj["name"] === "string";
}

function isFlavorsResponse(val: unknown): val is { flavors: Flavor[] } {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return Array.isArray(obj["flavors"]) && obj["flavors"].every(isFlavor);
}
```

(c) `delete()` 메서드 **뒤** 에 `listFlavors()` 추가. **오버로드 선언**으로 캐스트 없이 반환타입 분기:

```ts
  /**
   * 인스턴스 타입(flavor)을 조회한다.
   * - 기본: GET /flavors (id·name·links 요약)
   * - detail: GET /flavors/detail (vcpus·ram·disk 등 스펙 포함)
   * minDisk(GB)·minRam(MB)는 NHN docs 의 쿼리 파라미터로 그대로 전달한다.
   */
  async listFlavors(params?: FlavorListParams & { detail?: false }): Promise<Flavor[]>;
  async listFlavors(params: FlavorListParams & { detail: true }): Promise<FlavorDetail[]>;
  async listFlavors(
    params: FlavorListParams & { detail?: boolean } = {},
  ): Promise<Flavor[] | FlavorDetail[]> {
    const path = params.detail ? "/flavors/detail" : "/flavors";
    const url = `${this.computeEndpoint}${path}`;

    const searchParams: Record<string, number> = {};
    if (params.minDisk !== undefined) searchParams["minDisk"] = params.minDisk;
    if (params.minRam !== undefined) searchParams["minRam"] = params.minRam;

    try {
      const raw = await ky
        .get(url, {
          headers: this.authHeaders(),
          searchParams,
          retry: 0,
          timeout: DEFAULT_TIMEOUT_MS,
        })
        .json();

      if (!isFlavorsResponse(raw)) {
        throw new NhnCloudCliError(
          "instance flavors 응답 형식이 올바르지 않습니다 — flavors 배열이 없습니다.",
          EXIT_API_ERROR,
        );
      }
      // detail 응답은 Flavor 의 상위 집합(상세 필드 추가) — 오버로드 시그니처가 호출부에 정확한 타입을 부여한다.
      return raw.flavors as Flavor[] | FlavorDetail[];
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }
```

> 주의: ky 의 `searchParams` 에 빈 객체를 넘기면 쿼리스트링이 붙지 않는다 — min-disk/min-ram 미지정 시 안전.

### 3. `src/commands/instance/flavors.ts` (신규)

`list.ts` 패턴을 따른다. min-disk/min-ram 검증은 spinner 시작 전(fail-fast). 검증은 자격증명 resolve(`resolveInstanceClient`) **앞** 에 두어 자격증명 없이도 param 에러로 차단되게 한다:

```ts
import { Command } from "commander";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { resolveInstanceClient } from "./helpers.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import type { Flavor, FlavorDetail } from "../../services/instance/types.js";

interface FlavorsGlobalOpts extends OutputOptions {
  detail?: boolean;
  minDisk?: string;
  minRam?: string;
  region?: string;
  profile?: string;
}

/** 옵션 문자열을 0 이상의 정수로 파싱. 비숫자·음수면 EXIT_PARAM_ERROR. */
function parseNonNegInt(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new NhnCloudCliError(`${flag} 는 0 이상의 정수여야 합니다 (입력: ${value}).`, EXIT_PARAM_ERROR);
  }
  return n;
}

export const flavorsCommand = new Command("flavors")
  .description("인스턴스 타입(flavor)을 조회한다 (기본 id·name, --detail 로 스펙, 전체 필드는 --json)")
  .option("--detail", "vcpus·ram·disk 등 스펙 포함 (GET /flavors/detail)")
  .option("--min-disk <gb>", "최소 블록 스토리지 크기(GB) 이상만 필터")
  .option("--min-ram <mb>", "최소 RAM 크기(MB) 이상만 필터")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<FlavorsGlobalOpts>();

    // ── 1. 파라미터 검증 (spinner 전, 자격증명 resolve 전 — fail-fast) ──
    const minDisk = parseNonNegInt(opts.minDisk, "--min-disk");
    const minRam = parseNonNegInt(opts.minRam, "--min-ram");

    // ── 2. 자격증명 + token 획득 (spinner 시작 전) ──
    const { client } = await resolveInstanceClient(opts);

    // ── 3. API 호출 (spinner 내부) ──
    startSpinner("인스턴스 타입 조회 중...");

    try {
      if (opts.detail) {
        const flavors = await client.listFlavors({ detail: true, minDisk, minRam });
        stopSpinner(true);
        printFlavors(opts, flavors);
      } else {
        const flavors = await client.listFlavors({ minDisk, minRam });
        stopSpinner(true);
        printFlavors(opts, flavors);
      }
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
  });

/** detail 여부에 따라 컬럼을 달리해 출력. 전체 필드는 --json 으로. */
function printFlavors(opts: OutputOptions, flavors: Flavor[] | FlavorDetail[]): void {
  if (isDetailList(flavors)) {
    output(opts, {
      headers: ["id", "name", "vcpus", "ram(MB)", "disk(GB)"],
      rows: flavors.map((f) => [f.id, f.name, String(f.vcpus), String(f.ram), String(f.disk)]),
      raw: flavors,
      ids: flavors.map((f) => f.id),
    });
  } else {
    output(opts, {
      headers: ["id", "name"],
      rows: flavors.map((f) => [f.id, f.name]),
      raw: flavors,
      ids: flavors.map((f) => f.id),
    });
  }
}

function isDetailList(flavors: Flavor[] | FlavorDetail[]): flavors is FlavorDetail[] {
  return flavors.length > 0 && "vcpus" in flavors[0];
}
```

> `printFlavors` 를 try 블록 밖에서 호출하지 말 것 — 위 구조처럼 `stopSpinner(true)` 직후 try 내부에서 호출해도 되고(출력 자체는 throw 안 함), 더 단순하게 하려면 flavors 를 try 밖 변수로 빼되 **반환타입 union 을 유지**(캐스트 금지). 위 구현은 spinner leak 없이 한 경로로 출력하므로 그대로 사용 가능.

### 4. `src/index.ts`

(a) import 추가 (`listCommand` import 근처):

```ts
import { flavorsCommand } from "./commands/instance/flavors.js";
```

(b) `instanceCommand.addCommand(listCommand);` **다음** 줄에 추가:

```ts
instanceCommand.addCommand(flavorsCommand);
```

## 성공 기준 (검증 명령 + 기대값)

```bash
# cwd: /Users/nhn/personal/nhncloud-cli

# 1. 타입 체크 — type 추가 + 오버로드 포함 → 필수
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l
# 기대: 0

# 2. 빌드 성공
pnpm build
# 기대: dist/index.js 생성, exit 0

# 3. flavors 가 instance 하위 명령으로 노출
node dist/index.js instance --help 2>&1 | grep -c "flavors"
# 기대: 1 이상

# 4. flavors 옵션이 help 에 노출
node dist/index.js instance flavors --help 2>&1 | grep -Ec -- "--detail|--min-disk|--min-ram"
# 기대: 3

# 5. exit code 리터럴 미사용 (9-1)
grep -nE "NhnCloudCliError\([^,]+,\s*[0-9]+" src/commands/instance/flavors.ts | wc -l
# 기대: 0

# 6. min-disk 비숫자 → EXIT_PARAM_ERROR(3) (자격증명 전 차단되는지)
node dist/index.js instance flavors --min-disk abc; echo "exit=$?"
# 기대: stderr 에 "0 이상의 정수", exit=3

# 7. min-ram 음수 → EXIT_PARAM_ERROR(3)
node dist/index.js instance flavors --min-ram -5; echo "exit=$?"
# 기대: stderr 에 "0 이상의 정수", exit=3

# 8. as 캐스트 회피 (5-1/5-3) — flavors.ts/client.ts 에 as FlavorDetail[] / as unknown as 없음
grep -nE "as FlavorDetail\[\]|as unknown as|as Flavor\[\]" src/commands/instance/flavors.ts | wc -l
# 기대: 0  (client.ts 의 `as Flavor[] | FlavorDetail[]` 은 오버로드 내부 union 정규화라 예외 — flavors.ts 만 검사)

# 9. spinner-before-validation 회귀 없음 (1-2) — parseNonNegInt 가 startSpinner 보다 앞
awk '/\.action\(async/,/^  \}\)\;/' src/commands/instance/flavors.ts | grep -nE "(startSpinner|parseNonNegInt\()" | head -4
# 기대: parseNonNegInt 호출이 startSpinner 보다 앞 줄번호
```

성공 기준 6/7 은 param 검증이 자격증명·네트워크 호출 전에 일어나므로 실제 API 를 호출하지 않는다.
실제 flavor 목록 조회(자격증명 필요)는 phase-02 후 사용자가 수동 확인한다.
