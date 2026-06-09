# Phase 01 — 코드: logncrash export 명령 (scroll 기반 대량 추출)

## 목표

`nhncloud logncrash export` 로 검색 결과 전체를 파일로 추출한다.

- scroll 시작: `POST /api/v2/search/scroll/{appkey}` (body 는 search 와 동일: `query`/`from`/`to`/`pageSize`)
- scroll 계속: `POST /api/v2/search/scroll/{appkey}/{scrollKey}` (body 불필요)
- scrollKey 가 만료(유효 1분) 전이면 `data` 가 빌 때까지 계속 호출해 전체(최대 10만 건)를 순회한다.
- 결과를 `--output <file>` 파일로 쓴다. 기본 JSON Lines(`.jsonl` — 한 줄당 한 로그), `--format json` 이면 JSON 배열.
- 진행 상황(현재까지 수집 건수 / totalItems)은 **stderr** 로만 출력(데이터는 파일, stdout 은 비움).

### search 와 별도 명령으로 두는 근거 (1줄)

search 는 한 페이지를 stdout 으로 보여주는 단발 조회이고, export 는 scroll 루프로 전체를 파일로 내보내는 작업이라 입력(pageSize·output·format)·출력 경로·실패 모드가 달라 `search --export` 옵션으로 흡수하면 한 명령에 두 성격이 섞인다 — 별도 `export` 명령으로 둔다.

### 인증·endpoint (기존 재사용 — ADR 불필요)

- host: `endpointFor("logncrash")` → `api-lncs-search.nhncloudservice.com` (search 와 동일).
- 인증: `X-LNCS-SECRET: <secret>` (search 와 동일).
- 봉투: `unwrap(NhnEnvelope<T>)` 재사용 (resultCode 숫자, `isSuccessful` 로만 판정 — ADR-006).
- 신규 인증/좌표/도메인이 없으므로 ADR 신설 불필요.

## 변경 파일 (5개)

1. `src/services/logncrash/types.ts` — `ScrollStartParams` / `ScrollResult` 추가
2. `src/services/logncrash/client.ts` — `scrollStart()` / `scrollNext()` 메서드 추가
3. `src/commands/logncrash/export.ts` — 신규 명령 (시간범위 검증 → 자격증명 → scroll 루프 → 원자적 파일 쓰기)
4. `src/index.ts` — `logncrashCommand.addCommand(exportCommand)`
5. (없음 — endpoints/exit-codes/time 은 그대로 재사용)

## 회피 항목 (code-review-pitfalls 사전 확인)

- **1-2 (scroll 루프 중 spinner/진행표시 + try/catch)**: scroll 루프 전체를 `startSpinner` 직후 try/catch 로 감싸고, 루프 안에서 진행 건수를 stderr 로 갱신하며, catch 에서 `stopSpinner(false)` 후 re-throw — 루프 중 어느 페이지에서 throw 해도 spinner leak 없음.
- **9-1 (exit code 리터럴 금지)**: 모든 throw 는 `EXIT_PARAM_ERROR` / `EXIT_CONFIG_ERROR` / `EXIT_API_ERROR` **상수** 사용 (숫자 리터럴·`/* EXIT_* */` 주석 금지).
- **8-1 (export 파일 원자적 쓰기)**: 최종 파일은 temp 파일(`<output>.<rand>.tmp`)에 쓰고 `rename` 으로 원자적 교체 — 루프 중 중단 시 부분 파일이 최종 경로에 남지 않게 한다.
- **scrollKey 만료 시 명확한 에러**: scrollKey 만료(API 가 `isSuccessful:false` + 만료 메시지, 또는 다음 호출에서 scrollKey 누락)면 `EXIT_API_ERROR` + "scrollKey 가 만료되었습니다(유효 1분). 범위를 좁혀 다시 시도하세요." 안내 — raw 401/500 로 새지 않게 한다.
- **search 시간 범위 제한(90일/31일) 재사용**: `resolveTime` + `assertSearchRange` 를 search.ts 와 동일하게 호출(중복 구현 금지) — export 도 동일 제약을 받는다.
- **2-4 (자격증명 빈문자열 fallback 금지)**: `cred.appkey`/`cred.secret` 미설정 시 `?? ""` 금지 — search.ts 처럼 호출 전 존재 검증 후 `EXIT_CONFIG_ERROR`.
- **2-1 (type 변경 → tsc)**: 새 type 추가 = type 변경 → 성공 기준에 `pnpm tsc --noEmit` 필수 (tsup 은 type-check 우회).

## 작업 상세

### 1. `src/services/logncrash/types.ts`

기존 `LogSearchResult` **뒤** 에 추가:

```ts
/** scroll 시작 요청 body (search 와 동일 필드, pageNumber 는 없음) */
export interface ScrollStartParams {
  query: string;
  from: string;
  to: string;
  /** 한 번의 scroll 응답당 건수 (기본 1000). 전체 순회는 루프가 담당. */
  pageSize?: number;
}

/**
 * scroll 응답 body.
 * - scrollKey: 다음 페이지 요청에 쓰는 키 (유효 1분). data 가 더 없으면 응답에서 빠지거나 빈 값일 수 있다.
 * - totalItems: 전체 매칭 건수 (진행률 표시용).
 * - data: 이번 페이지의 로그 배열. 빈 배열이면 순회 종료.
 */
export interface ScrollResult {
  scrollKey?: string;
  totalItems: number;
  pageSize: number;
  data: Record<string, unknown>[];
}
```

### 2. `src/services/logncrash/client.ts`

(a) import 에 새 type 추가:

```ts
import type { LogSearchParams, LogSearchResult, ScrollStartParams, ScrollResult } from "./types.js";
```

(b) `search()` 메서드 **뒤** 에 두 메서드 추가. scroll URL 은 search 와 같은 `endpointFor("logncrash")` 기반:

```ts
  /**
   * scroll 검색을 시작한다. POST /api/v2/search/scroll/{appkey}.
   * body 는 search 와 동일(query/from/to/pageSize). 응답 scrollKey 로 scrollNext 를 이어 호출한다.
   */
  async scrollStart(params: ScrollStartParams): Promise<ScrollResult> {
    const endpoint = endpointFor("logncrash");
    const url = `${endpoint}/api/v2/search/scroll/${encodeURIComponent(this.appkey)}`;

    try {
      const res = await ky
        .post(url, {
          headers: {
            "X-LNCS-SECRET": this.secret,
            "Content-Type": "application/json",
          },
          json: {
            query: params.query,
            from: params.from,
            to: params.to,
            pageSize: params.pageSize ?? 1000,
          },
        })
        .json<NhnEnvelope<ScrollResult>>();

      return unwrap(res);
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  /**
   * scroll 다음 페이지를 가져온다. POST /api/v2/search/scroll/{appkey}/{scrollKey}.
   * body 는 보내지 않는다(scrollKey 가 좌표). scrollKey 만료 시 API 가 실패 봉투를 주며,
   * unwrap 이 EXIT_API_ERROR 로 변환한다 — 호출부에서 만료 안내 메시지로 감싼다.
   */
  async scrollNext(scrollKey: string): Promise<ScrollResult> {
    const endpoint = endpointFor("logncrash");
    const url = `${endpoint}/api/v2/search/scroll/${encodeURIComponent(this.appkey)}/${encodeURIComponent(scrollKey)}`;

    try {
      const res = await ky
        .post(url, {
          headers: {
            "X-LNCS-SECRET": this.secret,
            "Content-Type": "application/json",
          },
        })
        .json<NhnEnvelope<ScrollResult>>();

      return unwrap(res);
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }
```

> 주의: `scrollNext` 는 body 를 보내지 않는다(docs 명세). search 의 `json:` 블록을 복사해 빈 body 를 넣지 말 것.

### 3. `src/commands/logncrash/export.ts` (신규)

`search.ts` 패턴을 따른다. 검증·자격증명은 spinner 시작 전(fail-fast), scroll 루프 전체는 spinner 내부 try/catch.

```ts
import { Command } from "commander";
import { rename, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { resolveTime, assertSearchRange } from "../../utils/time.js";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR, EXIT_CONFIG_ERROR, EXIT_API_ERROR } from "../../utils/exit-codes.js";
import { resolveProfileName, getServiceCredential } from "../../config/credentials.js";
import { LogncrashClient } from "../../services/logncrash/client.js";
import type { ScrollResult } from "../../services/logncrash/types.js";

interface ExportGlobalOpts {
  query?: string;
  from?: string;
  to?: string;
  output?: string;
  format?: string;
  size?: string;
  profile?: string;
}

const MAX_TOTAL = 100_000; // 안전 상한 (API 최대 10만 건)

export const exportCommand = new Command("export")
  .description("Log & Crash 로그를 scroll 로 전체 추출해 파일로 저장 (대량 추출)")
  .option("--query <lucene>", "Lucene 질의 문자열 (필수)")
  .option("--from <time>", "검색 시작: ISO8601 또는 상대시간 (1h/30m/2d/now) (필수)")
  .option("--to <time>", "검색 끝: ISO8601 또는 상대시간 (필수)")
  .option("--output <file>", "출력 파일 경로 (필수)")
  .option("--format <fmt>", "출력 형식: jsonl(기본, 한 줄당 한 로그) 또는 json(배열)", "jsonl")
  .option("--size <n>", "scroll 페이지 크기 (기본 1000, 최대 1000)", "1000")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<ExportGlobalOpts>();

    // ── 1. 필수 파라미터 검증 (spinner 전) ──
    if (!opts.query) {
      throw new NhnCloudCliError("--query 옵션은 필수입니다. 예: --query 'logType:\"NORMAL\"'", EXIT_PARAM_ERROR);
    }
    if (!opts.from) {
      throw new NhnCloudCliError("--from 옵션은 필수입니다. 예: --from 1h", EXIT_PARAM_ERROR);
    }
    if (!opts.to) {
      throw new NhnCloudCliError("--to 옵션은 필수입니다. 예: --to now", EXIT_PARAM_ERROR);
    }
    if (!opts.output) {
      throw new NhnCloudCliError("--output 옵션은 필수입니다. 예: --output logs.jsonl", EXIT_PARAM_ERROR);
    }

    const format = opts.format ?? "jsonl";
    if (format !== "jsonl" && format !== "json") {
      throw new NhnCloudCliError("--format 은 jsonl 또는 json 이어야 합니다.", EXIT_PARAM_ERROR);
    }

    const size = parseInt(opts.size ?? "1000", 10);
    if (isNaN(size) || size < 1 || size > 1000) {
      throw new NhnCloudCliError("--size 는 1~1000 사이 정수여야 합니다.", EXIT_PARAM_ERROR);
    }

    // ── 2. 시간 정규화 + 범위 검증 (search 와 동일 — 90일/31일 제한 재사용) ──
    const fromIso = resolveTime(opts.from);
    const toIso = resolveTime(opts.to);
    assertSearchRange(fromIso, toIso);

    // ── 3. 자격증명 로드 (?? "" 금지 — 미설정 시 CONFIG_ERROR) ──
    const profileName = await resolveProfileName(opts.profile);
    const cred = await getServiceCredential("logncrash", profileName);
    if (!cred.appkey) {
      throw new NhnCloudCliError(
        `profile "${profileName}" 의 logncrash 자격증명에 appkey 가 없습니다.\ncredentials.json 에 "appkey": "<appkey>" 를 추가하세요.`,
        EXIT_CONFIG_ERROR,
      );
    }
    if (!cred.secret) {
      throw new NhnCloudCliError(
        `profile "${profileName}" 의 logncrash 자격증명에 secret 이 없습니다.\ncredentials.json 에 "secret": "<secret>" 를 추가하세요.`,
        EXIT_CONFIG_ERROR,
      );
    }
    const client = new LogncrashClient(cred.appkey, cred.secret);

    // ── 4. scroll 루프 (spinner 내부 try/catch — 루프 중 throw 해도 leak 없음) ──
    startSpinner("로그 추출 중...");

    const collected: Record<string, unknown>[] = [];
    try {
      let res: ScrollResult = await client.scrollStart({ query: opts.query, from: fromIso, to: toIso, pageSize: size });
      collected.push(...res.data);
      const total = res.totalItems;
      process.stderr.write(`수집 ${collected.length}/${total}\n`);

      // data 가 빌 때까지(또는 상한 도달까지) scrollKey 로 이어 호출.
      while (res.data.length > 0 && res.scrollKey && collected.length < Math.min(total, MAX_TOTAL)) {
        const key = res.scrollKey;
        res = await scrollNextOrExpire(client, key);
        collected.push(...res.data);
        process.stderr.write(`수집 ${collected.length}/${total}\n`);
      }
    } catch (err) {
      stopSpinner(false);
      throw err;
    }

    stopSpinner(true, `${collected.length}건 추출 완료`);

    // ── 5. 원자적 파일 쓰기 (temp + rename — 부분 파일 방지) ──
    const body =
      format === "json"
        ? JSON.stringify(collected, null, 2) + "\n"
        : collected.map((log) => JSON.stringify(log)).join("\n") + (collected.length > 0 ? "\n" : "");

    const tmp = opts.output + "." + randomBytes(4).toString("hex") + ".tmp";
    try {
      await writeFile(tmp, body, { encoding: "utf-8" });
      await rename(tmp, opts.output);
    } catch (err) {
      const reason = (err as NodeJS.ErrnoException).code ?? (err instanceof Error ? err.message : String(err));
      throw new NhnCloudCliError(`출력 파일을 쓸 수 없습니다: ${opts.output} (${reason})`, EXIT_PARAM_ERROR);
    }

    // 진행/완료는 stderr — stdout 은 비워둔다(데이터는 파일).
    process.stderr.write(`${opts.output} 에 ${collected.length}건 저장\n`);
  });

/**
 * scrollNext 를 호출하되 scrollKey 만료(EXIT_API_ERROR)를 명확한 안내로 감싼다.
 * 데이터를 다 받기 전에 1분이 지나 scrollKey 가 무효화되면 여기서 잡힌다.
 */
async function scrollNextOrExpire(client: LogncrashClient, scrollKey: string): Promise<ScrollResult> {
  try {
    return await client.scrollNext(scrollKey);
  } catch (err) {
    if (err instanceof NhnCloudCliError && err.exitCode === EXIT_API_ERROR) {
      throw new NhnCloudCliError(
        "scrollKey 가 만료되었습니다 (유효 1분). 검색 범위를 좁히거나 --size 를 키워 페이지 수를 줄인 뒤 다시 시도하세요.",
        EXIT_API_ERROR,
      );
    }
    throw err;
  }
}
```

> 설계 메모(2-2 확인): `toNhnCloudCliError` 는 HTTP 4xx/5xx 를 `EXIT_API_ERROR`(401/403 은 `EXIT_AUTH_ERROR`)로 매핑한다. scrollKey 만료는 봉투 실패 또는 4xx 로 오므로 `EXIT_API_ERROR` 분기로 잡는 것이 맞다(`EXIT_PARAM_ERROR` 비교는 dead path — 쓰지 말 것). 401/403 은 자격증명 문제이므로 감싸지 않고 그대로 통과시킨다.

### 4. `src/index.ts`

(a) import 추가 (`searchCommand` import 다음 줄):

```ts
import { exportCommand } from "./commands/logncrash/export.js";
```

(b) `logncrashCommand.addCommand(searchCommand);` **다음** 줄에 추가:

```ts
logncrashCommand.addCommand(exportCommand);
```

## 성공 기준 (검증 명령 + 기대값)

```bash
# cwd: <repo root> (또는 plan019 worktree)

# 1. 타입 체크 — type 추가 → 필수 (tsup 은 type-check 우회)
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l
# 기대: 0

# 2. 빌드 성공
pnpm build
# 기대: dist/index.js 생성, exit 0

# 3. export 가 logncrash 하위 명령으로 노출
node dist/index.js logncrash --help 2>&1 | grep -c "export"
# 기대: 1 이상

# 4. export 옵션이 help 에 노출
node dist/index.js logncrash export --help 2>&1 | grep -Ec -- "--query|--from|--to|--output|--format"
# 기대: 5

# 5. exit code 리터럴 미사용 (9-1)
grep -nE "NhnCloudCliError\([^,]+,\s*[0-9]+|process\.exit\([0-9]+\)" src/commands/logncrash/export.ts | wc -l
# 기대: 0

# 6. 자격증명 빈문자열 fallback 없음 (2-4)
grep -nE "\?\?\s*\"\"" src/commands/logncrash/export.ts src/services/logncrash/client.ts | wc -l
# 기대: 0

# 7. 원자적 파일 쓰기 (8-1) — temp + rename 동반
grep -nE "rename\(|randomBytes\(" src/commands/logncrash/export.ts | wc -l
# 기대: 2 이상 (rename 1 + randomBytes 1)

# 8. 시간 범위 검증 재사용 (search 와 동일 helper)
grep -nE "resolveTime|assertSearchRange" src/commands/logncrash/export.ts | wc -l
# 기대: 3 이상 (import + from + to + assert)

# 9. scrollKey 만료 안내 에러 존재
grep -c "scrollKey 가 만료" src/commands/logncrash/export.ts
# 기대: 1

# 10. --query 누락 → EXIT_PARAM_ERROR(3) (자격증명·네트워크 전 차단)
node dist/index.js logncrash export --from 1h --to now --output /tmp/x.jsonl; echo "exit=$?"
# 기대: stderr 에 "--query 옵션은 필수", exit=3

# 11. --output 누락 → EXIT_PARAM_ERROR(3)
node dist/index.js logncrash export --query 'logType:"NORMAL"' --from 1h --to now; echo "exit=$?"
# 기대: stderr 에 "--output 옵션은 필수", exit=3

# 12. 범위 31일 초과 → EXIT_PARAM_ERROR(3) (search 와 동일 제한)
node dist/index.js logncrash export --query a --from 40d --to now --output /tmp/x.jsonl; echo "exit=$?"
# 기대: stderr 에 "검색 범위는 31일 이하", exit=3

# 13. spinner-before-validation 회귀 없음 (1-2) — 검증/자격증명이 startSpinner 보다 앞
awk '/\.action\(async/,/^  \}\)\;/' src/commands/logncrash/export.ts | grep -nE "(startSpinner|assertSearchRange|getServiceCredential)" | head -4
# 기대: assertSearchRange / getServiceCredential 이 startSpinner 보다 앞 줄번호
```

성공 기준 10/11/12 는 검증이 자격증명·네트워크 호출 전에 일어나므로 실제 API 를 호출하지 않는다.
실제 scroll 추출(자격증명 필요)은 phase-02 후 사용자가 수동 확인한다(phase-02 의 수동 확인 절).
