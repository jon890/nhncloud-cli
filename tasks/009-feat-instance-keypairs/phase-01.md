# Phase 01 — 코드: 키페어 관리 명령 (목록 / 단건 / 생성 / 삭제)

## 목표

`nhncloud instance keypairs` 와 `nhncloud instance keypair <get|create|delete>` 로 키페어를 관리한다.

- 목록: `nhncloud instance keypairs` → `GET /os-keypairs` → name·fingerprint 표
- 단건: `nhncloud instance keypair get <name>` → `GET /os-keypairs/{name}` → name·fingerprint·public_key 등
- 생성: `nhncloud instance keypair create <name>` → `POST /os-keypairs`
  - `--public-key <path|string>` 미지정 시: NHN 이 키쌍 생성 → 응답에 **`private_key` 1회성 포함** (이후 재조회 불가)
  - `--output <keyfile>` (`-o`): private_key 를 파일(mode 0600)로 저장
  - `--public-key` 지정 시: 기존 공개키 등록 → private_key 안 옴
- 삭제: `nhncloud instance keypair delete <name>` → `DELETE /os-keypairs/{name}` (무응답)

근거: NHN Cloud Compute Instance public-api docs 의 os-keypairs 응답 구조 (확정).

- `GET /v2/{tenantId}/os-keypairs` → `{ keypairs: [{ keypair: { name, public_key, fingerprint } }] }`
  - **주의**: 목록은 각 원소가 `{ keypair: {...} }` 로 한 단계 더 감싸져 있다 (단건과 형태 다름).
- `GET /v2/{tenantId}/os-keypairs/{keypairName}` → `{ keypair: { name, public_key, fingerprint, user_id, id, created_at } }`
- `POST /v2/{tenantId}/os-keypairs`, body `{ "keypair": { "name": "<name>", "public_key": "<optional>" } }`
  - public_key 생략 시 응답 `keypair` 에 `private_key` 가 추가로 포함 (1회성).
- `DELETE /v2/{tenantId}/os-keypairs/{keypairName}` → 202/204 무응답

인증·endpoint 는 기존 `resolveInstanceClient` (Keystone `X-Auth-Token` + region 별 compute endpoint) 를 그대로 재사용한다. ADR 불필요 (표준 Nova os-keypairs CRUD).

## 변경 파일 (6개)

1. `src/services/instance/types.ts` — `Keypair` / `KeypairDetail` / `CreateKeypairParams` / `CreateKeypairResult` 추가
2. `src/services/instance/client.ts` — `listKeypairs()` / `getKeypair(name)` / `createKeypair(params)` / `deleteKeypair(name)` 4 메서드 + 타입 가드 추가
3. `src/commands/instance/keypairs.ts` (신규) — `nhncloud instance keypairs` (목록)
4. `src/commands/instance/keypair.ts` (신규) — `keypair` 그룹 + `get` / `create` / `delete` 하위 명령
5. `src/index.ts` — `keypairsCommand` / `keypairCommand` import + `instanceCommand.addCommand(...)`

> keypairs(목록, 복수형)와 keypair(단건 CRUD 그룹, 단수형)를 분리한다. 사용자 요청 시그니처가 `instance keypairs` vs `instance keypair get/create/delete` 라 두 최상위 하위 명령으로 둔다 (aws CLI 식). 한 파일에 합쳐도 무방하나, list 와 CRUD 그룹의 관심사가 다르므로 파일을 나눈다.

## 회피 항목 (code-review-pitfalls 사전 확인 — phase 내 1줄 인용)

- **1-2 (spinner 후 try/catch)**: spinner 가 떠 있는 동안의 모든 API 호출(`client.listKeypairs()` 등)은 try 로 감싸고 catch 에서 `stopSpinner(false)` 후 re-throw. `list.ts` 가 reference.
- **9-1 (exit code 리터럴 금지)**: 모든 `NhnCloudCliError(...)` 두번째 인자는 `EXIT_PARAM_ERROR` / `EXIT_API_ERROR` **상수** (숫자 리터럴·`3 /* EXIT_PARAM_ERROR */` 주석 금지).
- **9-1 파일 입력 가드 (--public-key <path>)**: 파일 경로 분기는 `statSync` → errno 노출 → `isFile()` → `readFileSync` 순. `catch {}` 로 errno 삼키지 말 것. `create.ts` 의 `--user-data` 블록이 reference.
- **8-1 (비밀 파일 0600 원자적 쓰기)**: `--output` 으로 private_key 를 저장할 때 temp 파일에 `mode: 0o600` 으로 쓰고 `rename` 으로 원자 교체. 직접 `writeFileSync(path, key)` 금지 (부분 기록 + 권한 race).
- **5-2 / 5-3 (캐스트 회피)**: 응답 가드(`isKeypairsResponse` 등)로 타입을 좁힌다. `as Keypair` / `as unknown as` 단언 금지.
- **2-1 (type 추가 → tsc)**: 새 type 추가 = 성공 기준에 `pnpm tsc --noEmit` 필수 (tsup 은 type-check 우회).

## 작업 상세

### 1. `src/services/instance/types.ts`

`FlavorListParams` interface **뒤**, `CreateServerParams` **앞** 에 추가:

```ts
/** 키페어 요약 — `GET /os-keypairs` 의 각 원소 keypair (name·public_key·fingerprint 보장) */
export interface Keypair {
  name: string;
  public_key: string;
  fingerprint: string;
}

/** 키페어 상세 — `GET /os-keypairs/{name}` (요약 + 메타데이터) */
export interface KeypairDetail extends Keypair {
  user_id: string;
  id: string;
  created_at: string;
}

/** `POST /os-keypairs` 요청 파라미터 */
export interface CreateKeypairParams {
  name: string;
  /** 등록할 기존 공개키. 정의 시에만 body 에 포함 (이때 private_key 응답 없음) */
  publicKey?: string;
}

/**
 * `POST /os-keypairs` 응답의 keypair.
 * public_key 미지정 생성이면 `private_key` 가 1회성으로 포함된다 (이후 재조회 불가).
 */
export interface CreateKeypairResult extends Keypair {
  user_id: string;
  /** NHN 이 생성한 경우에만 1회성으로 포함. 등록(public_key 지정) 시 없음 */
  private_key?: string;
}
```

### 2. `src/services/instance/client.ts`

(a) import 에 새 type 추가:

```ts
import type {
  Server, CreateServerParams, Flavor, FlavorDetail, FlavorListParams,
  Keypair, KeypairDetail, CreateKeypairParams, CreateKeypairResult,
} from "./types.js";
```

(b) 타입 가드 추가 (기존 flavor 가드 근처). 목록은 `{ keypair: {...} }` 한겹 더 감싸진 점에 주의:

```ts
function isKeypair(val: unknown): val is Keypair {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj["name"] === "string" &&
    typeof obj["public_key"] === "string" &&
    typeof obj["fingerprint"] === "string"
  );
}

/** 목록 응답: { keypairs: [{ keypair: {...} }] } — 원소가 한 단계 더 감싸짐 */
function isKeypairsResponse(val: unknown): val is { keypairs: { keypair: Keypair }[] } {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    Array.isArray(obj["keypairs"]) &&
    obj["keypairs"].every((e) => {
      if (typeof e !== "object" || e === null) return false;
      return isKeypair((e as Record<string, unknown>)["keypair"]);
    })
  );
}

/** 단건/생성 응답: { keypair: {...} } */
function isKeypairResponse(val: unknown): val is { keypair: Record<string, unknown> } {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return isKeypair(obj["keypair"]);
}
```

> 생성 응답은 `private_key` 가 더해질 뿐 name·public_key·fingerprint 는 동일하게 보장된다 → `isKeypairResponse` 로 공통 검증하고, `private_key` 는 optional 이라 가드하지 않는다 (없을 수 있음이 정상).

(c) `listFlavors()` 메서드 **뒤** 에 키페어 4 메서드 추가:

```ts
  /** 키페어 목록을 조회한다 (GET /os-keypairs). 응답 원소의 한겹(keypair)을 풀어 반환. */
  async listKeypairs(): Promise<Keypair[]> {
    const url = `${this.computeEndpoint}/os-keypairs`;
    try {
      const raw = await ky
        .get(url, { headers: this.authHeaders(), retry: 0, timeout: DEFAULT_TIMEOUT_MS })
        .json();
      if (!isKeypairsResponse(raw)) {
        throw new NhnCloudCliError(
          "instance keypairs 응답 형식이 올바르지 않습니다 — keypairs 배열이 없습니다.",
          EXIT_API_ERROR,
        );
      }
      return raw.keypairs.map((e) => e.keypair);
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  /** 단일 키페어를 조회한다 (GET /os-keypairs/{name}). */
  async getKeypair(name: string): Promise<KeypairDetail> {
    const url = `${this.computeEndpoint}/os-keypairs/${encodeURIComponent(name)}`;
    try {
      const raw = await ky
        .get(url, { headers: this.authHeaders(), retry: 0, timeout: DEFAULT_TIMEOUT_MS })
        .json();
      if (!isKeypairResponse(raw)) {
        throw new NhnCloudCliError(
          `instance keypair get(${name}) 응답 형식이 올바르지 않습니다 — keypair 객체가 없습니다.`,
          EXIT_API_ERROR,
        );
      }
      return raw.keypair as unknown as KeypairDetail; // ← 금지. 아래 GOOD 참조
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }
```

> **위 `getKeypair` 의 `as unknown as KeypairDetail` 은 회피 항목 5-2 위반 — 그대로 쓰지 말 것.** 단건 상세 전용 필드(user_id·id·created_at)까지 검증하는 가드(`isKeypairDetail`)를 별도로 두고 그 가드로 좁혀 단언 없이 반환한다. `listFlavors` 의 detail 분기(`isFlavorDetailsResponse`)가 reference 패턴이다:

```ts
function isKeypairDetail(val: unknown): val is KeypairDetail {
  if (!isKeypair(val)) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj["user_id"] === "string" &&
    typeof obj["id"] === "string" &&
    typeof obj["created_at"] === "string"
  );
}

function isKeypairDetailResponse(val: unknown): val is { keypair: KeypairDetail } {
  if (typeof val !== "object" || val === null) return false;
  return isKeypairDetail((val as Record<string, unknown>)["keypair"]);
}

// getKeypair 본문:
if (!isKeypairDetailResponse(raw)) {
  throw new NhnCloudCliError(
    `instance keypair get(${name}) 응답 형식이 올바르지 않습니다 — keypair 상세 필드가 없습니다.`,
    EXIT_API_ERROR,
  );
}
return raw.keypair; // KeypairDetail 로 좁혀짐 — 단언 불필요
```

create / delete:

```ts
  /**
   * 키페어를 생성한다 (POST /os-keypairs).
   * publicKey 미지정이면 NHN 이 키쌍을 생성하고 응답 keypair 에 private_key 가 1회성으로 포함된다.
   * publicKey 지정이면 기존 공개키를 등록하고 private_key 는 응답에 없다.
   */
  async createKeypair(params: CreateKeypairParams): Promise<CreateKeypairResult> {
    const url = `${this.computeEndpoint}/os-keypairs`;
    const keypairBody: Record<string, unknown> = { name: params.name };
    if (params.publicKey !== undefined) {
      keypairBody["public_key"] = params.publicKey;
    }
    let raw: unknown;
    try {
      raw = await ky
        .post(url, {
          headers: this.authHeaders(),
          json: { keypair: keypairBody },
          retry: 0,
          timeout: DEFAULT_TIMEOUT_MS,
        })
        .json();
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
    if (!isKeypairResponse(raw)) {
      throw new NhnCloudCliError(
        "instance keypair create 응답 형식이 올바르지 않습니다 — keypair 객체가 없습니다.",
        EXIT_API_ERROR,
      );
    }
    const kp = raw.keypair;
    return {
      name: kp["name"] as string,
      public_key: kp["public_key"] as string,
      fingerprint: kp["fingerprint"] as string,
      user_id: typeof kp["user_id"] === "string" ? kp["user_id"] : "",
      private_key: typeof kp["private_key"] === "string" ? kp["private_key"] : undefined,
    };
  }

  /** 키페어를 삭제한다 (DELETE /os-keypairs/{name}, 202/204 무응답). */
  async deleteKeypair(name: string): Promise<void> {
    const url = `${this.computeEndpoint}/os-keypairs/${encodeURIComponent(name)}`;
    try {
      await ky.delete(url, { headers: this.authHeaders(), retry: 0, timeout: DEFAULT_TIMEOUT_MS });
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }
```

> `isKeypairResponse` 가 name·public_key·fingerprint(string)를 이미 가드하므로 `createKeypair` 의 그 세 필드 캐스트는 가드로 좁혀진 안전 영역이다 (회피 5-3 의 optional `as` 누수와 다름). private_key 는 typeof 분기로 안전 추출 — `as` 캐스트 없음.

### 3. `src/commands/instance/keypairs.ts` (신규 — 목록)

`list.ts` 패턴 그대로. 옵션은 region/profile 만:

```ts
import { Command } from "commander";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { resolveInstanceClient } from "./helpers.js";
import type { Keypair } from "../../services/instance/types.js";

interface KeypairsGlobalOpts extends OutputOptions {
  region?: string;
  profile?: string;
}

export const keypairsCommand = new Command("keypairs")
  .description("키페어 목록을 조회한다 (name·fingerprint, 전체 필드는 --json)")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<KeypairsGlobalOpts>();
    const { client } = await resolveInstanceClient(opts);

    startSpinner("키페어 목록 조회 중...");
    let keypairs: Keypair[];
    try {
      keypairs = await client.listKeypairs();
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    output(opts, {
      headers: ["name", "fingerprint"],
      rows: keypairs.map((k) => [k.name, k.fingerprint]),
      raw: keypairs,
      ids: keypairs.map((k) => k.name),
    });
  });
```

### 4. `src/commands/instance/keypair.ts` (신규 — get / create / delete 그룹)

핵심: create 의 `--output` (private_key 0600 저장) + `--public-key` (파일 입력 가드). 목록 헤더는 0건도 `output()` 한 경로로 처리한다 (7-2).

```ts
import { Command } from "commander";
import { readFileSync, statSync } from "node:fs";
import { writeFileSync, renameSync } from "node:fs";   // 0600 원자 쓰기용 — 아래 savePrivateKey 참조
import { randomBytes } from "node:crypto";
import chalk from "chalk";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { resolveInstanceClient } from "./helpers.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";
import type { KeypairDetail, CreateKeypairResult } from "../../services/instance/types.js";

interface KeypairGlobalOpts extends OutputOptions {
  region?: string;
  profile?: string;
}
interface CreateKeypairOpts extends KeypairGlobalOpts {
  publicKey?: string;
  output?: string;
}
```

#### --public-key 해석 (파일 경로 또는 인라인 문자열)

`--public-key` 값이 **존재하는 일반 파일 경로면 그 내용**, 아니면 **문자열 그대로** 공개키로 쓴다. 파일 분기는 회피 9-1 (statSync/errno/isFile) 을 따른다:

```ts
/** --public-key 값 해석: 존재하는 파일이면 내용, 아니면 인라인 문자열. */
function resolvePublicKey(value: string): string {
  let stat: ReturnType<typeof statSync> | undefined;
  try {
    stat = statSync(value);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    // ENOENT = 파일 아님 → 인라인 문자열로 간주 (정상 경로). 그 외 errno(EACCES 등)는 노출.
    if (err.code && err.code !== "ENOENT") {
      throw new NhnCloudCliError(
        `--public-key 파일을 읽을 수 없습니다: ${value} (${err.code})`,
        EXIT_PARAM_ERROR,
      );
    }
    return value; // 파일 없음 → 인라인 공개키 문자열
  }
  if (!stat.isFile()) {
    // 디렉터리 등 → 인라인 문자열로 오인하면 위험하므로 명시적 에러
    throw new NhnCloudCliError(`--public-key 가 일반 파일이 아닙니다: ${value}`, EXIT_PARAM_ERROR);
  }
  return readFileSync(value, "utf-8").trim();
}
```

#### private_key 0600 원자 저장 (회피 8-1)

```ts
/** private_key 를 mode 0600 으로 원자적으로 저장한다 (temp + rename). */
function savePrivateKey(filePath: string, privateKey: string): void {
  const tmp = `${filePath}.${randomBytes(4).toString("hex")}.tmp`;
  const content = privateKey.endsWith("\n") ? privateKey : privateKey + "\n";
  try {
    writeFileSync(tmp, content, { encoding: "utf-8", mode: 0o600 });
    renameSync(tmp, filePath);
  } catch (e) {
    const reason = (e as NodeJS.ErrnoException).code ?? (e instanceof Error ? e.message : String(e));
    throw new NhnCloudCliError(
      `private_key 파일을 저장할 수 없습니다: ${filePath} (${reason})`,
      EXIT_PARAM_ERROR,
    );
  }
}
```

#### get / create / delete 하위 명령

```ts
const getKeypairCmd = new Command("get")
  .description("단일 키페어를 조회한다")
  .argument("<name>", "키페어 이름")
  .option("--region <region>", "region override")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (name: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<KeypairGlobalOpts>();
    const { client } = await resolveInstanceClient(opts);

    startSpinner("키페어 조회 중...");
    let kp: KeypairDetail;
    try {
      kp = await client.getKeypair(name);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    output(opts, {
      headers: ["field", "value"],
      rows: [
        ["name", kp.name],
        ["fingerprint", kp.fingerprint],
        ["user_id", kp.user_id],
        ["created_at", kp.created_at],
        ["public_key", kp.public_key],
      ],
      raw: kp,
      ids: [kp.name],
    });
  });

const createKeypairCmd = new Command("create")
  .description("키페어를 생성한다 (--public-key 미지정 시 NHN 이 키쌍 생성 — private_key 1회성)")
  .argument("<name>", "키페어 이름")
  .option("--public-key <path|key>", "기존 공개키 (파일 경로 또는 키 문자열). 지정 시 private_key 미반환")
  .option("-o, --output <keyfile>", "생성된 private_key 를 파일(mode 0600)로 저장")
  .option("--region <region>", "region override")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (name: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<CreateKeypairOpts>();

    // ── 1. 입력 검증 (spinner·자격증명 resolve 전 — fail-fast) ──
    const publicKey = opts.publicKey !== undefined ? resolvePublicKey(opts.publicKey) : undefined;
    // --output 과 --public-key 동시 지정은 모순 (등록은 private_key 안 옴)
    if (opts.output !== undefined && publicKey !== undefined) {
      throw new NhnCloudCliError(
        "--output 은 NHN 이 키를 생성할 때만 의미가 있습니다. --public-key 와 함께 쓸 수 없습니다.",
        EXIT_PARAM_ERROR,
      );
    }

    // ── 2. 자격증명 + token ──
    const { client } = await resolveInstanceClient(opts);

    // ── 3. 생성 (spinner 내부) ──
    startSpinner("키페어 생성 중...");
    let result: CreateKeypairResult;
    try {
      result = await client.createKeypair({ name, publicKey });
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    // ── 4. private_key 처리 ──
    if (result.private_key !== undefined) {
      if (opts.output !== undefined) {
        savePrivateKey(opts.output, result.private_key);
        process.stderr.write(chalk.green(`  private_key 를 ${opts.output} 에 저장했습니다 (mode 0600).\n`));
      } else {
        // 한 번만 표시됨 — stderr 경고 + stdout 출력 (--quiet 면 stderr 경고만)
        process.stderr.write(
          chalk.yellow("  ⚠ private_key 는 지금 한 번만 표시됩니다. 분실 시 복구 불가 — 안전한 곳에 보관하세요.\n"),
        );
        if (!opts.quiet) process.stdout.write(result.private_key + "\n");
      }
    }

    // ── 5. 메타 출력 (private_key 제외 — json 출력에도 노출 최소화) ──
    const { private_key, ...meta } = result;
    output(opts, {
      headers: ["field", "value"],
      rows: [
        ["name", meta.name],
        ["fingerprint", meta.fingerprint],
        ["user_id", meta.user_id],
      ],
      raw: meta,
      ids: [meta.name],
    });
  });

const deleteKeypairCmd = new Command("delete")
  .description("키페어를 삭제한다")
  .argument("<name>", "키페어 이름")
  .option("--region <region>", "region override")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (name: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<KeypairGlobalOpts>();
    const { client } = await resolveInstanceClient(opts);

    startSpinner("키페어 삭제 중...");
    try {
      await client.deleteKeypair(name);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true, `키페어 삭제 완료: ${name}`);

    if (!opts.quiet) process.stdout.write(`deleted: ${name}\n`);
  });

export const keypairCommand = new Command("keypair")
  .description("키페어 단건 관리 (get / create / delete)")
  .addCommand(getKeypairCmd)
  .addCommand(createKeypairCmd)
  .addCommand(deleteKeypairCmd);
```

> **설계 포인트 재강조 — private_key 1회성**:
> create 응답의 private_key 는 NHN 이 생성한 경우에만, **그 응답 1회**에만 온다. 이후 `keypair get` 으로 재조회해도 public_key·fingerprint 만 나오고 private_key 는 없다. 따라서:
> - `--output <keyfile>` 지정: 파일(mode 0600)로 저장 + stderr 안내. **자동화 권장 경로.**
> - 미지정: stderr 에 "한 번만 표시됨 / 분실 시 복구 불가" 경고 + stdout 으로 private_key 출력 (사용자가 직접 리다이렉트).
> - `--public-key` 로 기존 공개키 등록 시 private_key 자체가 안 오므로 `--output` 은 무의미 → 동시 지정은 EXIT_PARAM_ERROR.

> **destructuring 주의**: `const { private_key, ...meta } = result;` 에서 `private_key` 는 이후 사용 안 하므로 lint 가 unused 로 잡을 수 있다. eslint 설정상 문제되면 `// eslint-disable-next-line` 대신 `delete (result as { private_key?: string }).private_key` 보다, 위처럼 rest 로 분리해 `raw: meta` 로 넘기는 편이 명확하다. tsc `noUnusedLocals` 가 켜져 있으면 `const { private_key: _omit, ...meta }` 로 회피 (성공 기준 tsc 확인).

### 5. `src/index.ts`

(a) import 추가 (`flavorsCommand` import 근처):

```ts
import { keypairsCommand } from "./commands/instance/keypairs.js";
import { keypairCommand } from "./commands/instance/keypair.js";
```

(b) `instanceCommand.addCommand(flavorsCommand);` **다음** 줄에 추가:

```ts
instanceCommand.addCommand(keypairsCommand);
instanceCommand.addCommand(keypairCommand);
```

## 성공 기준 (검증 명령 + 기대값 — 자격증명 불필요)

```bash
# cwd: <repo root 또는 worktree>

# 1. 타입 체크 — type 추가 + 가드 포함 → 필수 (tsup 우회)
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l
# 기대: 0

# 2. 빌드 성공
pnpm build
# 기대: dist/index.js 생성, exit 0

# 3. keypairs / keypair 가 instance 하위 명령으로 노출
node dist/index.js instance --help 2>&1 | grep -Ec "keypairs|keypair"
# 기대: 2 이상

# 4. keypair 하위 명령 (get/create/delete) 노출
node dist/index.js instance keypair --help 2>&1 | grep -Ec "get|create|delete"
# 기대: 3

# 5. create 옵션 (--public-key / --output) 노출
node dist/index.js instance keypair create --help 2>&1 | grep -Ec -- "--public-key|--output"
# 기대: 2

# 6. exit code 리터럴 미사용 (9-1)
grep -nE "NhnCloudCliError\([^,]+,\s*[0-9]+" src/commands/instance/keypair.ts src/commands/instance/keypairs.ts | wc -l
# 기대: 0

# 7. as 캐스트 회피 (5-2/5-3) — keypair.ts/client.ts 에 as unknown as 없음 + getKeypair 단언 제거 확인
grep -nE "as unknown as|as KeypairDetail" src/commands/instance/keypair.ts src/services/instance/client.ts | wc -l
# 기대: 0  (client.ts 의 getKeypair 는 isKeypairDetailResponse 가드로 좁혀 단언 없음)

# 8. private_key 저장이 0600 + 원자(rename) 인지 (8-1)
grep -nE "mode: 0o600|renameSync" src/commands/instance/keypair.ts | wc -l
# 기대: 2 이상 (writeFileSync mode 0o600 + renameSync 둘 다)

# 9. --public-key 파일 분기에 statSync errno 노출 가드 (9-1)
grep -nE "statSync|ErrnoException|isFile\(\)" src/commands/instance/keypair.ts | wc -l
# 기대: 3 이상

# 10. spinner-before-error: 모든 client 호출이 try 내부 (1-2)
grep -nE "client\.(listKeypairs|getKeypair|createKeypair|deleteKeypair)" src/commands/instance/keypair.ts src/commands/instance/keypairs.ts
# 기대: 각 호출의 직전 줄 범위에 startSpinner, 직후 catch 에 stopSpinner(false) (수동 육안 확인)

# 11. private_key 가 메타 table/json 에 노출되지 않음 (rest 분리로 meta 만 raw)
grep -nE "raw: meta" src/commands/instance/keypair.ts | wc -l
# 기대: 1
```

## 수동 확인 (자격증명 필요 — 사용자/QA 단계)

```bash
# NHN 이 키 생성 → private_key 파일 저장 (0600 확인)
node dist/index.js instance keypair create <name> -o /tmp/test.pem
ls -l /tmp/test.pem    # -rw------- (0600) 기대

# 목록 / 단건
node dist/index.js instance keypairs
node dist/index.js instance keypair get <name>

# 기존 공개키 등록 (private_key 안 옴)
node dist/index.js instance keypair create <name2> --public-key ~/.ssh/id_rsa.pub

# 삭제
node dist/index.js instance keypair delete <name>
```
