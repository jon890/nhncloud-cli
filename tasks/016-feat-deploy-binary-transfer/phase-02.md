# Phase 02 — 코드: deploy download (파일 스트림 저장 경로) + 덮어쓰기 정책 + 내부 docs

## 목표

`nhncloud deploy` 에 바이너리 다운로드 명령 1개를 추가한다.

- `deploy download <target> --binary-group <key> --binary-key <key> -o <file>` — 바이너리를 로컬 파일로 저장한다.

이 phase 가 도입하는 **신규 인프라**: 응답 body 를 **파일로 쓰는 출력 경로**.
현 CLI 의 출력은 `output()` (stdout / table / json / quiet) 뿐이다.
download 응답은 **봉투 JSON 이 아니라 파일 바이너리 스트림**이라 `unwrap`/`output()` 을 거치지 않고 `.arrayBuffer()` 로 받아 `writeFileSync` 로 파일에 쓴다.

`--binary-group <key>` / `--binary-key <key>` 는 task 011 의 `deploy binary-groups` / `deploy binaries` 조회로 얻는다 (011 선행 의존). `--binary-key` 는 phase-01 의 `deploy upload` 응답으로도 얻을 수 있다.

## API 스펙 (NHN Cloud Deploy v2.1 public-api docs — 확정)

근거: <https://docs.nhncloud.com> Deploy public-api 가이드.

- **endpoint**: `GET /api/v2.1/projects/{appKey}/artifacts/{artifactId}/binary-group/{binaryGroupKey}/binaries/{binaryKey}`
  - 경로 세그먼트가 `binary-group` (단수) — phase-01 upload 와 동일. 011 조회의 `binary-groups` (복수) 와 다름. docs 그대로.
- **응답**: **봉투 JSON 이 아니라 파일 바이너리 스트림**이다.
  - `resultCode` / `header.isSuccessful` **미적용** — `unwrap` 을 호출하면 안 된다 (JSON 파싱 자체가 실패하거나 바이너리를 텍스트로 오해석).
  - 성공/실패 판정은 **HTTP status** 로만 한다 (ky 기본 `throwHttpErrors: true` 가 4xx/5xx 를 HTTPError 로 던짐 → 기존 `toNhnCloudCliError` 가 처리).
- **인증**: phase-01 과 동일 (`X-NHN-AUTHORIZATION: Bearer <token>`, ADR-007).

## 회피 항목 (code-review-pitfalls 사전 확인)

- **1-2 (spinner 후 try/catch leak)**: `client.downloadBinary(...)` + 파일 쓰기를 `startSpinner` 직후 try 로 감싸고 catch 에서 `stopSpinner(false)` 후 re-throw.
- **9-1 (exit code 리터럴 금지)**: `--binary-group`/`--binary-key` 숫자 검증·덮어쓰기 거부는 `EXIT_PARAM_ERROR` **상수**.
- **download 저장 시 기존 파일 덮어쓰기 정책**: `-o <file>` 대상이 이미 존재하면 기본은 거부(`EXIT_PARAM_ERROR` + "이미 존재 — --force 로 덮어쓰기"), `--force` 일 때만 덮어쓴다. 무인 자동화에서 의도치 않은 덮어쓰기를 막는다. 존재 검사는 `statSync` 의 ENOENT 를 "없음=정상" 으로, 그 외 errno 는 그대로 노출.
- **봉투 우회 인지 (5-3 의도 변형)**: download 는 `unwrap` 을 **쓰지 않는다**. 다른 메서드처럼 `.json<NhnEnvelope<...>>()` 를 호출하면 바이너리를 JSON 으로 파싱하다 깨진다. `.arrayBuffer()` 로 받는다는 것을 client 주석에 명시(미래 AI 가 unwrap 으로 "통일"하지 않도록).

## ⚠️ 소유권 분리 (1-24)

내부 결정 docs(CLAUDE 카운트·flow·code-architecture)는 **team-lead docs-first** (phase-01·02 코드 후 일괄). executor 의 phase-02 범위는 **코드 3파일(아래 1~3)** 뿐. (download 는 GET 으로 클라우드 바이너리를 읽어 로컬 파일로 저장 — 실제 다운로드는 수동 QA.)

## 변경 파일 (executor — 코드 3개)

1. `src/services/deploy/client.ts` — `downloadBinary()` 메서드 추가 (파일 스트림 수신 경로 — 신규, unwrap 우회).
2. `src/commands/deploy/download.ts` — 신규 명령 (덮어쓰기 정책 + 파일 쓰기).
3. `src/index.ts` — `deployCommand.addCommand(downloadCommand)` 등록.

> (내부 docs 3곳 = team-lead docs-first. 아래 절은 team-lead 작성 스펙 — executor 미접촉.)

## 작업 상세

### 1. `src/services/deploy/client.ts` — `downloadBinary()` (신규 스트림 수신 경로)

`uploadBinary()` **뒤** 에 추가. 다른 메서드와 달리 `.json()`/`unwrap` 을 거치지 않고 `.arrayBuffer()` 로 받아 Buffer 를 반환한다:

```ts
  /**
   * 바이너리를 다운로드해 내용(Buffer)을 반환한다.
   *
   * 신규 수신 경로 — 응답이 봉투 JSON 이 아니라 파일 바이너리 스트림이다 (ADR-015).
   * 다른 메서드처럼 .json()/unwrap 을 쓰면 바이너리를 JSON 으로 파싱하다 깨진다 —
   * 반드시 .arrayBuffer() 로 받는다. 성공/실패는 HTTP status(ky throwHttpErrors)로만 판정.
   * 파일 쓰기는 command 가 담당한다 (client 는 내용만 반환 — 테스트 용이).
   */
  async downloadBinary(
    appKey: string,
    artifactId: string,
    binaryGroupKey: number,
    binaryKey: number,
  ): Promise<Buffer> {
    const url =
      `${this.baseUrl}/api/v2.1/projects/${appKey}` +
      `/artifacts/${artifactId}/binary-group/${binaryGroupKey}/binaries/${binaryKey}`;

    try {
      const ab = await ky
        .get(url, {
          headers: this.authHeaders(),
          retry: 0,
          timeout: SYNC_TIMEOUT_MS, // 큰 파일 다운로드 — 긴 timeout
        })
        .arrayBuffer();

      return Buffer.from(ab);
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }
```

> client 가 파일에 직접 쓰지 않고 Buffer 만 반환하는 이유: 파일 경로·덮어쓰기 정책은 CLI 도메인 관심사라 command 에 둔다. client 는 순수 HTTP→Buffer 변환만 — 단위 테스트가 파일 시스템 없이 가능.
> 매우 큰 파일까지 진짜 스트리밍(디스크로 직접 pipe)하려면 `res.body` ReadableStream → `node:stream` 변환이 필요하나, MVP 는 `.arrayBuffer()` (메모리 적재) 로 충분하다. 메모리 트레이드오프는 ADR-015 에 기록 (phase-03).

### 2. `src/commands/deploy/download.ts` (신규)

`--binary-group` / `--binary-key` / `-o` 는 필수. 숫자 검증은 phase-01 의 `parsePositiveInt` 패턴 재사용. 파일 쓰기 전 덮어쓰기 정책 검사:

```ts
import { Command } from "commander";
import { statSync, writeFileSync } from "node:fs";
import chalk from "chalk";
import { getDeployTarget } from "../../config/credentials.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import type { OutputOptions } from "../../formatters/table.js";
import { createDeployClient } from "./helpers.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

interface DownloadGlobalOpts extends OutputOptions {
  binaryGroup?: string;
  binaryKey?: string;
  output?: string;
  force?: boolean;
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

/** 대상 경로가 이미 존재하면(파일/디렉터리 무관) --force 없이는 거부. ENOENT 만 정상. */
function assertWritable(path: string, force: boolean): void {
  if (force) return;
  try {
    statSync(path);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return; // 없음 = 정상
    const reason = (e as NodeJS.ErrnoException).code ?? (e instanceof Error ? e.message : String(e));
    throw new NhnCloudCliError(`-o 경로를 확인할 수 없습니다: ${path} (${reason})`, EXIT_PARAM_ERROR);
  }
  // statSync 성공 = 이미 존재
  throw new NhnCloudCliError(
    `-o 대상이 이미 존재합니다: ${path}. 덮어쓰려면 --force 를 쓰세요.`,
    EXIT_PARAM_ERROR,
  );
}

export const downloadCommand = new Command("download")
  .description("바이너리를 로컬 파일로 다운로드한다")
  .argument("<target>", "config.json 에 정의된 deploy target 이름")
  .requiredOption("--binary-group <key>", "바이너리 그룹 key (binary-groups 로 확인)")
  .requiredOption("--binary-key <key>", "다운로드할 바이너리 key (binaries 또는 upload 로 확인)")
  .requiredOption("-o, --output <file>", "저장할 파일 경로")
  .option("--force", "대상 파일이 있으면 덮어쓴다")
  .option("--app-key <k>", "target 의 appKey override")
  .option("--artifact-id <id>", "target 의 artifactId override")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (targetName: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<DownloadGlobalOpts>();

    // ── 1. 입력 검증 (spinner 전 — fail-fast) ──
    const binaryGroupKey = parsePositiveInt(opts.binaryGroup, "--binary-group");
    const binaryKey = parsePositiveInt(opts.binaryKey, "--binary-key");
    if (binaryGroupKey === undefined || binaryKey === undefined) {
      // requiredOption 이 존재 보장 → narrowing 용
      throw new NhnCloudCliError("--binary-group / --binary-key 가 필요합니다.", EXIT_PARAM_ERROR);
    }
    const outPath = opts.output!; // requiredOption 보장
    assertWritable(outPath, opts.force ?? false); // 덮어쓰기 정책 — 네트워크 호출 전 차단

    // ── 2. 좌표 로드 + flag override ──
    const target = await getDeployTarget(targetName);
    const appKey = opts.appKey ?? target.appKey;
    const artifactId = opts.artifactId ?? target.artifactId;

    // ── 3. 인증 체인 (spinner 시작 전) ──
    const { client } = await createDeployClient(opts.profile);

    // ── 4. 다운로드 + 파일 쓰기 (spinner 내부, try/catch + leak 방지) ──
    startSpinner("바이너리 다운로드 중...");

    try {
      const buffer = await client.downloadBinary(appKey, artifactId, binaryGroupKey, binaryKey);
      writeFileSync(outPath, buffer); // 봉투 우회 — 파일 스트림 저장 경로
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    // ── 5. 결과 안내 (데이터=파일이므로 stdout 으로 본문 출력 없음. 경로/크기는 stderr) ──
    if (!opts.quiet) {
      process.stderr.write(chalk.green(`  저장됨: ${outPath}\n`));
    }
  });
```

> 출력 규약: download 의 "데이터" 는 파일 자체다. stdout 에 표/JSON 을 쓰지 않는다 (CLAUDE.md 출력 규약 — 데이터=stdout, 안내=stderr). 저장 안내는 stderr. `--quiet` 면 안내도 생략 (자동화 시 무출력).
> `writeFileSync` 가 `startSpinner` 와 같은 try 안에 있어 쓰기 실패(EACCES 등)도 spinner leak 없이 처리된다.
> 덮어쓰기 검사(`assertWritable`)는 spinner·네트워크 호출 전 — 이미 있는 파일이면 다운로드 전에 즉시 거부(낭비 호출 방지).

### 3. `src/index.ts`

```ts
import { downloadCommand } from "./commands/deploy/download.js";
// ...
deployCommand.addCommand(downloadCommand);
```

## 내부 docs 반영 (이 phase 안에서 — README/SKILL 은 phase-03)

### (a) `CLAUDE.md` — 명령 카운트 + 항목

- `## 지원 명령 (N개)` 의 N 을 phase-01 기준 + 1 로 갱신.
- deploy 항목에 추가:

```
- `deploy download` — 바이너리를 로컬 파일로 다운로드 (`-o <file>` 저장, 기본 덮어쓰기 거부 · `--force` 로 강제).
```

### (b) `docs/flow.md`

`### 명령 시그니처` deploy 줄에 추가:

```
nhncloud deploy download <target> --binary-group <key> --binary-key <key> -o <file> [options]   # 바이너리 다운로드
```

옵션 표에 `--binary-key <key>` (download / 필수) · `-o, --output <file>` (download / 필수) · `--force` (download) 행 추가.

### (c) `docs/code-architecture.md`

- `client.ts` 주석 메서드 나열에 `downloadBinary` 추가.
- commands/deploy 트리에 추가:

```
      download.ts           # nhncloud deploy download <target> --binary-key <key> -o <file>
```

## 성공 기준 (검증 명령 + 기대값)

```bash
# cwd: <repo root 또는 worktree>

# 1. 타입 체크
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l
# 기대: 0

# 2. 빌드 성공
pnpm build
# 기대: dist/index.js 생성, exit 0

# 3. download 가 deploy 하위로 노출
node dist/index.js deploy --help 2>&1 | grep -c "download"
# 기대: 1 이상

# 4. download 옵션이 help 에 노출
node dist/index.js deploy download --help 2>&1 | grep -Ec -- "--binary-group|--binary-key|--output|--force"
# 기대: 4

# 5. exit code 리터럴 미사용 (9-1)
grep -nE "NhnCloudCliError\([^,]+,\s*[0-9]+" src/commands/deploy/download.ts | wc -l
# 기대: 0

# 6. 봉투 우회 — downloadBinary 가 .arrayBuffer() 사용, unwrap/.json() 미사용
awk '/async downloadBinary/,/^  }$/' src/services/deploy/client.ts | grep -c "arrayBuffer"
# 기대: 1 이상
awk '/async downloadBinary/,/^  }$/' src/services/deploy/client.ts | grep -cE "unwrap\(|\.json<"
# 기대: 0

# 7. 파일 스트림 저장 — command 가 writeFileSync 로 파일에 쓴다
grep -c "writeFileSync" src/commands/deploy/download.ts
# 기대: 1 이상

# 8. 덮어쓰기 정책 — assertWritable + --force
grep -cE "assertWritable|--force|opts\.force" src/commands/deploy/download.ts
# 기대: 2 이상

# 9. 덮어쓰기 검사가 다운로드(client 호출)보다 앞 (낭비 호출 방지)
grep -nE "assertWritable|client\.downloadBinary" src/commands/deploy/download.ts
# 기대: assertWritable 줄번호 < downloadBinary 줄번호

# 10. --binary-key 비숫자 → EXIT_PARAM_ERROR(3), 네트워크 전 차단
node dist/index.js deploy download sometarget --binary-group 1 --binary-key abc -o /tmp/x.bin; echo "exit=$?"
# 기대: stderr 에 "1 이상의 정수", exit=3

# 11. 기존 파일 + --force 없음 → EXIT_PARAM_ERROR(3) (네트워크 전 차단)
node dist/index.js deploy download sometarget --binary-group 1 --binary-key 1 -o package.json; echo "exit=$?"
# 기대: stderr 에 "이미 존재" + "--force", exit=3

# 12. 내부 docs 반영
grep -c "deploy download" docs/flow.md
# 기대: 1 이상
grep -c "download.ts" docs/code-architecture.md
# 기대: 1
```

## 수동 확인 (자격증명 + 실제 바이너리 필요 — 사용자/QA 단계)

성공 기준 10~11 은 입력 검증·덮어쓰기 검사가 네트워크 호출 전이라 실제 API 를 호출하지 않는다.

```bash
# profile + deploy target 설정 후
# 1) 011 로 그룹·바이너리 key 확인 (또는 upload 응답의 binaryKey)
node dist/index.js deploy binaries <target> --binary-group <key>

# 2) 다운로드 (새 경로)
node dist/index.js deploy download <target> --binary-group <key> --binary-key <binary-key> -o /tmp/dl.bin
# → stderr "저장됨: /tmp/dl.bin", 파일 생성 확인
ls -l /tmp/dl.bin

# 3) 같은 경로 재다운로드 → 덮어쓰기 거부 확인
node dist/index.js deploy download <target> --binary-group <key> --binary-key <binary-key> -o /tmp/dl.bin; echo "exit=$?"
# 기대: "이미 존재" exit=3

# 4) --force 로 덮어쓰기
node dist/index.js deploy download <target> --binary-group <key> --binary-key <binary-key> -o /tmp/dl.bin --force
# → 정상 저장

# 5) 업로드한 파일과 바이트 동일 확인 (라운드트립)
echo "hello" > /tmp/upload-test.txt
node dist/index.js deploy upload <target> --file /tmp/upload-test.txt --binary-group <key> --quiet  # → binaryKey 출력
node dist/index.js deploy download <target> --binary-group <key> --binary-key <위 binaryKey> -o /tmp/dl-roundtrip.txt --force
diff /tmp/upload-test.txt /tmp/dl-roundtrip.txt && echo "round-trip OK"
```
