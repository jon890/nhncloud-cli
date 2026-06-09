# Phase 01 — 코드: logncrash send 명령 (로그 전송) + ADR-014 + 내부 docs

## 목표

`nhncloud logncrash send` 로 로그 한 건을 Log & Crash 로 전송한다 (기존 `search` 의 대칭 쓰기).

- `POST https://api-logncrash.nhncloudservice.com/v2/log` — 검색(`api-lncs-search`)과 **다른 collector host**
- 인증 헤더 없음 — body 의 `projectName` 필드에 appkey 를 넣어 식별 (검색의 `X-LNCS-SECRET` 와 다른 모델, **secret 불요**)
- 메시지 본문은 `--body`(필수, 또는 stdin/`--file`) 로 받는다.
- `--level`(DEBUG/INFO/WARN/ERROR/FATAL), `--version`, `--source`/`--type`/`--host` 로 부가 필드 설정.

근거: NHN Cloud Log & Crash Search public-api docs 의 로그 수집(collector) 스펙 (확정).

- 요청 body 필수: `projectName`(=appkey)·`projectVersion`·`logVersion`("v2")·`body`(로그 메시지)
- 요청 body 선택: `logSource`(기본 "http")·`logType`(기본 "log")·`host`·`sendTime`·`logLevel`(DEBUG/INFO/WARN/ERROR/FATAL)
- 사용자 정의 필드: `txt*`(전문검색)·`long*`(정수)·`double*`(실수) prefix — 이번 phase 범위 밖(후속)
- 제한: 요청당 52MB, 단일 로그(JSON) 8MB
- 응답: 검색과 같은 **중첩 봉투** `{ header: { isSuccessful, resultCode(숫자 0=성공), resultMessage } }` — 공식 docs 수집(collector) API 가이드 예제로 확정 (flat 아님). `isSuccessful` 로만 판정하고 숫자 resultCode 를 그대로 수용한다 ([[adr-006]]). body 는 없을 수 있어 쓰지 않는다.

## 결정 docs 는 team-lead 가 docs-first 로 이미 반영함 (이 phase 범위 밖)

ADR-014 + `CLAUDE.md`(카운트 22·ADR 참조 표·인증 모델 collector 행) + `docs/flow.md`(send 흐름) + `docs/code-architecture.md`(endpoints collector·client send·send.ts 트리) 는 **결정 docs 라 phase 안에서 편집 금지** (planning SKILL 갱신 시점 분리 / common-pitfalls 1-18). team-lead 가 이 branch 의 직전 commit (`docs: add ADR-014 ...`) 으로 이미 반영했다.
executor 는 **이 docs 들을 건드리지 않는다.** 코드만 작성한다. (공개 docs README/SKILL 은 phase-02 에서.)

## 변경 파일 (5개 — 코드만)

1. `src/api/endpoints.ts` — `ENDPOINTS` 맵에 `logncrash-collector` 키 추가
2. `src/services/logncrash/types.ts` — `LogLevel` + `LogSendParams` 추가
3. `src/services/logncrash/client.ts` — `send()` 메서드 추가
4. `src/commands/logncrash/send.ts` — 신규 명령
5. `src/index.ts` — `logncrashCommand.addCommand(sendCommand)`

## 회피 항목 (code-review-pitfalls 사전 확인)

- **1-2 (spinner 후 try/catch)**: `client.send()` 호출은 `startSpinner` 직후 try/catch 로 감싸고 catch 에서 `stopSpinner(false)` 후 re-throw. `search.ts` 5단계가 reference.
- **9-1 (exit code 리터럴 금지)**: 입력/한도 검증 실패는 `EXIT_PARAM_ERROR`, appkey 누락은 `EXIT_CONFIG_ERROR` **상수** 사용 (숫자 3·4 리터럴·주석 금지).
- **2-4 (자격증명 빈문자열 fallback 금지)**: `cred.appkey` 가 없으면 `EXIT_CONFIG_ERROR` + 설정 안내로 즉시 차단한다. `cred.appkey ?? ""` 로 채워 빈 projectName 으로 전송하지 않는다 (전송이 묻혀버린 실패가 된다). **send 는 secret 을 읽지 않는다** — secret 검증·전달 자체가 없어야 한다(검색과 다름).
- **메시지 크기 한도(8MB) 검증**: `--body`/stdin/`--file` 로 받은 메시지의 byte 길이(`Buffer.byteLength(body, "utf-8")`)가 8MB 초과면 `EXIT_PARAM_ERROR` 로 fail-fast. 한도는 인코딩 없이 원본 byte 기준(collector 는 base64 인코딩하지 않음 — instance user_data 의 ADR-012 와 다름).
- **파일 입력(`--file`) stat 가드 (9-1 파일 입력)**: `--file <path>` 를 `readFileSync` 로 곧장 읽지 않는다. `statSync` → `isFile()` → size 가드(8MB) → errno 노출 후 통과한 정상 파일만 읽는다. `create.ts` 의 user_data stat 가드가 reference.
- **2-1 / type 변경 → tsc**: `LogSendParams` 추가 = type 변경 → 성공 기준에 `pnpm tsc --noEmit` 필수 (tsup 은 type-check 우회).
- **4-3 (requiredOption dead code)**: `--body` 는 stdin/`--file` 대안이 있어 `requiredOption` 이 **아니다**. action 내부 "셋 중 하나는 있어야 함" 수동 검증이 정당(dead code 아님).

## 작업 상세

### 1. `src/api/endpoints.ts`

`ENDPOINTS` 맵에 collector 키를 추가한다 (검색 키 `logncrash` 는 그대로 유지):

```ts
const ENDPOINTS: Record<string, string> = {
  logncrash: "https://api-lncs-search.nhncloudservice.com",
  "logncrash-collector": "https://api-logncrash.nhncloudservice.com",
  deploy: "https://api-deploy.nhncloudservice.com",
};
```

> read host(`logncrash`)와 write host(`logncrash-collector`)가 실제로 다르다 — ADR-014. 한 키로 합치지 않는다.

### 2. `src/services/logncrash/types.ts`

`LogSearchResult` **뒤** 에 추가:

```ts
/** logncrash send 가 허용하는 로그 레벨 (collector 스펙) */
export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";

/** logncrash 로그 전송 파라미터 (collector POST /v2/log) */
export interface LogSendParams {
  /** 로그 메시지 본문 (필수) */
  body: string;
  /** 프로젝트 버전 (collector 필수 필드) */
  projectVersion: string;
  /** 로그 레벨 (선택) */
  logLevel?: LogLevel;
  /** 로그 소스 (선택, collector 기본 "http") */
  logSource?: string;
  /** 로그 타입 (선택, collector 기본 "log") */
  logType?: string;
  /** 로그를 보낸 host 식별 (선택) */
  host?: string;
}
```

### 3. `src/services/logncrash/client.ts`

(a) import 에 collector 타입 추가:

```ts
import type { LogSearchParams, LogSearchResult, LogSendParams } from "./types.js";
```

(b) `search()` **뒤** 에 `send()` 메서드 추가. 검색과 달리 **collector host + appkey 를 body 의 `projectName` 으로** 보내고 인증 헤더는 없다:

```ts
  /**
   * 로그 한 건을 Log & Crash collector 로 전송한다 (ADR-014).
   * - host: api-logncrash (검색의 api-lncs-search 와 별도)
   * - 인증: 헤더 없음 — body 의 projectName=appkey 로 식별 (secret 불요)
   * - logVersion 은 "v2" 고정. logSource/logType 미지정 시 collector 기본값("http"/"log") 적용.
   */
  async send(params: LogSendParams): Promise<void> {
    const endpoint = endpointFor("logncrash-collector");
    const url = `${endpoint}/v2/log`;

    const payload: Record<string, unknown> = {
      projectName: this.appkey,
      projectVersion: params.projectVersion,
      logVersion: "v2",
      body: params.body,
    };
    if (params.logLevel !== undefined) payload["logLevel"] = params.logLevel;
    if (params.logSource !== undefined) payload["logSource"] = params.logSource;
    if (params.logType !== undefined) payload["logType"] = params.logType;
    if (params.host !== undefined) payload["host"] = params.host;

    try {
      const res = await ky
        .post(url, {
          headers: { "Content-Type": "application/json" },
          json: payload,
        })
        .json<NhnEnvelope<unknown>>();

      // resultCode 는 숫자지만 isSuccessful 로만 판정 (ADR-006). body 가 없을 수 있어 반환값을 쓰지 않는다.
      if (!res.header.isSuccessful) {
        throw new NhnCloudCliError(`API 오류: ${res.header.resultMessage}`, EXIT_API_ERROR);
      }
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }
```

> 주의:
> - **secret 을 읽지도 전송하지도 않는다** — collector 는 appkey 만으로 식별한다 (검색과 다른 인증 모델, ADR-014).
> - `unwrap()` 은 body 부재 시 throw 하므로 여기선 쓰지 않는다 (collector 응답은 body 없이 header 만 올 수 있다). `isSuccessful` 직접 판정으로 충분.
> - import 에 `NhnCloudCliError` / `EXIT_API_ERROR` 가 필요하면 추가한다 (현재 client.ts 는 `toNhnCloudCliError` 만 import — `NhnCloudCliError`·`EXIT_API_ERROR` import 추가).

### 4. `src/commands/logncrash/send.ts` (신규)

`search.ts` 패턴을 따른다. 검증은 자격증명 로드보다 앞·spinner 보다 앞(fail-fast). 메시지는 `--body` > `--file` > stdin 순으로 해석.

```ts
import { Command } from "commander";
import { readFileSync, statSync } from "node:fs";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR, EXIT_CONFIG_ERROR } from "../../utils/exit-codes.js";
import { resolveProfileName, getServiceCredential } from "../../config/credentials.js";
import { LogncrashClient } from "../../services/logncrash/client.js";
import type { LogLevel } from "../../services/logncrash/types.js";

/** 단일 로그(JSON) 한도 — collector 스펙 8MB (원본 byte 기준, 인코딩 없음). */
const MAX_LOG_BYTES = 8 * 1024 * 1024;

const VALID_LEVELS: readonly LogLevel[] = ["DEBUG", "INFO", "WARN", "ERROR", "FATAL"];

interface SendGlobalOpts {
  body?: string;
  file?: string;
  level?: string;
  version?: string;
  source?: string;
  type?: string;
  host?: string;
  profile?: string;
}

/** --body > --file > stdin 순으로 로그 본문을 해석한다. 셋 다 없으면 EXIT_PARAM_ERROR. */
function resolveBody(opts: SendGlobalOpts): string {
  if (opts.body !== undefined) return opts.body;

  if (opts.file !== undefined) {
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(opts.file);
    } catch (e) {
      const reason = (e as NodeJS.ErrnoException).code ?? (e instanceof Error ? e.message : String(e));
      throw new NhnCloudCliError(`로그 파일을 읽을 수 없습니다: ${opts.file} (${reason})`, EXIT_PARAM_ERROR);
    }
    if (!stat.isFile()) {
      throw new NhnCloudCliError(`로그 파일이 일반 파일이 아닙니다: ${opts.file}`, EXIT_PARAM_ERROR);
    }
    if (stat.size > MAX_LOG_BYTES) {
      throw new NhnCloudCliError(
        `로그 파일이 너무 큽니다: ${stat.size} 바이트 (한도 ${MAX_LOG_BYTES} 바이트).`,
        EXIT_PARAM_ERROR,
      );
    }
    return readFileSync(opts.file, "utf-8");
  }

  // stdin (파이프 입력)
  if (!process.stdin.isTTY) {
    return readFileSync(0, "utf-8");
  }

  throw new NhnCloudCliError(
    "로그 본문이 필요합니다. --body <text> 또는 --file <path> 또는 표준입력(파이프)으로 전달하세요.",
    EXIT_PARAM_ERROR,
  );
}

export const sendCommand = new Command("send")
  .description("로그 한 건을 Log & Crash 로 전송한다 (--body / --file / stdin)")
  .option("--body <text>", "로그 메시지 본문 (미지정 시 --file 또는 stdin)")
  .option("--file <path>", "로그 본문을 읽을 파일 경로")
  .option("--level <level>", "로그 레벨 (DEBUG/INFO/WARN/ERROR/FATAL)")
  .option("--version <ver>", "projectVersion (미지정 시 기본 '1.0.0')")
  .option("--source <source>", "logSource (collector 기본 'http')")
  .option("--type <type>", "logType (collector 기본 'log')")
  .option("--host <host>", "로그를 보낸 host 식별")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<SendGlobalOpts>();

    // ── 1. 본문 해석 + 크기 한도 검증 (spinner 전, 자격증명 전 — fail-fast) ──
    const body = resolveBody(opts);
    const bytes = Buffer.byteLength(body, "utf-8");
    if (bytes === 0) {
      throw new NhnCloudCliError("로그 본문이 비어 있습니다.", EXIT_PARAM_ERROR);
    }
    if (bytes > MAX_LOG_BYTES) {
      throw new NhnCloudCliError(
        `로그 본문이 너무 큽니다: ${bytes} 바이트 (한도 ${MAX_LOG_BYTES} 바이트).`,
        EXIT_PARAM_ERROR,
      );
    }

    // ── 2. 레벨 검증 (선택 옵션, 지정 시에만) ──
    let logLevel: LogLevel | undefined;
    if (opts.level !== undefined) {
      const upper = opts.level.toUpperCase();
      if (!VALID_LEVELS.includes(upper as LogLevel)) {
        throw new NhnCloudCliError(
          `--level 은 ${VALID_LEVELS.join("/")} 중 하나여야 합니다 (입력: ${opts.level}).`,
          EXIT_PARAM_ERROR,
        );
      }
      logLevel = upper as LogLevel;
    }

    // ── 3. 자격증명 로드 — appkey 만 사용 (secret 불요, ADR-014) ──
    const profileName = await resolveProfileName(opts.profile);
    const cred = await getServiceCredential("logncrash", profileName);
    if (!cred.appkey) {
      throw new NhnCloudCliError(
        `profile "${profileName}" 의 logncrash 자격증명에 appkey 가 없습니다.\ncredentials.json 에 "appkey": "<appkey>" 를 추가하세요.`,
        EXIT_CONFIG_ERROR,
      );
    }
    // collector 는 secret 을 쓰지 않으므로 두 번째 인자에 빈 문자열을 넘긴다 — send() 가 secret 을 읽지 않는다.
    const client = new LogncrashClient(cred.appkey, "");

    // ── 4. 전송 (spinner 내부, try/catch + leak 방지) ──
    startSpinner("로그 전송 중...");
    try {
      await client.send({
        body,
        projectVersion: opts.version ?? "1.0.0",
        logLevel,
        logSource: opts.source,
        logType: opts.type,
        host: opts.host,
      });
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true, "로그를 전송했습니다.");
  });
```

> client 생성자 호환 메모: `LogncrashClient` 는 `(appkey, secret)` 두 인자를 받는다(검색 공유). send 는 secret 을 쓰지 않으므로 빈 문자열(`""`)을 넘긴다 — **이건 2-4 의 자격증명 빈문자열 fallback 위반이 아니다.** 2-4 는 "필요한 비밀을 `?? ""` 로 채워 묻혀버린 실패를 만드는 것"을 금지한다. send 는 secret 이 애초에 불필요하고 `send()` 가 secret 을 읽지 않으므로(전송 경로에 secret 부재) 빈 문자열이 인증 실패를 만들 수 없다. appkey 는 위에서 존재 검증 후 전달한다.

### 5. `src/index.ts`

(a) import 추가 (`searchCommand` import 근처):

```ts
import { sendCommand } from "./commands/logncrash/send.js";
```

(b) `logncrashCommand.addCommand(searchCommand);` **다음** 줄에 추가:

```ts
logncrashCommand.addCommand(sendCommand);
```

### (결정 docs 는 executor 범위 밖)

`docs/adr.md`(ADR-014) · `CLAUDE.md` · `docs/flow.md` · `docs/code-architecture.md` 는 team-lead 가 docs-first commit 으로 이미 반영했다. executor 는 손대지 않는다.

## 성공 기준 (검증 명령 + 기대값 — executor 코드 산출물 한정)

```bash
# cwd: <repo root 또는 plan012 worktree>

# 1. 타입 체크 — type 추가 → 필수
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l
# 기대: 0

# 2. 빌드 성공
pnpm build
# 기대: dist/index.js 생성, exit 0

# 3. send 가 logncrash 하위 명령으로 노출
node dist/index.js logncrash --help 2>&1 | grep -c "send"
# 기대: 1 이상

# 4. send 옵션이 help 에 노출
node dist/index.js logncrash send --help 2>&1 | grep -Ec -- "--body|--file|--level|--version|--source|--type|--host"
# 기대: 7

# 4b. --version 이 CLI 버전 플래그가 아니라 projectVersion 옵션으로 파싱되는지 (MINOR 3 — Commander version 플래그 충돌 점검)
#     send 는 .version() 을 호출하지 않으므로 subcommand 레벨 --version <ver> 은 일반 옵션이어야 한다.
echo "hi" | node dist/index.js logncrash send --version 9.9.9 --level BOGUS; echo "exit=$?"
# 기대: CLI 버전("0.3.0")을 출력하고 종료하지 않고, --level BOGUS 검증까지 도달해 exit=3
#       (만약 "0.3.0" 만 출력하고 exit=0 이면 --version 이 버전 플래그로 가로채진 것 → --app-version 등으로 rename 필요)

# 5. exit code 리터럴 미사용 (9-1)
grep -nE "NhnCloudCliError\([^,]+,\s*[0-9]+" src/commands/logncrash/send.ts | wc -l
# 기대: 0

# 6. send 가 secret 을 읽지 않음 (ADR-014 / 2-4) — send.ts 에 cred.secret 참조 없음
grep -c "cred.secret" src/commands/logncrash/send.ts
# 기대: 0

# 7. appkey 빈문자열 fallback 금지 (2-4) — appkey 에 ?? "" 없음
grep -nE "appkey\s*\?\?\s*\"\"" src/commands/logncrash/send.ts | wc -l
# 기대: 0

# 8. collector 키가 endpoints 에 등록 (맵 정의 1회)
grep -c "logncrash-collector" src/api/endpoints.ts
# 기대: 1

# 9. 본문 없음(파이프 아님·옵션 없음) → EXIT_PARAM_ERROR(3)
node dist/index.js logncrash send < /dev/null; echo "exit=$?"
# 기대: stderr 에 "비어 있습니다" 또는 "필요합니다", exit=3
#  (stdin redirect /dev/null 은 isTTY=false → 빈 입력 → 0 바이트 → EXIT_PARAM_ERROR)

# 10. 잘못된 level → EXIT_PARAM_ERROR(3) (자격증명 전 차단)
echo "hello" | node dist/index.js logncrash send --level BOGUS; echo "exit=$?"
# 기대: stderr 에 "DEBUG/INFO/WARN/ERROR/FATAL", exit=3

# (11~13 결정 docs grep 은 제거 — adr.md/CLAUDE.md 는 team-lead 가 docs-first 로 반영, docs-verifier 가 검증)

# 14. spinner-before-validation 회귀 없음 (1-2) — resolveBody/검증이 startSpinner 보다 앞
awk '/\.action\(async/,/^  \}\)\;/' src/commands/logncrash/send.ts | grep -nE "(startSpinner|resolveBody\(|MAX_LOG_BYTES)" | head -4
# 기대: resolveBody/한도 검증이 startSpinner 보다 앞 줄번호
```

성공 기준 9/10 은 입력·레벨 검증이 자격증명·네트워크 호출 전에 일어나므로 실제 API 를 호출하지 않는다.
실제 로그 전송(appkey 필요)은 phase-02 후 사용자가 수동 확인한다 (아래 phase-02 수동 확인).
