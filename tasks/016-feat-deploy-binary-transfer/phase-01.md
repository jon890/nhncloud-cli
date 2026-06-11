# Phase 01 — 코드: deploy upload (multipart 전송 경로) + 파일 입력 가드 + 내부 docs

## 목표

`nhncloud deploy` 에 바이너리 업로드 명령 1개를 추가한다.

- `deploy upload <target> --file <path> --binary-group <key>` — 로컬 파일을 바이너리 그룹에 업로드한다.

이 phase 가 도입하는 **신규 인프라**: ky 의 `body: FormData` 를 쓰는 **multipart/form-data 전송 경로**.
현 CLI 의 client 는 ky `json:` (JSON body) 만 사용한다 (`run.ts` 의 `client.run`).
업로드는 파일 + 텍스트 필드를 multipart 로 묶어 보내야 하므로 client 에 신규 전송 경로를 추가한다.

`--binary-group <key>` 는 task 011 의 `deploy binary-groups <target>` 조회로 얻은 `key` 를 입력으로 넣는다 (011 선행 의존).

## API 스펙 (NHN Cloud Deploy v2.1 public-api docs — 확정)

근거: <https://docs.nhncloud.com> Deploy public-api 가이드. endpoint·요청 형식·응답 구조 모두 docs 예제로 대조함.

- **endpoint**: `POST /api/v2.1/projects/{appKey}/artifacts/{artifactId}/binary-group/{binaryGroupKey}`
  - 경로 세그먼트가 `binary-group` (단수) 임에 주의 — 011 의 조회 endpoint 는 `binary-groups` (복수) 였다. docs 그대로 따른다.
- **요청 형식**: `multipart/form-data`
  - `binaryFile` — 업로드할 파일 (파일 파트).
  - `applicationType` — 예 `"server"` (텍스트 파트). `--application-type` 옵션, 기본 `"server"`.
  - `description` — 설명 (텍스트 파트, 선택). `--description` 옵션.
- **응답**: 봉투 JSON. `body.{ downloadUrl, binaryKey }`.
  - `resultCode` 는 **문자열** — 기존 `unwrap`(ADR-006, `isSuccessful` 로만 판정) 이 그대로 수용. 별도 처리 불필요.
- **인증**: UAK → OAuth `client_credentials` access_token → `X-NHN-AUTHORIZATION: Bearer <token>`.
  기존 `createDeployClient` (helpers.ts) 가 그대로 처리 (ADR-007).
  - **Content-Type 주의**: multipart 는 boundary 를 런타임이 정해야 하므로 `Content-Type` 헤더를 **수동으로 박지 않는다**. ky 에 `body: FormData` 를 넘기면 boundary 가 자동 설정된다. `authHeaders()` 에는 인증 헤더만 둔다.
- **target 좌표(appKey/artifactId)**: `server-groups` / `histories` / 011 과 동일하게 named target(config, ADR-008) + `--app-key` / `--artifact-id` flag override.

## 회피 항목 (code-review-pitfalls 사전 확인)

- **1-2 (spinner 후 try/catch leak)**: `client.uploadBinary(...)` 호출은 `startSpinner` 직후 try 로 감싸고 catch 에서 `stopSpinner(false)` 후 re-throw. `server-groups.ts` / `histories.ts` 가 reference (좌표·인증·파일 가드는 spinner 전, API 호출만 spinner 내부).
- **9-1 (exit code 리터럴 금지)**: 파일 가드·`--binary-group` 검증 실패는 `EXIT_PARAM_ERROR` **상수** 사용. 숫자 `3` 리터럴·`/* EXIT_PARAM_ERROR */` 주석 금지.
- **파일 입력 가드 (code-review-pitfalls 9-1 파일 입력)**: `--file <path>` 를 `readFileSync` 로 바로 읽지 않는다. 읽기 전 `statSync` 한 번으로 errno 노출(ENOENT/EACCES/EISDIR 구분) + `isFile()` (디렉터리 차단) + size 가드를 끝낸다. `instance/create.ts` 의 `--user-data` 블록이 1:1 reference. errno 는 `(e as NodeJS.ErrnoException).code` 로 노출, 실패 시 `EXIT_PARAM_ERROR`.
  - **크기 한도**: user-data 처럼 인코딩 후 역산하는 한도는 없다 — 바이너리 원본을 그대로 보낸다. 다만 무제한 read 로 인한 메모리 폭발을 막기 위해 보수적 상한(예 `512 MB`)을 둔다. 상한 초과 시 `EXIT_PARAM_ERROR` + "너무 큽니다" 안내. 상수로 `MAX_UPLOAD_BYTES` 선언(매직 넘버 회피).

## ⚠️ 소유권 분리 + 쓰기 작업 정책 (1-24 / 1-26)

- **1-24**: 결정 docs(`CLAUDE.md` 카운트·`docs/flow.md`·`docs/code-architecture.md`·`docs/adr.md` ADR-015)는 executor 가 phase 안에서 편집하지 않는다. **team-lead 가 phase-01·02(코드) 완료 후 docs-first commit 으로 일괄 작성**한다 (아래 "내부 docs 반영" 절은 team-lead 작성 스펙). executor 의 phase-01 범위는 **코드 4파일(아래 1~4)** 뿐.
- **1-26 (쓰기 작업)**: `deploy upload` 는 실제 바이너리를 업로드하는 **쓰기 작업**이라 executor 가 자율 호출하지 않는다 (사용자 정책: 코드만, 실제 upload 는 수동 QA). multipart 코드는 작성·빌드·정적 검증(tsc/help)까지만, 실제 업로드 호출은 phase-03 의 수동 QA 절로 남긴다.

## 변경 파일 (executor — 코드 4개)

1. `src/services/deploy/types.ts` — `UploadBinaryParams` / `UploadBinaryResult` 추가.
2. `src/services/deploy/client.ts` — `uploadBinary()` 메서드 추가 (multipart 전송 경로 — 신규).
3. `src/commands/deploy/upload.ts` — 신규 명령 (파일 가드 + 옵션).
4. `src/index.ts` — `deployCommand.addCommand(uploadCommand)` 등록.

> (내부 docs 4곳 = team-lead docs-first. 아래 "내부 docs 반영" 절은 team-lead 작성 스펙 — executor 는 손대지 않는다.)

## 작업 상세

### 1. `src/services/deploy/types.ts`

기존 type 뒤에 추가 (011 이 먼저 머지됐다면 `Binary` 등 뒤):

```ts
/** 바이너리 업로드 요청 — multipart/form-data 로 전송 */
export interface UploadBinaryParams {
  appKey: string;
  artifactId: string;
  /** 업로드 대상 바이너리 그룹 key (binary-groups 조회로 확인) */
  binaryGroupKey: number;
  /** 업로드할 파일 내용 (command 에서 statSync 가드 후 읽은 Buffer) */
  fileBuffer: Buffer;
  /** form 의 파일 파트 파일명 (basename) */
  fileName: string;
  /** applicationType 텍스트 파트 (예: server) */
  applicationType: string;
  /** 설명 (선택) */
  description?: string;
}

/** 바이너리 업로드 응답 — body.{downloadUrl, binaryKey} */
export interface UploadBinaryResult {
  downloadUrl: string;
  binaryKey: number;
}
```

### 2. `src/services/deploy/client.ts` — `uploadBinary()` (신규 multipart 전송 경로)

(a) import 보강 — 가드에서 직접 throw 하므로 두 심볼 필요 (없으면 추가):

```ts
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_API_ERROR } from "../../utils/exit-codes.js";
import type { DeployRunParams, UploadBinaryParams, UploadBinaryResult } from "./types.js";
```

(b) `run()` 메서드 **뒤** 에 추가. `run()` 의 골격(URL 조립 → ky → unwrap → try/catch `toNhnCloudCliError`)을 따르되 `json:` 대신 `body: FormData` 를 쓴다:

```ts
  /**
   * 바이너리를 multipart/form-data 로 업로드한다.
   *
   * 신규 전송 경로 — 기존 메서드는 ky `json:`(JSON body) 만 쓴다 (ADR-015).
   * - 파일 파트(binaryFile)는 command 에서 statSync 가드 후 읽은 Buffer 를 Blob 으로 감싼다.
   * - Content-Type 은 수동으로 박지 않는다 — ky 가 FormData 에서 multipart boundary 를 자동 설정한다.
   */
  async uploadBinary(params: UploadBinaryParams): Promise<UploadBinaryResult> {
    const url =
      `${this.baseUrl}/api/v2.1/projects/${params.appKey}` +
      `/artifacts/${params.artifactId}/binary-group/${params.binaryGroupKey}`;

    const form = new FormData();
    // Buffer → Uint8Array → Blob (Node 18+ 전역 Blob/FormData 사용)
    const blob = new Blob([params.fileBuffer]);
    form.append("binaryFile", blob, params.fileName);
    form.append("applicationType", params.applicationType);
    if (params.description !== undefined) {
      form.append("description", params.description);
    }

    try {
      const res = await ky
        .post(url, {
          headers: this.authHeaders(), // Content-Type 미지정 — boundary 자동
          body: form,
          retry: 0,
          timeout: SYNC_TIMEOUT_MS, // 업로드는 파일 크기에 따라 길 수 있어 긴 timeout
        })
        .json<NhnEnvelope<{ downloadUrl?: unknown; binaryKey?: unknown }>>();

      const body = unwrap(res);
      if (typeof body.downloadUrl !== "string" || typeof body.binaryKey !== "number") {
        throw new NhnCloudCliError(
          "upload 응답 형식이 올바르지 않습니다 — downloadUrl/binaryKey 누락.",
          EXIT_API_ERROR,
        );
      }
      return { downloadUrl: body.downloadUrl, binaryKey: body.binaryKey };
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }
```

> `authHeaders()` 가 인증 헤더만 반환하는지 확인한다 (현재 `X-NHN-AUTHORIZATION` 만 반환 — OK). `run()` 은 `...this.authHeaders(), "Content-Type": "application/json"` 으로 JSON 을 박지만, upload 는 절대 Content-Type 을 박지 않는다 (multipart boundary 충돌).
> `SYNC_TIMEOUT_MS`(600초) 가 client.ts 상단에 이미 선언돼 있다 — 재사용.

### 3. `src/commands/deploy/upload.ts` (신규)

`server-groups.ts` 의 좌표·인증 패턴 + `instance/create.ts` 의 파일 가드 블록을 합친다.
`--binary-group <key>` 는 필수(`requiredOption`)이되 숫자 파싱은 수동 검증(011 의 `parsePositiveInt` 패턴과 동일 — requiredOption 은 "존재" 만 보장).

```ts
import { Command } from "commander";
import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { getDeployTarget } from "../../config/credentials.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { createDeployClient } from "./helpers.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

/** 업로드 파일 메모리 폭발 방지용 보수적 상한 (512 MiB) */
const MAX_UPLOAD_BYTES = 512 * 1024 * 1024;

interface UploadGlobalOpts extends OutputOptions {
  file?: string;
  binaryGroup?: string;
  applicationType?: string;
  description?: string;
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

export const uploadCommand = new Command("upload")
  .description("로컬 파일을 바이너리 그룹에 업로드한다")
  .argument("<target>", "config.json 에 정의된 deploy target 이름")
  .requiredOption("--file <path>", "업로드할 파일 경로")
  .requiredOption("--binary-group <key>", "업로드 대상 바이너리 그룹 key (binary-groups 로 확인)")
  .option("--application-type <type>", "applicationType (예: server)", "server")
  .option("--description <text>", "바이너리 설명")
  .option("--app-key <k>", "target 의 appKey override")
  .option("--artifact-id <id>", "target 의 artifactId override")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (targetName: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<UploadGlobalOpts>();

    // ── 1. 입력 검증 (spinner 전, 자격증명 resolve 전 — fail-fast) ──
    const binaryGroupKey = parsePositiveInt(opts.binaryGroup, "--binary-group");
    if (binaryGroupKey === undefined) {
      // requiredOption 이 존재 보장 → 타입 narrowing 용 (빈 문자열 방어)
      throw new NhnCloudCliError("--binary-group 이 필요합니다.", EXIT_PARAM_ERROR);
    }

    // ── 파일 가드: 읽기 전에 statSync 로 errno·파일유형·크기 차단 (code-review-pitfalls 9-1 파일입력) ──
    const filePath = opts.file!; // requiredOption 으로 Commander 가 보장
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(filePath);
    } catch (e) {
      const reason =
        (e as NodeJS.ErrnoException).code ?? (e instanceof Error ? e.message : String(e));
      throw new NhnCloudCliError(
        `--file 을 읽을 수 없습니다: ${filePath} (${reason})`,
        EXIT_PARAM_ERROR,
      );
    }
    if (!stat.isFile()) {
      throw new NhnCloudCliError(`--file 이 일반 파일이 아닙니다: ${filePath}`, EXIT_PARAM_ERROR);
    }
    if (stat.size > MAX_UPLOAD_BYTES) {
      throw new NhnCloudCliError(
        `--file 이 너무 큽니다 (${stat.size} 바이트). 업로드 한도 ${MAX_UPLOAD_BYTES} 바이트.`,
        EXIT_PARAM_ERROR,
      );
    }
    const fileBuffer = readFileSync(filePath);
    const fileName = basename(filePath);

    // ── 2. 좌표 로드 + flag override ──
    const target = await getDeployTarget(targetName);
    const appKey = opts.appKey ?? target.appKey;
    const artifactId = opts.artifactId ?? target.artifactId;

    // ── 3. 인증 체인 (spinner 시작 전) ──
    const { client } = await createDeployClient(opts.profile);

    // ── 4. 업로드 (spinner 내부, try/catch + leak 방지) ──
    startSpinner("바이너리 업로드 중...");

    let result;
    try {
      result = await client.uploadBinary({
        appKey,
        artifactId,
        binaryGroupKey,
        fileBuffer,
        fileName,
        applicationType: opts.applicationType ?? "server",
        description: opts.description,
      });
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    // ── 5. 출력 (--quiet 는 binaryKey 만 → download 입력으로 연쇄) ──
    output(opts, {
      headers: ["field", "value"],
      rows: [
        ["binaryKey", String(result.binaryKey)],
        ["downloadUrl", result.downloadUrl],
      ],
      raw: result,
      ids: [String(result.binaryKey)],
    });
  });
```

> `ids` 에 `binaryKey` 를 넣어 `--quiet` 시 key 만 출력 → download 의 `--binary-key` 입력으로 파이프 가능 (CLI 연쇄 가치).
> `if (binaryGroupKey === undefined)` 는 dead-code 가 아니다 — `parsePositiveInt` 반환이 `number | undefined` union 이라 narrowing 필요 + 빈 문자열 방어 (011 phase-01 의 동일 판단).

### 4. `src/index.ts`

(a) import 추가:

```ts
import { uploadCommand } from "./commands/deploy/upload.js";
```

(b) deploy 하위 명령 등록부에 추가 (011 의 `binariesCommand` 등록 다음 권장):

```ts
deployCommand.addCommand(uploadCommand);
```

## 내부 docs 반영 (이 phase 안에서 — README/SKILL 은 phase-03)

코드 산출물에 의존하지 않는 내부 docs 는 이 phase 에서 동기화한다.

### (a) `CLAUDE.md` — 명령 카운트 + 항목

- `## 지원 명령 (N개)` 의 N 을 현재값 + 1 로 갱신 (011 이 +2 한 뒤 기준이면 그에 맞춤 — 작업 시점 실제 카운트 확인 후 갱신).
- deploy 항목 마지막에 추가:

```
- `deploy upload` — 로컬 파일을 바이너리 그룹에 업로드 (multipart/form-data, `--file` + `--binary-group <key>` 필수).
```

### (b) `docs/flow.md` — deploy 명령 시그니처

`### 명령 시그니처` 코드블록의 deploy 줄 마지막에 추가:

```
nhncloud deploy upload <target> --file <path> --binary-group <key> [options]   # 바이너리 업로드
```

옵션 표에 `--file <path>` (upload / 필수) · `--binary-group <key>` (upload / 필수) · `--application-type` · `--description` 행 추가.

### (c) `docs/code-architecture.md` — client 메서드 + command 파일

- `client.ts` 주석의 메서드 나열에 `uploadBinary` 추가.
- commands/deploy 트리에 추가:

```
      upload.ts             # nhncloud deploy upload <target> --file <path> --binary-group <key>
```

### (d) `docs/prd.md` — v1 제외 항목 갱신

011 이 갱신한 "Deploy 바이너리 업/다운로드 — 후속 (... 업로드·다운로드만 후속)" 줄을 upload 구현 반영으로 갱신한다 (download 는 phase-02 후속):

```
- Deploy 바이너리 다운로드 — task 016 phase-02 후속 (업로드 `deploy upload` 는 task 016 에서 구현)
```

> ADR-015 본문은 phase-03 에서 확정한다 (upload·download 두 인프라를 한 ADR 로 묶어 서술해야 하므로 download 구현 후 작성). 이 phase 에서는 `client.ts` 의 `uploadBinary` 주석에 `(ADR-015)` 만 참조로 남긴다.

## 성공 기준 (검증 명령 + 기대값)

```bash
# cwd: <repo root 또는 worktree>

# 1. 타입 체크 — type 추가 포함 → 필수 (tsup 은 type-check 우회)
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l
# 기대: 0

# 2. 빌드 성공
pnpm build
# 기대: dist/index.js 생성, exit 0

# 3. upload 가 deploy 하위로 노출
node dist/index.js deploy --help 2>&1 | grep -c "upload"
# 기대: 1 이상

# 4. upload 옵션이 help 에 노출
node dist/index.js deploy upload --help 2>&1 | grep -Ec -- "--file|--binary-group|--application-type|--description"
# 기대: 4

# 5. exit code 리터럴 미사용 (9-1)
grep -nE "NhnCloudCliError\([^,]+,\s*[0-9]+" src/commands/deploy/upload.ts | wc -l
# 기대: 0

# 6. multipart 전송 경로 — client 가 body: FormData 사용 (json: 아님)
grep -cE "body:\s*form|new FormData\(\)" src/services/deploy/client.ts
# 기대: 2 이상 (FormData 생성 + body 전달)

# 7. upload 가 Content-Type 을 수동으로 박지 않음 (multipart boundary 충돌 방지)
awk '/async uploadBinary/,/^  }$/' src/services/deploy/client.ts | grep -c "Content-Type"
# 기대: 0

# 8. 파일 가드: statSync 가 readFileSync 보다 앞 (code-review-pitfalls 9-1 파일입력)
grep -nE "statSync|readFileSync" src/commands/deploy/upload.ts
# 기대: statSync 줄번호 < readFileSync 줄번호

# 9. 파일 가드 3종(errno/isFile/size) 존재
grep -cE "ErrnoException|\.isFile\(\)|MAX_UPLOAD_BYTES" src/commands/deploy/upload.ts
# 기대: 3 이상

# 10. 매직 넘버 회피 — 크기 상한이 상수
grep -c "MAX_UPLOAD_BYTES" src/commands/deploy/upload.ts
# 기대: 2 이상 (선언 + 사용)

# 11. spinner-before-validation 회귀 없음 (1-2) — 파일 가드가 startSpinner 보다 앞
awk '/\.action\(async/,/^  \}\)\;/' src/commands/deploy/upload.ts | grep -nE "(startSpinner|statSync)" | head -3
# 기대: statSync 호출이 startSpinner 보다 앞 줄번호

# 12. --binary-group 비숫자 → EXIT_PARAM_ERROR(3), 네트워크 호출 전 차단
node dist/index.js deploy upload sometarget --file package.json --binary-group abc; echo "exit=$?"
# 기대: stderr 에 "1 이상의 정수", exit=3

# 13. --file 부재 → EXIT_PARAM_ERROR(3), errno(ENOENT) 노출
node dist/index.js deploy upload sometarget --file /no/such/file --binary-group 1; echo "exit=$?"
# 기대: stderr 에 "읽을 수 없습니다" + (ENOENT), exit=3

# 14. --file 이 디렉터리 → EXIT_PARAM_ERROR(3)
node dist/index.js deploy upload sometarget --file . --binary-group 1; echo "exit=$?"
# 기대: stderr 에 "일반 파일이 아닙니다", exit=3

# 15. 내부 docs 반영
grep -c "deploy upload" docs/flow.md
# 기대: 1 이상
grep -c "upload.ts" docs/code-architecture.md
# 기대: 1
grep -c "task 016" docs/prd.md
# 기대: 1 이상
```

## 수동 확인 (자격증명 + 실제 파일 필요 — 사용자/QA 단계)

실제 업로드는 Deploy UAK + config target + 실재 binaryGroupKey 가 필요하므로 사용자가 수동 확인한다.
성공 기준 12~14 는 입력 검증이 네트워크 호출 전에 일어나므로 실제 API 를 호출하지 않는다.

```bash
# profile + deploy target(config) 설정 후
# 1) 011 로 그룹 key 확인
node dist/index.js deploy binary-groups <target>

# 2) 작은 테스트 파일 업로드
echo "hello" > /tmp/upload-test.txt
node dist/index.js deploy upload <target> --file /tmp/upload-test.txt --binary-group <key> --description "cli test"
# → binaryKey / downloadUrl 출력 확인

# 3) quiet 연쇄 (binaryKey 만)
node dist/index.js deploy upload <target> --file /tmp/upload-test.txt --binary-group <key> --quiet
# → binaryKey 한 줄만 stdout

# 4) 011 binaries 로 업로드된 항목 재확인
node dist/index.js deploy binaries <target> --binary-group <key>
```
