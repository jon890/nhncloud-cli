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
- 응답: `header.{ isSuccessful, resultCode(숫자), resultMessage }` — 기존 `unwrap` 이 `isSuccessful` 로만 판정하므로 숫자 resultCode 를 그대로 수용한다 ([[adr-006]])

## ADR 동반 — ADR-014

이 task 는 **검색과 별도 collector host + appkey-only 인증(secret 불요)** 라는 직관에 반하는 동작을 도입하므로 ADR 을 동반한다.

> ADR 번호 주의: 현재 `docs/adr.md` 최대 ADR-012, 단 010 계열 task 가 ADR-013 을 예약했으므로 **이 task 는 ADR-014** 를 쓴다.

`docs/adr.md` 맨 끝(ADR-012 다음)에 아래 ADR-014 초안을 추가한다:

```markdown
<a id="adr-014"></a>

## ADR-014: Log & Crash collector — 검색과 별도 host + appkey-only 인증(secret 불요)

- **결정**: 로그 전송(`logncrash send`)은 검색과 다른 collector host 와 인증 모델을 쓴다.
  - host: `POST https://api-logncrash.nhncloudservice.com/v2/log` (검색의 `api-lncs-search` 와 별도)
  - 인증: 헤더 인증 없음 — body 의 `projectName` 필드에 appkey 를 넣어 프로젝트를 식별한다 (검색의 `X-LNCS-SECRET` 와 다른 모델, secret 불요)
  - `endpoints.ts` 의 `ENDPOINTS` 맵에 `logncrash-collector` 키를 추가해 검색(`logncrash`)과 분리한다.
- **맥락**: Log & Crash 는 검색(read)과 수집(write)의 host·인증이 서로 다르다.
  - 검색은 secret 기반 헤더 인증(`X-LNCS-SECRET`), 수집은 appkey 만으로 식별(secret 불요).
  - 두 동작을 같은 host·인증으로 가정하면 전송이 401 또는 404 로 실패한다.
- **대안 기각**:
  - 검색 host 재사용 — 수집 엔드포인트가 없어 404.
  - `X-LNCS-SECRET` 헤더 전송 — 수집은 헤더 인증을 받지 않으며 secret 을 요구하지 않는다.
  - endpoints 맵 키 공유(`logncrash` 하나) — read/write host 가 달라 한 키로 둘을 못 가린다. 별 키(`logncrash-collector`)로 분리.
- **트레이드오프**: 한 서비스(logncrash)가 endpoints 맵에서 키 2개를 갖는다. host 가 실제로 다르므로 분리가 정직하다.
```

`CLAUDE.md` 의 "상황별 ADR 필수 참조" 표에 행을 추가한다:

```markdown
| Log & Crash 로그 전송 (collector host·appkey-only 인증) | ADR-014 |
```

## 변경 파일 (8개)

1. `src/api/endpoints.ts` — `ENDPOINTS` 맵에 `logncrash-collector` 키 추가
2. `src/services/logncrash/types.ts` — `LogSendParams` 추가
3. `src/services/logncrash/client.ts` — `send()` 메서드 추가
4. `src/commands/logncrash/send.ts` — 신규 명령
5. `src/index.ts` — `logncrashCommand.addCommand(sendCommand)`
6. `docs/adr.md` — ADR-014 초안 추가
7. `CLAUDE.md` — 명령 카운트(10→11) + 인증 모델 표(collector 행) + ADR 참조 표(ADR-014 행)
8. `docs/flow.md` + `docs/code-architecture.md` — logncrash 흐름에 send / client send + endpoints collector + ADR-014 역참조

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

### 6. `docs/adr.md`

위 "ADR 동반 — ADR-014" 의 초안 블록을 파일 맨 끝(ADR-012 다음)에 추가.

### 7. `CLAUDE.md` (내부 docs — 이 phase 안에서 갱신)

- "지원 명령 (10개)" → "지원 명령 (11개)" 로 카운트 갱신, `logncrash send` 항목 추가:
  ```markdown
  - `logncrash send` — 로그를 Log & Crash 로 전송 (검색의 대칭 쓰기, collector host + appkey-only 인증·ADR-014). 본문은 `--body`/`--file`/stdin, 단일 로그 8MB 한도.
  ```
- "상황별 ADR 필수 참조" 표에 행 추가:
  ```markdown
  | Log & Crash 로그 전송 (collector host·appkey-only 인증) | ADR-014 |
  ```
- "NHN Cloud 인증 모델" 표에 collector 행 추가:
  ```markdown
  | Log & Crash 전송(collector) | appkey (secret 불요) | 인증 헤더 없음 — body 의 projectName=appkey |
  ```

### 8. `docs/flow.md` + `docs/code-architecture.md`

- `docs/flow.md` — "logncrash search 흐름" 섹션 **다음** 에 "logncrash send 흐름" 절을 추가 (명령 시그니처 표 + 입력 해석 순서 --body>--file>stdin + 8MB 한도 + 에러 경로 표). search 흐름의 표 형식을 따른다. collector host·appkey-only 인증을 [[adr-014]] 로 역참조.
- `docs/code-architecture.md`:
  - `services/logncrash/client.ts` 주석을 `LogncrashClient — search() / send()` 로 갱신.
  - `commands/logncrash/` 트리에 `send.ts` 줄 추가 (`# nhncloud logncrash send`).
  - `api/endpoints.ts` 인접 또는 "인증·엔드포인트 추상화" 절에 collector 키(`logncrash-collector`) 와 [[adr-014]] 역참조 한 줄 추가.

## 성공 기준 (검증 명령 + 기대값)

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

# 5. exit code 리터럴 미사용 (9-1)
grep -nE "NhnCloudCliError\([^,]+,\s*[0-9]+" src/commands/logncrash/send.ts | wc -l
# 기대: 0

# 6. send 가 secret 을 읽지 않음 (ADR-014 / 2-4) — cred.secret / X-LNCS-SECRET 미등장
grep -nE "cred\.secret|X-LNCS-SECRET" src/commands/logncrash/send.ts src/services/logncrash/client.ts | grep -v "search" | grep "send" | wc -l
# 보조 확인: send.ts 에는 cred.secret 참조가 없어야 함
grep -c "cred.secret" src/commands/logncrash/send.ts
# 기대: 0

# 7. appkey 빈문자열 fallback 금지 (2-4) — appkey 에 ?? "" 없음
grep -nE "appkey\s*\?\?\s*\"\"" src/commands/logncrash/send.ts | wc -l
# 기대: 0

# 8. collector 키가 endpoints 에 등록
grep -c "logncrash-collector" src/api/endpoints.ts
# 기대: 2  (맵 정의 1 + 없으면 1; 최소 1 이상 — 정의에 1회면 1)

# 9. 본문 없음(파이프 아님·옵션 없음) → EXIT_PARAM_ERROR(3)
node dist/index.js logncrash send < /dev/null; echo "exit=$?"
# 기대: stderr 에 "비어 있습니다" 또는 "필요합니다", exit=3
#  (stdin redirect /dev/null 은 isTTY=false → 빈 입력 → 0 바이트 → EXIT_PARAM_ERROR)

# 10. 잘못된 level → EXIT_PARAM_ERROR(3) (자격증명 전 차단)
echo "hello" | node dist/index.js logncrash send --level BOGUS; echo "exit=$?"
# 기대: stderr 에 "DEBUG/INFO/WARN/ERROR/FATAL", exit=3

# 11. ADR-014 가 adr.md 에 추가
grep -c "ADR-014" docs/adr.md
# 기대: 1 이상

# 12. CLAUDE.md 명령 카운트 갱신
grep -c "지원 명령 (11개)" CLAUDE.md
# 기대: 1

# 13. CLAUDE.md ADR 참조 표 + 인증 모델 표에 collector 반영
grep -c "ADR-014" CLAUDE.md
# 기대: 1 이상
grep -c "collector" CLAUDE.md
# 기대: 1 이상

# 14. spinner-before-validation 회귀 없음 (1-2) — resolveBody/검증이 startSpinner 보다 앞
awk '/\.action\(async/,/^  \}\)\;/' src/commands/logncrash/send.ts | grep -nE "(startSpinner|resolveBody\(|MAX_LOG_BYTES)" | head -4
# 기대: resolveBody/한도 검증이 startSpinner 보다 앞 줄번호
```

성공 기준 9/10 은 입력·레벨 검증이 자격증명·네트워크 호출 전에 일어나므로 실제 API 를 호출하지 않는다.
실제 로그 전송(appkey 필요)은 phase-02 후 사용자가 수동 확인한다 (아래 phase-02 수동 확인).
