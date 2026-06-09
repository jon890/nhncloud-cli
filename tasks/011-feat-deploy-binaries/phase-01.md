# Phase 01 — 코드: deploy 바이너리 조회 2종 + 내부 docs 반영

## 목표

`nhncloud deploy` 에 바이너리 조회 명령 2개를 추가한다.

- `deploy binary-groups <target>` — 아티팩트의 바이너리 그룹 목록.
- `deploy binaries <target> --binary-group <key>` — 특정 그룹의 바이너리 목록 (페이지네이션·정렬).

`binary-group <key>` 는 `binary-groups` 조회로 얻은 `key` 를 입력으로 넣는다 — 이 연쇄가 CLI 가치다.

## API 스펙 (NHN Cloud Deploy v2.1 public-api docs — 확정)

근거: <https://docs.nhncloud.com> Deploy public-api 가이드. endpoint·쿼리·응답 구조 모두 docs 예제로 대조함.

### binary-groups

- `GET /api/v2.1/projects/{appKey}/artifacts/{artifactId}/binary-groups`
- 쿼리 파라미터 없음.
- 응답 `body.binaryGroups[]`: `{ key(number), name, description, regionCode, createDate }`.

### binaries

- `GET /api/v2.1/projects/{appKey}/artifacts/{artifactId}/binary-groups/{binaryGroupKey}/binaries`
- 쿼리: `pageNum` / `pageSize` / `sortKey`(예 `UPLOAD_DATE`) / `sortDirection`(예 `DESC`).
- 응답 `body.totalCount`(number) + `body.binaries[]`: `{ binaryKey(number), version, binaryName, binarySize(bytes), uploadDate, uploader, description }`.

### 공통

- `resultCode` 는 **문자열** — 기존 `unwrap`(ADR-006, `isSuccessful` 로만 판정) 이 이미 수용한다. 별도 처리 불필요.
- 인증: UAK → OAuth `client_credentials` access_token → `X-NHN-AUTHORIZATION: Bearer <token>`.
  기존 `createDeployClient` (helpers.ts) 가 그대로 처리 (ADR-007). **ADR 미동반** — 표준 GET + 기존 인증·좌표 패턴 재사용.
- target 좌표(appKey/artifactId): `server-groups` / `histories` 와 동일하게 named target(config, ADR-008) + `--app-key` / `--artifact-id` flag override.

## 변경 파일 (5개)

1. `src/services/deploy/types.ts` — `BinaryGroup` / `Binary` / `BinaryListParams` 추가.
2. `src/services/deploy/client.ts` — `binaryGroups()` / `binaries()` 메서드 추가.
3. `src/commands/deploy/binary-groups.ts` — 신규 명령.
4. `src/commands/deploy/binaries.ts` — 신규 명령 (`--binary-group <key>` required + 페이지네이션·정렬 옵션).
5. `src/index.ts` — `deployCommand.addCommand(...)` 2줄 등록.

추가로 내부 docs 4곳 반영 (아래 "내부 docs 반영" 절).

## 회피 항목 (code-review-pitfalls 사전 확인)

- **1-2 (spinner 후 try/catch leak)**: `client.binaryGroups()` / `client.binaries()` 호출은 `startSpinner` 직후 try 로 감싸고 catch 에서 `stopSpinner(false)` 후 re-throw. `server-groups.ts` / `histories.ts` 가 reference (spinner 전 좌표·인증 resolve → spinner 내부에서만 API 호출).
- **9-1 (exit code 리터럴 금지)**: `--binary-group` 누락·`--page-num` 등 검증 실패는 `EXIT_PARAM_ERROR` **상수** 사용. 숫자 `3` 리터럴·`/* EXIT_PARAM_ERROR */` 주석 금지.
- **7-2 (빈 결과 출력 모드 분기)**: 바이너리 0건이어도 `output()` 한 경로로만 처리한다. `output()` 이 모드별 분기(table="결과 없음" / quiet=빈 출력 / json=`[]`)를 담당하므로 `--json` 만 따로 early return 하는 분기를 만들지 않는다 (quiet 누락 사고 방지).
- **5-4 (동적 배열 요소 가드)**: 응답 `binaryGroups` / `binaries` 배열을 순회하며 필드 접근하기 전, 각 요소가 object 인지 타입 가드로 확인한다. `item as Record<...>` 캐스트 후 바로 접근 금지 — API 가 예상 외 형태를 주면 런타임 오류. 아래 client 의 `isBinaryGroup` / `isBinary` 가드가 이를 담당.
- **binarySize bytes 표기**: `binarySize` 는 **bytes 정수**다. 테이블 헤더를 `size(bytes)` 로 명시해 단위 혼동을 막는다 (KB/MB 변환은 하지 않음 — 원시값 그대로, `--json` 으로 정밀값 확인). 헤더에 단위를 박는 방식은 flavors 의 `ram(MB)` / `disk(GB)` 선례를 따른다.

## 작업 상세

### 1. `src/services/deploy/types.ts`

`DeployRunParams` interface **뒤** 에 추가:

```ts
/** 바이너리 그룹 — `GET .../binary-groups` 의 binaryGroups[] 항목 */
export interface BinaryGroup {
  /** 그룹 key (binaries 조회의 binaryGroupKey 입력) */
  key: number;
  name: string;
  description: string;
  regionCode: string;
  createDate: string;
}

/** 바이너리 — `GET .../binary-groups/{key}/binaries` 의 binaries[] 항목 */
export interface Binary {
  binaryKey: number;
  version: string;
  binaryName: string;
  /** 파일 크기 (bytes) */
  binarySize: number;
  uploadDate: string;
  uploader: string;
  description: string;
}

/** 바이너리 목록 조회 쿼리 파라미터 */
export interface BinaryListParams {
  pageNum?: number;
  pageSize?: number;
  /** 정렬 기준 (예: UPLOAD_DATE) */
  sortKey?: string;
  /** 정렬 방향 (예: DESC) */
  sortDirection?: string;
}
```

### 2. `src/services/deploy/client.ts`

(a) import 에 새 type 추가:

```ts
import type { DeployRunParams, BinaryGroup, Binary, BinaryListParams } from "./types.js";
```

(b) 클래스 상단(또는 파일 상단)에 응답 타입 가드 추가 (5-4 회피).
바이너리 그룹·바이너리 모두 number key 필드 보장을 검증한다:

```ts
function isBinaryGroup(val: unknown): val is BinaryGroup {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return typeof obj["key"] === "number" && typeof obj["name"] === "string";
}

function isBinary(val: unknown): val is Binary {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return typeof obj["binaryKey"] === "number" && typeof obj["binarySize"] === "number";
}
```

(c) `histories()` 메서드 **뒤** 에 두 메서드 추가. `histories()` 의 구조(URL 조립 → ky.get → `unwrap` → try/catch `toNhnCloudCliError`)를 그대로 따르되, 봉투 unwrap 후 배열을 가드로 검증해 typed 결과를 반환한다:

```ts
  /**
   * 바이너리 그룹 목록을 조회한다.
   */
  async binaryGroups(appKey: string, artifactId: string): Promise<BinaryGroup[]> {
    const url =
      `${this.baseUrl}/api/v2.1/projects/${appKey}` +
      `/artifacts/${artifactId}/binary-groups`;

    try {
      const res = await ky
        .get(url, {
          headers: this.authHeaders(),
          retry: 0,
          timeout: DEFAULT_TIMEOUT_MS,
        })
        .json<NhnEnvelope<{ binaryGroups?: unknown }>>();

      const body = unwrap(res);
      const list = body.binaryGroups;
      if (!Array.isArray(list) || !list.every(isBinaryGroup)) {
        throw new NhnCloudCliError(
          "binary-groups 응답 형식이 올바르지 않습니다 — binaryGroups 배열이 없습니다.",
          EXIT_API_ERROR,
        );
      }
      return list;
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  /**
   * 특정 바이너리 그룹의 바이너리 목록을 조회한다.
   * pageNum/pageSize/sortKey/sortDirection 은 NHN docs 의 쿼리 파라미터로 그대로 전달한다.
   */
  async binaries(
    appKey: string,
    artifactId: string,
    binaryGroupKey: number,
    params: BinaryListParams = {},
  ): Promise<{ totalCount: number; binaries: Binary[] }> {
    const url =
      `${this.baseUrl}/api/v2.1/projects/${appKey}` +
      `/artifacts/${artifactId}/binary-groups/${binaryGroupKey}/binaries`;

    const searchParams: Record<string, string | number> = {};
    if (params.pageNum !== undefined) searchParams["pageNum"] = params.pageNum;
    if (params.pageSize !== undefined) searchParams["pageSize"] = params.pageSize;
    if (params.sortKey !== undefined) searchParams["sortKey"] = params.sortKey;
    if (params.sortDirection !== undefined) searchParams["sortDirection"] = params.sortDirection;

    try {
      const res = await ky
        .get(url, {
          headers: this.authHeaders(),
          searchParams,
          retry: 0,
          timeout: DEFAULT_TIMEOUT_MS,
        })
        .json<NhnEnvelope<{ totalCount?: unknown; binaries?: unknown }>>();

      const body = unwrap(res);
      const list = body.binaries;
      if (!Array.isArray(list) || !list.every(isBinary)) {
        throw new NhnCloudCliError(
          "binaries 응답 형식이 올바르지 않습니다 — binaries 배열이 없습니다.",
          EXIT_API_ERROR,
        );
      }
      const totalCount = typeof body.totalCount === "number" ? body.totalCount : list.length;
      return { totalCount, binaries: list };
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }
```

(d) import 보강: `NhnCloudCliError` 와 `EXIT_API_ERROR` 가 client.ts 에 import 되어 있는지 확인하고 없으면 추가한다 (`run.ts`/기존 client 가 이미 toNhnCloudCliError 만 쓰고 있을 수 있음 — 가드에서 직접 throw 하므로 두 심볼 필요).

```ts
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_API_ERROR } from "../../utils/exit-codes.js";
```

> `binaryGroups`/`binaries` 가 빈 배열을 정상으로 받을 수 있다 — `list.every(...)` 는 빈 배열에 true 이므로 0건도 통과한다 (가드는 "배열이 아님 / 요소 형태 불일치" 만 거른다).

### 3. `src/commands/deploy/binary-groups.ts` (신규)

`server-groups.ts` 패턴을 그대로 따른다 (좌표 resolve → 인증 → spinner 내부 API 호출). 출력은 그룹별 행으로 펼친다:

```ts
import { Command } from "commander";
import { getDeployTarget } from "../../config/credentials.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { createDeployClient } from "./helpers.js";

interface BinaryGroupsGlobalOpts extends OutputOptions {
  appKey?: string;
  artifactId?: string;
  profile?: string;
}

export const binaryGroupsCommand = new Command("binary-groups")
  .description("바이너리 그룹 목록을 조회한다")
  .argument("<target>", "config.json 에 정의된 deploy target 이름")
  .option("--app-key <k>", "target 의 appKey override")
  .option("--artifact-id <id>", "target 의 artifactId override")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (targetName: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<BinaryGroupsGlobalOpts>();

    // ── 1. 좌표 로드 + flag override (spinner 시작 전) ──
    const target = await getDeployTarget(targetName);
    const appKey = opts.appKey ?? target.appKey;
    const artifactId = opts.artifactId ?? target.artifactId;

    // ── 2. 인증 체인 (spinner 시작 전) ──
    const { client } = await createDeployClient(opts.profile);

    // ── 3. API 호출 (spinner 내부, try/catch + leak 방지) ──
    startSpinner("바이너리 그룹 목록 조회 중...");

    let groups;
    try {
      groups = await client.binaryGroups(appKey, artifactId);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    // ── 4. 출력 (0건도 output() 한 경로로 — 7-2) ──
    output(opts, {
      headers: ["key", "name", "regionCode", "createDate", "description"],
      rows: groups.map((g) => [
        String(g.key),
        g.name,
        g.regionCode,
        g.createDate,
        g.description,
      ]),
      raw: groups,
      ids: groups.map((g) => String(g.key)),
    });
  });
```

> `ids` 에 `key` 를 넣어 `--quiet` 시 그룹 key 만 출력 → binaries 의 `--binary-group` 입력으로 파이프 가능 (CLI 연쇄 가치).

### 4. `src/commands/deploy/binaries.ts` (신규)

`--binary-group <key>` 는 필수다. Commander `requiredOption` 으로 강제하되, **숫자 파싱 검증은 수동으로 남긴다** (requiredOption 은 "존재" 만 보장, "숫자" 는 보장 못함 — 4-3 의 dead-code 가 아닌 정당한 수동 검증).

```ts
import { Command } from "commander";
import { getDeployTarget } from "../../config/credentials.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { createDeployClient } from "./helpers.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

interface BinariesGlobalOpts extends OutputOptions {
  binaryGroup?: string;
  pageNum?: string;
  pageSize?: string;
  sortKey?: string;
  sortDirection?: string;
  appKey?: string;
  artifactId?: string;
  profile?: string;
}

/** 옵션 문자열을 양의 정수로 파싱. 비숫자·0 이하면 EXIT_PARAM_ERROR. */
function parsePositiveInt(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new NhnCloudCliError(`${flag} 는 1 이상의 정수여야 합니다 (입력: ${value}).`, EXIT_PARAM_ERROR);
  }
  return n;
}

export const binariesCommand = new Command("binaries")
  .description("특정 바이너리 그룹의 바이너리 목록을 조회한다")
  .argument("<target>", "config.json 에 정의된 deploy target 이름")
  .requiredOption("--binary-group <key>", "조회할 바이너리 그룹 key (binary-groups 로 확인)")
  .option("--page-num <n>", "페이지 번호 (1 이상)")
  .option("--page-size <n>", "페이지 크기 (1 이상)")
  .option("--sort-key <k>", "정렬 기준 (예: UPLOAD_DATE)")
  .option("--sort-direction <d>", "정렬 방향 (예: DESC)")
  .option("--app-key <k>", "target 의 appKey override")
  .option("--artifact-id <id>", "target 의 artifactId override")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (targetName: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<BinariesGlobalOpts>();

    // ── 1. 입력 검증 (spinner 전, 자격증명 resolve 전 — fail-fast) ──
    const binaryGroupKey = parsePositiveInt(opts.binaryGroup, "--binary-group");
    if (binaryGroupKey === undefined) {
      // requiredOption 이 존재는 보장하므로 사실상 도달 불가 — 타입 narrowing 용
      throw new NhnCloudCliError("--binary-group 이 필요합니다.", EXIT_PARAM_ERROR);
    }
    const pageNum = parsePositiveInt(opts.pageNum, "--page-num");
    const pageSize = parsePositiveInt(opts.pageSize, "--page-size");

    // ── 2. 좌표 로드 + flag override ──
    const target = await getDeployTarget(targetName);
    const appKey = opts.appKey ?? target.appKey;
    const artifactId = opts.artifactId ?? target.artifactId;

    // ── 3. 인증 체인 (spinner 시작 전) ──
    const { client } = await createDeployClient(opts.profile);

    // ── 4. API 호출 (spinner 내부, try/catch + leak 방지) ──
    startSpinner("바이너리 목록 조회 중...");

    let result;
    try {
      result = await client.binaries(appKey, artifactId, binaryGroupKey, {
        pageNum,
        pageSize,
        sortKey: opts.sortKey,
        sortDirection: opts.sortDirection,
      });
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    // ── 5. 출력 (0건도 output() 한 경로로 — 7-2; binarySize 단위는 bytes 헤더 명시) ──
    output(opts, {
      headers: ["binaryKey", "version", "binaryName", "size(bytes)", "uploadDate", "uploader"],
      rows: result.binaries.map((b) => [
        String(b.binaryKey),
        b.version,
        b.binaryName,
        String(b.binarySize),
        b.uploadDate,
        b.uploader,
      ]),
      raw: result,
      ids: result.binaries.map((b) => String(b.binaryKey)),
    });
  });
```

> `requiredOption` 뒤의 `if (binaryGroupKey === undefined)` 는 dead-code 가 아니다 — `parsePositiveInt` 의 반환이 `number | undefined` union 이라 타입 narrowing 이 필요하고, 동시에 (이론상) 빈 문자열 방어. 4-3 회피 대상인 "requiredOption 필드 존재 재검증" 과 구분된다. `raw: result` 에 `totalCount` 까지 담겨 `--json` 으로 페이지 정보 확인 가능.

### 5. `src/index.ts`

(a) import 추가 (`historiesCommand` import 다음 줄):

```ts
import { binaryGroupsCommand } from "./commands/deploy/binary-groups.js";
import { binariesCommand } from "./commands/deploy/binaries.js";
```

(b) `deployCommand.addCommand(historiesCommand);` **다음** 에 추가:

```ts
deployCommand.addCommand(binaryGroupsCommand);
deployCommand.addCommand(binariesCommand);
```

## 내부 docs 반영 (이 phase 안에서 — README/SKILL 은 phase-02)

코드 산출물에 의존하지 않는 내부 docs 는 이 phase 에서 함께 갱신한다 (docs-first 원칙은 task 생성 시점에 이미 적용됨 — 여기선 코드와 동기화).

### (a) `CLAUDE.md` — 명령 카운트 + 주의사항

- `## 지원 명령 (11개)` → `## 지원 명령 (13개)` 로 갱신.
- `deploy histories` 항목 **다음** 에 두 줄 추가:

```
- `deploy binary-groups` — 바이너리 그룹 목록 조회.
- `deploy binaries` — 특정 바이너리 그룹의 바이너리 목록 조회 (`--binary-group <key>` 필수, 페이지네이션·정렬).
```

### (b) `docs/flow.md` — deploy 명령 시그니처

`### 명령 시그니처` 코드블록의 `nhncloud deploy histories ...` 줄 **다음** 에 추가:

```
nhncloud deploy binary-groups <target> [options]   # 바이너리 그룹 목록
nhncloud deploy binaries <target> --binary-group <key> [options]  # 바이너리 목록
```

그리고 옵션 표에 `--binary-group <key>` 행 추가 (적용: binaries / 필수, 설명: "조회할 바이너리 그룹 key").
페이지네이션·정렬 옵션(`--page-num` / `--page-size` / `--sort-key` / `--sort-direction`)은 binaries 전용임을 표에 1행씩 또는 묶어 명시.

### (c) `docs/code-architecture.md` — client 메서드 + command 파일

- `client.ts # DeployClient — run / artifacts / serverGroups / histories` 줄을
  `... / serverGroups / histories / binaryGroups / binaries` 로 갱신.
- `types.ts` 옆 주석에 `BinaryGroup / Binary` 추가 (있으면).
- commands/deploy 트리의 `histories.ts ...` 줄 **다음** 에 추가:

```
      binary-groups.ts      # nhncloud deploy binary-groups <target>
      binaries.ts           # nhncloud deploy binaries <target> --binary-group <key>
```

### (d) `docs/prd.md` — v1 제외 항목 갱신

`### 제외 (v1)` 의 다음 줄을:

```
- Deploy 바이너리 업/다운로드 (binary-groups/binaries) — 후속
```

조회분 구현 반영으로 변경:

```
- Deploy 바이너리 업/다운로드 — 후속 (조회 2종 `binary-groups`/`binaries` 는 task 011 에서 구현, 업로드·다운로드만 후속)
```

## 성공 기준 (검증 명령 + 기대값)

```bash
# cwd: <repo root 또는 worktree>

# 1. 타입 체크 — type 추가 포함 → 필수 (tsup 은 type-check 우회)
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l
# 기대: 0

# 2. 빌드 성공
pnpm build
# 기대: dist/index.js 생성, exit 0

# 3. 두 명령이 deploy 하위로 노출
node dist/index.js deploy --help 2>&1 | grep -Ec "binary-groups|binaries"
# 기대: 2 이상

# 4. binaries 옵션이 help 에 노출
node dist/index.js deploy binaries --help 2>&1 | grep -Ec -- "--binary-group|--page-num|--page-size|--sort-key|--sort-direction"
# 기대: 5

# 5. exit code 리터럴 미사용 (9-1) — 신규 두 파일에 NhnCloudCliError 2번째 인자 숫자 리터럴 없음
grep -nE "NhnCloudCliError\([^,]+,\s*[0-9]+" src/commands/deploy/binaries.ts src/commands/deploy/binary-groups.ts | wc -l
# 기대: 0

# 6. binaries 에서 --binary-group 누락 → EXIT_PARAM_ERROR(3) (requiredOption 강제, commander 는 1로 종료하므로 별도 확인)
node dist/index.js deploy binaries sometarget; echo "exit=$?"
# 기대: stderr 에 required option 안내, exit≠0

# 7. --binary-group 비숫자 → EXIT_PARAM_ERROR(3) (자격증명 전 차단되는지)
node dist/index.js deploy binaries sometarget --binary-group abc; echo "exit=$?"
# 기대: stderr 에 "1 이상의 정수", exit=3

# 8. --page-num 음수 → EXIT_PARAM_ERROR(3)
node dist/index.js deploy binaries sometarget --binary-group 1 --page-num -5; echo "exit=$?"
# 기대: stderr 에 "1 이상의 정수", exit=3

# 9. binarySize 단위 헤더 명시 (size(bytes))
grep -c "size(bytes)" src/commands/deploy/binaries.ts
# 기대: 1

# 10. spinner-before-validation 회귀 없음 (1-2) — binaries 에서 parsePositiveInt 가 startSpinner 보다 앞
awk '/\.action\(async/,/^  \}\)\;/' src/commands/deploy/binaries.ts | grep -nE "(startSpinner|parsePositiveInt\()" | head -4
# 기대: parsePositiveInt 호출이 startSpinner 보다 앞 줄번호

# 11. 응답 배열 가드 존재 (5-4) — client 에 isBinaryGroup / isBinary 가드
grep -cE "function isBinaryGroup|function isBinary" src/services/deploy/client.ts
# 기대: 2

# 12. CLAUDE.md 명령 카운트 갱신
grep -c "지원 명령 (13개)" CLAUDE.md
# 기대: 1

# 13. flow.md / code-architecture.md / prd.md 내부 docs 반영
grep -c "deploy binary-groups <target>" docs/flow.md
# 기대: 1 이상
grep -c "binary-groups.ts" docs/code-architecture.md
# 기대: 1
grep -c "task 011" docs/prd.md
# 기대: 1
```

## 수동 확인 (자격증명 필요 — 사용자/QA 단계)

실제 바이너리 그룹·바이너리 조회는 Deploy UAK + config target 이 필요하므로 phase-02 후 사용자가 수동 확인한다.

```bash
# profile + deploy target(config) 설정 후
node dist/index.js deploy binary-groups <target>
# → 그룹 목록에서 key 확인

node dist/index.js deploy binaries <target> --binary-group <key>
node dist/index.js deploy binaries <target> --binary-group <key> --sort-key UPLOAD_DATE --sort-direction DESC --json | head
```

성공 기준 6~8 은 입력 검증이 네트워크 호출 전에 일어나므로 실제 API 를 호출하지 않는다.
