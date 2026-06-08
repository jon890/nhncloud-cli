# Code Review Pitfalls

build-with-teams 의 code-reviewer 가 반복 지적한 코드 패턴. **plan 작성 시점이 아니라 executor 의 코드 작성 시점에 사전 해소** 한다 (common-pitfalls 는 plan 작성 회피, 본 docs 는 코드 작성 회피 — 호출 시점이 다름).

## 호출 시점

| 시점 | 누가 | 어떻게 |
|---|---|---|
| plan 작성 | team-lead | phase 본문에 "회피 항목" 으로 1줄 인용 (executor 가 그 phase 만 보고도 알 수 있도록) |
| executor 코드 작성 시작 직전 | executor | 이 docs 의 해당 카테고리 grep → self-check |
| code-reviewer 검사 | code-reviewer | build-with-teams 7단계 13 항목과 별도로 본 docs 의 모든 항목 grep 게이트 |

## 축적 규칙

- 새 항목 추가 = code-reviewer 가 같은 패턴을 **plan 종료 후 회고 단계에서 발견** 했을 때만. 1회성 단일 사고는 제외 (반복성 확보 후 추가).
- 항목 형식: **증상 / 왜 / 검출 명령 / Self-check**. common-pitfalls 와 동일.
- "왜 이 가드가 필요한지" 1줄 단서 필수 — 미래 AI 가 의도 모르고 우회하지 않도록.
- plan### 사고 사례는 1개로 충분, 복수 나열 금지.
- 카테고리는 4개로 시작, 새 패턴이 어느 카테고리에도 안 들어가면 5번 카테고리 추가.

---

# 1. spinner·UX 순서 회귀

executor 가 헬퍼 추출·재배치 리팩토링 / 신규 명령 작성 시 spinner / validation / cleanup 순서를 의도치 않게 바꾸는 사고.

## 1-1. validation 전에 spinner 시작 (param 에러 시 spinner leak)

**증상**: `startSpinner(...)` 가 `resolve*Input(...)` / param 검증 **앞** 에 있음. 파라미터 오류 발생 시 spinner 가 떠 있는 채 stderr 에 에러 메시지가 흘러 ora 애니메이션 문자와 섞임.
**Good**: 헬퍼 호출 (`resolveCommentFileInput` / `resolvePostInput` 등) 을 spinner 보다 앞에 두고, 같은 명령군 내 일관성 유지.

```bash
# 같은 명령군 내 spinner ↔ 헬퍼 순서 일관성 검증
for f in src/commands/<scope>/*.ts; do
  echo "--- $f ---"
  awk '/\.action\(async/,/^  \}\)\;/' "$f" | \
    grep -nE "(startSpinner|resolve[A-Z][A-Za-z]*Input)" | head -5
done
```

**Why**: plan025 PR #47 — `comment/file/list.ts` 만 4 명령 중 spinner 가 헬퍼 앞에 있어 회귀.

## 1-2. spinner 시작 후 try/catch 없이 API 호출 → 에러 시 spinner leak

**증상**: `startSpinner` 직후 외부 API 호출 (`resolvePostInput`, `client.getXxx` 등) 을 평이하게 호출. 호출 중 예외 발생 시 `stopSpinner` 가 절대 호출 안 됨 → spinner 가 화면에 정지 상태로 잔존.
**Good**: spinner 가 떠 있는 동안의 모든 외부 호출을 try/catch 로 감싸고 catch 에서 `stopSpinner(false)` 명시 호출 후 re-throw.

```ts
startSpinner("...");
try {
  const result = await client.fetchSomething(...);
  stopSpinner(true, "...");
  // 이후 처리
} catch (e) {
  stopSpinner(false);
  throw e;
}
```

**검출**: `grep -A 20 "startSpinner" src/commands/` 결과에서 `try\s*\{` 가 같은 블록 내 없으면 의심.
**Why**: PR #46 — `comment/get.ts` 의 `startSpinner` 후 `resolvePostInput` / `getPostComment` 가 try 없이 호출 → 에러 경로 spinner 잔존. 1-1 과 다른 패턴 (1-1 은 호출 위치, 1-2 는 cleanup 누락).

**기존 spinner 블록에 새 헬퍼 호출 추가 / 위치 이동 시 (재발 패턴)**: spinner 블록 내부에 새 헬퍼 (`readBodyInput`, `resolveTemplate`, `getProjectTemplateDetail` 등) 호출을 추가하거나 spinner 전에 있던 호출을 spinner 후로 이동하는 경우, 그 새 위치도 동일하게 try/catch 보호가 필요하다. spinner 전에 있을 때는 안전했던 호출 (예: `readBodyInput` 의 파일 부재 throw) 이 spinner 후 위치로 이동하면 leak 경로가 생긴다.

```ts
// PR #64 — readBodyInput 을 template body fallback 로직 위해 spinner 후로 이동.
// 이동 자체는 OK 지만 try/catch 보호 누락 → spinner leak.
startSpinner("...");
const projectId = await resolveProject(client, project);
// ... template fetch (이미 try/catch 보호됨) ...
let bodyContent: string;
try {
  bodyContent = await readBodyInput(opts);  // ← spinner 후 위치로 이동했으면 try/catch 필수
} catch (e) {
  stopSpinner(false);
  throw e;
}
```

**Self-check (plan / code review)**: 기존 spinner 블록 내부에 새 호출을 추가하거나 spinner 외부 호출을 내부로 이동하는 diff 가 있으면, 그 호출의 throw 경로를 따로 grep 으로 확인 (`grep -nE "throw new (NhnCloudCliError|Error)" {호출 파일}`). 1건이라도 throw 가능하면 try/catch 보호 필요.

**다단계 spinner 전환 시 직전 spinner stop 누락 (재발 패턴)**: 한 명령이 spinner 를 두 단계로 쓰는 경우 (예: create `--wait` 의 "생성 중..." → "ACTIVE 대기 중...") 두 번째 `startSpinner` 전에 첫 spinner 를 `stopSpinner(true)` 로 닫아야 한다. 안 닫으면 ora 인스턴스 2개가 동시에 stderr 에 프레임을 써서 출력이 깨진다.

```ts
startSpinner("인스턴스 생성 중...");
try { server = await client.create(...); } catch (e) { stopSpinner(false); throw e; }
stopSpinner(true);          // ← 두 번째 spinner 전에 첫 spinner 닫기 (누락 시 leak)
if (opts.wait) {
  startSpinner("ACTIVE 대기 중...");
  try { ... } catch (e) { stopSpinner(false); throw e; }
  stopSpinner(true);
}
```

**Why**: PR #6 (plan004) 🟡 — create `--wait` 가 첫 spinner stop 없이 두 번째 spinner 시작 → 고아 spinner 2개. `--wait`·폴링 같은 다단계 진행 표시 명령마다 재발 가능.

## 1-3. resolver 를 body 수집·editor open 보다 뒤에 호출 (resolver-before-editor)

**증상**: `resolveWikiPageInput` / `resolvePostInput` 같은 resolver 호출이 `readBodyInputOrNull` / `openInEditor` 보다 뒤에 있음.
resolver 실패 시 사용자가 이미 에디터에 입력한 내용이 유실됨.

**Good**: resolver 를 항상 `readBodyInputOrNull` / `openInEditor` 보다 먼저 호출.
`delete.ts` / `edit.ts` 패턴이 reference.

**검출**:
```bash
grep -B 5 "openInEditor\|readBodyInputOrNull" src/commands/ | grep -B 5 -A 1 "resolve[A-Z][A-Za-z]*Input"
# resolver 호출이 뒤에 있으면 의심
```

**Why**: PR #74 (plan036) 와 PR #64 (plan031) 2회 반복.
add 명령군에서 특히 발생.

**Self-check**: add / edit 명령 작성 시 resolver 호출 순서가 body 수집보다 앞인지 grep 으로 확인했는가?

---

# 2. 에러 처리 일관성

## 2-1. `await fn()` 에서 `fn(): Promise<never>` 라도 catch 블록이 never-path 로 추론 안 됨 (TS2366)

**증상**: 헬퍼 `async function bail(...): Promise<never>` 를 catch 블록에서 `await bail(e)` 만 호출하고 끝냄 (`return` / `throw` 없음). bare `await Promise<never>` 는 런타임에는 throw 로 unwind 되지만 TypeScript control-flow 분석은 catch 블록을 never-returning 으로 못 잡고 `TS2366: Function lacks ending return statement and return type does not include 'undefined'` 발생.

**Good**: `return await bail(e)` 로 control flow 종결을 명시. async 시그니처를 유지하면서 호출자 패턴만 바꾸는 리팩토링에서 특히 주의.

```ts
// BAD — TS2366
} catch (e) {
  await toNhnCloudCliError(e);   // bare await of Promise<never>
}

// GOOD
} catch (e) {
  return await toNhnCloudCliError(e);
}
```

**검출**:
```bash
# tsc 직접 검증 (tsup/esbuild 는 type-check 스킵 — build/test 통과해도 TS2366 누수 가능)
pnpm tsc --noEmit 2>&1 | grep -c "TS2366"
# 기대: 0

# bare await 잔존 grep
grep -nE "^\s+await\s+\w+\(.*\);?\s*$" src/api/client.ts | grep -v "return"
```

**Self-check**: catch 블록의 헬퍼 호출 패턴을 바꾸는 리팩토링이라면 빌드만 보지 말고 `pnpm tsc --noEmit` 을 반드시 실행 — tsup/vitest 가 type-check 를 우회하므로 빌드/테스트 PASS 가 type 안전성을 의미하지 않는다.

**Why**: plan026 PR #48 — `return toNhnCloudCliError(e)` → `await toNhnCloudCliError(e)` 일괄 치환 시 34곳 모두 TS2366. tsup 빌드 + 91 tests 통과로 1차 검증을 빠져나갔고, code-reviewer 가 `tsc --noEmit` 으로 잡음. async 시그니처를 유지한 호출자 리팩토링은 type-check 없이는 안전하지 않다.

## 2-2. catch 의 `err.exitCode` 분기 시 `toNhnCloudCliError` 의 실제 매핑 미확인

**증상**: resolver / command 에서 `catch (err)` 후 `err instanceof NhnCloudCliError && err.exitCode === EXIT_PARAM_ERROR` 같은 분기로 "특정 에러만 변환 + 나머지 re-throw" 를 시도. 하지만 `toNhnCloudCliError` (src/api/client.ts) 는 HTTP 에러에 `EXIT_AUTH_ERROR` (401/403) 또는 `EXIT_API_ERROR` (그 외, 404 포함) 만 부여. `EXIT_PARAM_ERROR` (3) 는 CLI 자체 입력 검증 경로에서만 발생 — API 호출 경로의 catch 에서는 절대 매칭 안 됨. 결과: 분기 조건이 항상 false → "특정 에러 변환" 코드가 dead path 가 되고, 사용자는 의도된 친절 메시지 대신 raw 에러를 봄.

**Good**: catch 안에서 HTTP 에러를 분류하려면 `EXIT_API_ERROR` (404 포함 4xx/5xx) 와 `EXIT_AUTH_ERROR` (401/403) 중에서 선택. status code 까지 구분하려면 `err.message` 의 `(404)` 패턴이나 별도 metadata 가 필요 — 단순 exitCode 비교로는 404 / 5xx / timeout 을 구별 못함을 인지하고 설계.

```ts
// BAD — EXIT_PARAM_ERROR 는 API 경로에서 절대 발생 안 함 → 분기 항상 false
try { await client.getMemberDetail(input); } catch (err) {
  if (err instanceof NhnCloudCliError && err.exitCode === EXIT_PARAM_ERROR) {
    throw new NhnCloudCliError("찾을 수 없습니다", EXIT_PARAM_ERROR);
  }
  throw err;
}

// GOOD — toNhnCloudCliError 의 실제 매핑 (EXIT_API_ERROR for 404) 사용
try { await client.getMemberDetail(input); } catch (err) {
  if (err instanceof NhnCloudCliError && err.exitCode === EXIT_API_ERROR) {
    throw new NhnCloudCliError("찾을 수 없습니다", EXIT_PARAM_ERROR);
  }
  throw err;   // EXIT_AUTH_ERROR / 네트워크 에러는 분류 보존
}
```

**검출**: catch 안의 exitCode 검사 패턴 + `EXIT_PARAM_ERROR` 사용 여부.
```bash
grep -rnE "exitCode\s*===\s*EXIT_PARAM_ERROR" src/resolvers/ src/commands/ src/api/
# 결과 있으면 → API 경로의 catch 인지 확인. API 경로면 → EXIT_API_ERROR 로 교체
```

**Self-check**: catch 안에서 exitCode 분기를 쓰는 코드를 작성/리뷰할 때, `src/api/client.ts` 의 `toNhnCloudCliError` 가 그 에러 케이스에 어떤 exitCode 를 *실제로* 부여하는지 grep 으로 확인했는가? mock 으로 짠 테스트가 그 exitCode 를 mirror 하는가?

**Why**: PR #63 (plan029) — `resolveMember` 의 catch 가 `EXIT_PARAM_ERROR` 검사. 테스트도 같은 값으로 reject 해서 7/7 PASS 였지만 실제 production path 의 `toNhnCloudCliError` 는 `EXIT_API_ERROR` 부여 → 분기 dead. code-reviewer 가 catch 케이스 ↔ toNhnCloudCliError 매핑 대조해서 잡음. 다른 resolver/command 에서 같은 패턴 추가 시 또 발생 가능.

## 2-3. 테스트 mock 의 reject value 가 production path 를 mirror 안 함

**증상**: `vi.fn().mockRejectedValue(new NhnCloudCliError("...", EXIT_PARAM_ERROR))` 같이 mock 을 만들 때, 실제 production path 의 에러 객체 (`toNhnCloudCliError` 가 부여하는 exitCode / 메시지 prefix) 와 다른 값을 사용. 테스트는 통과 (mock 이 그 값을 reject 하니까) 하지만 실제 코드 경로는 다른 exitCode 를 받음 → 분기/메시지 변환 코드가 실제로는 동작 안 함. 테스트가 자기 자신만 검증하고 production 검증 못함.

**Good**: API client 함수의 throw path 가 `toNhnCloudCliError` 를 통과한다면 mock 도 같은 함수가 만들 객체를 흉내내야 함:
- HTTP 4xx (404 포함) → `new NhnCloudCliError("API 호출 실패: <메시지>", EXIT_API_ERROR)`
- HTTP 401/403 → `new NhnCloudCliError(..., EXIT_AUTH_ERROR)`
- 네트워크 / timeout → `new Error("ECONNREFUSED")` 등 raw Error (NhnCloudCliError 아님 — toNhnCloudCliError 가 unwrap 안 함)

**검출**:
```bash
grep -rnE "mockRejectedValue\(new NhnCloudCliError" src/ test/
# 결과의 EXIT_* 값이 toNhnCloudCliError 매핑 (EXIT_API_ERROR / EXIT_AUTH_ERROR) 인지 확인
```

**Self-check**: mock 의 reject value 를 작성할 때, "이 mock 이 흉내내려는 production 호출 경로에서 실제로 어떤 형태의 Error 가 던져지는가?" 를 코드로 직접 확인했는가 — 아니면 "에러면 그냥 Error 든 NhnCloudCliError 든 통과하니까" 로 임시값 넣었는가?

**Why**: PR #63 (plan029) — 7/7 테스트 PASS 였지만 mock 이 production 동작 mirror 안 함. mock 만 보면 분기 코드 검증된 것처럼 보이지만 실제 path 는 dead. code-reviewer 가 production path (`toNhnCloudCliError`) 와 mock 의 exitCode 대조로 잡음. 2-2 와 짝 — 같은 사고가 코드와 테스트 양쪽에서 동시 발생.

## 2-4. optional 자격증명 필드 빈문자열 fallback (`?? ""`) → 인증 실패를 설정 오류로 진단 못함

**증상**: `ServiceCredential.secret?` 처럼 optional 인 자격증명 필드를 client 에 넘길 때 `cred.secret ?? ""` 로 빈문자열 fallback.
secret 미설정 시 빈 인증 헤더 (`X-LNCS-SECRET: `) 로 API 호출 → 401 → 사용자는 "API 호출 실패 (401)" 만 보고 *설정이 빠진 것* 인지 *키가 틀린 것* 인지 모름.

**Good**: client 생성 전에 필수 인증 필드 존재를 검증하고 없으면 `EXIT_CONFIG_ERROR` + 설정 안내 메시지.

```ts
// BAD — 빈문자열 fallback → 401 로만 드러남
const client = new LogncrashClient(cred.appkey, cred.secret ?? "");

// GOOD — 없으면 EXIT_CONFIG_ERROR 로 즉시 진단
if (!cred.secret) {
  throw new NhnCloudCliError(
    `profile "${profileName}" 의 logncrash 자격증명에 secret 이 없습니다.`,
    EXIT_CONFIG_ERROR,
  );
}
const client = new LogncrashClient(cred.appkey, cred.secret);
```

**검출**:
```bash
grep -rnE "\?\?\s*\"\"" src/commands/ src/services/   # 자격증명/필수값 빈문자열 fallback 의심
```

**Self-check**: client 에 넘기는 자격증명 필드가 type 상 optional 인데 `?? ""` 로 채우고 있는가? 그러면 미설정 시 인증 실패(AUTH)로만 드러나고 설정 오류(CONFIG)로 진단 못함 — 호출 전 존재 검증으로 교체.

**Why**: PR #1 (plan001) — `cred.secret ?? ""` 가 secret 미설정 시 빈 헤더로 401 유발. code-reviewer 가 잡음. 서비스별 자격증명 필드가 optional 인 한 (Deploy token 등) 새 service client 마다 재발 가능.

# 3. 매직 넘버·문자열 (예약)

# 4. CLI 도메인 규칙 회귀

## 4-1. interactive 경고 vs 실제 동작 mismatch

**증상**: interactive 분기에서 "옵션 X 는 무시됩니다" 경고를 추가했으나 실제로 옵션 resolve 로직이 interactive 경로에도 적용됨.
경고 텍스트와 코드 경로가 정반대.

**Good**: 경고 텍스트 추가 시 해당 옵션의 resolve/merge 로직이 `nonInteractive` 조건 안에만 있는지 grep 으로 확인.

**검출**:
```bash
grep -B 3 -A 10 "무시됩니다\|ignored" src/commands/
# 같은 옵션 grep 으로 nonInteractive 조건 외에서 사용되는지 확인
```

**Why**: PR #55 (plan028) 🔴 — cc/to 옵션 경고와 실제 동작 불일치.

**Self-check**: 경고 문구와 실제 코드 경로가 일치하는가?
경고 옵션 이름이 `nonInteractive` 조건 안에만 있는지 grep 으로 확인했는가?

## 4-2. 같은 enum/목록이 두 곳에 정의 → 동기화 누락

**증상**: 동일한 허용값 집합 (region·flavor·status 등) 이 두 파일에 따로 정의되고 한쪽만 갱신됨.
예: configure 대화형 region select choices = `kr1/kr2/jp1/us1` 인데 endpoints 의 host 맵 = `kr1/kr2/kr3/jp1`.
사용자가 한쪽에만 있는 값 (us1) 을 고르면 다른 경로에서 `EXIT_PARAM_ERROR`, 한쪽에만 있는 값 (kr3) 은 선택 불가.

**Good**: 허용값은 단일 소스 (예: endpoint host 맵) 에서 파생하거나, 두 목록이 정확히 같은지 grep 으로 대조.

**검출**:
```bash
# 두 정의처의 토큰 집합을 각각 추출해 비교
grep -oE "kr[0-9]|jp[0-9]|us[0-9]" src/commands/configure.ts | sort -u
grep -oE "kr[0-9]|jp[0-9]|us[0-9]" src/api/endpoints.ts | sort -u   # 두 결과가 동일해야 함
```

**Why**: PR #6 (plan004) 🟠 — configure region choices 가 INSTANCE_HOST 맵과 불일치 (us1 잉여·kr3 누락). region·flavor 등 enum 을 추가하는 작업마다 재발 가능.

**Self-check**: 새 허용값 집합을 추가/수정했는가? 같은 집합을 참조하는 다른 정의처가 있고, 두 곳이 정확히 일치하는가?

## 4-3. `requiredOption` 뒤 action 내부 수동 존재 검증 (dead code)

**증상**: Commander `requiredOption("--name")` 으로 이미 진입 전 강제되는데, action handler 안에 `if (!opts.name) throw ...` 수동 검증을 또 둠.
절대 true 가 될 수 없는 dead code.

**Good**: `requiredOption` 으로 보장되는 필드는 action 내부 재검증 제거 + 필요 시 `opts.name!` non-null assertion (이유 주석).
`requiredOption` 으로 강제 안 되는 검증 (예: 반복 옵션의 `length === 0`) 만 수동으로 남긴다.

**검출**:
```bash
# requiredOption 으로 선언된 옵션이 action 내부에서 if(!opts.X) 로 다시 검증되는지
grep -nE "requiredOption\(\"--" src/commands/
grep -nE "if \(!opts\.[a-zA-Z]+\)" src/commands/   # 위 requiredOption 목록과 겹치면 dead code
```

**Why**: PR #6 (plan004) 🟡 — create.ts 가 `--name/--flavor/--image` requiredOption 뒤에 동일 필드를 수동 검증. nonInteractive dead code (common-pitfalls 1-14) 의 옵션 검증 변형.

**Self-check**: action 내부 `if(!opts.X)` 의 X 가 이미 `requiredOption` 인가? 그렇다면 제거했는가?

# 5. 타입 안전성

## 5-1. Map.has → get()! non-null assertion

**증상**: `map.has(k) ? map.get(k)!.use() : map.set(k, init)` 패턴에서 `!` 사용.
TypeScript 는 `has` 후 `get` 을 narrowing 안 함 → 런타임 undefined 가능성 잔존.

**Good**: `let v = map.get(k); if (!v) { v = init; map.set(k, v); } v.use()` 로 변환.

**검출**:
```bash
grep -nE "\.get\([^)]+\)!" src/
```

**Why**: PR #68 (plan033) — Map.has 후 get()! 단언.

**Self-check**: Map.get() 결과에 `!` 단언이 있는가?
있으면 위 패턴으로 교체.

## 5-2. `as unknown as T` 이중 단언

**증상**: `expr as unknown as T` 이중 단언이 등장.
두 타입 사이의 구조적 관계가 불명확하다는 신호 — 타입 설계 재검토 필요.

**Good**: `src/api/types.ts` 에 `extends` / 타입 별칭으로 두 타입의 관계를 명시.
이중 단언은 타입 설계 재검토 신호로 처리.

**검출**:
```bash
grep -nE "as unknown as " src/
```

**Why**: PR #64 (plan031) — 두 타입 관계를 이중 단언으로 우회.

**Self-check**: `as unknown as T` 가 등장하면 타입 구조적 관계를 types.ts 에 명시했는가?

## 5-3. optional 필드를 `as T` 로 캐스트해 undefined 묵시 반환

**증상**: 봉투/응답 타입의 `body?: T` 처럼 optional 필드를 `return res.body as T` 로 반환.
성공 응답인데 body 가 없는 edge case 가 오면 `undefined` 를 `T` 로 조용히 반환 → 호출부에서 `.totalItems` 등 접근 시 런타임 TypeError.
`as T` 가 컴파일 타임 검사를 무력화해 tsc 도 못 잡음.

**Good**: 캐스트 대신 undefined guard 후 narrow 된 값을 반환.

```ts
// BAD — body 가 undefined 여도 T 로 통과
export function unwrap<T>(res: NhnEnvelope<T>): T {
  if (!res.header.isSuccessful) throw ...;
  return res.body as T;
}

// GOOD — undefined 를 명시적으로 거름
export function unwrap<T>(res: NhnEnvelope<T>): T {
  if (!res.header.isSuccessful) throw ...;
  if (res.body === undefined) {
    throw new NhnCloudCliError("API 응답에 body 가 없습니다.", EXIT_API_ERROR);
  }
  return res.body;
}
```

**검출**:
```bash
grep -rnE "\.body as |return [a-zA-Z.]+ as [A-Z]" src/api/   # optional 필드 as 캐스트 반환 의심
```

**Self-check**: optional (`?:`) 필드를 `as T` 로 반환하는 곳이 있는가? 그러면 undefined 가 T 로 누수 — guard 로 교체.

**Why**: PR #1 (plan001) — `unwrap` 의 `res.body as T` 가 optional body 의 undefined 를 묵시 반환. envelope 는 모든 service client 가 공유하므로 한 번의 누수가 전 서비스에 전파.

## 5-4. `unknown[]` 배열 요소를 `Object.entries` 전에 타입 가드 없이 `as Record` 캐스트

**증상**: 동적 API 응답 body 를 `Record<string, unknown>` 으로 받아 `Array.isArray` 분기 후 각 요소를 `item as Record<string, unknown>` 캐스트해 `Object.entries(item)` 호출.
배열 요소의 실제 타입은 `unknown` 이라, API 가 primitive (숫자·문자열) 배열을 반환하면 `Object.entries(<primitive>)` 가 빈 객체를 주거나 의도 외 동작 → 표 출력 깨짐/런타임 오류.
`as` 캐스트가 tsc 를 통과시켜 정적 검사로 못 잡음.

**Good**: 요소가 object 가 아닐 때를 먼저 가드.

```ts
// BAD — item 이 primitive 면 Object.entries 오동작
rows: list.map((item) => Object.entries(item as Record<string, unknown>)...)

// GOOD — primitive 가드 후 narrow
rows: list.flatMap((item) => {
  if (typeof item !== "object" || item === null) return [[String(item), ""]];
  return Object.entries(item as Record<string, unknown>).map(([k, v]) => [`${k}: ${String(v ?? "")}`, ""]);
}),
```

**검출**:
```bash
grep -rnE "as Record<string, unknown>\)" src/commands/   # 배열 요소 캐스트 의심
# 그 위치 위에 typeof !== "object" 가드가 있는지 확인
```

**Self-check**: 동적 API 응답 배열을 순회하며 `Object.entries(item)` 하는 곳에 primitive 가드가 있는가?

**Why**: plan002 (PR #2) code-reviewer FIX_NEEDED — `deploy artifacts` 가 응답 배열 요소를 가드 없이 `Object.entries` 처리. Deploy API 가 primitive 배열을 주면 런타임 TypeError.

# 6. API/HTTP 패턴

## 6-1. redirect manual + status code 분기 누락

**증상**: `redirect: "manual"` + `throwHttpErrors: false` 패턴에서 `location` 헤더만 체크하고 `if (response.status === 307)` 분기가 없음.
200 OK 직접 응답 시 에러 경로로 진입.

**Good**: `if (response.status === 307)` 분기 명시.
redirect 응답과 직접 응답을 status code 로 구분.

**검출**:
```bash
grep -nE "redirect.*manual|throwHttpErrors.*false" src/api/client.ts
# 그 위치에서 status === 307 분기 존재 확인
```

**Why**: PR #72 (plan035) ADR-029 / ADR-015 연관.

**Self-check**: `redirect: "manual"` 패턴이 있으면 status 분기도 함께 있는가?

## 7-1. 문서 자리수/범위 표기와 코드 regex 불일치

**패턴**: planning docs 선반영 시 "19자리 numeric" 같이 구체 자릿수를 적었는데 실제 코드 regex 는 `/^\d{15,}$/` (15+자리).
executor 가 docs 텍스트를 그대로 README / SKILL.md 에 복사하면서 불일치 전파.

**검출**:
```bash
# regex 의 자릿수 제한과 docs 표현이 일치하는지 확인
grep -rn "자리" README.md skills/ docs/ | grep -i numeric
# 코드의 regex 와 대조
grep -rn "_RE = " src/resolvers/
```

**Self-check**: 새 regex 상수 추가 시 docs 전체에서 해당 자릿수 표현을 grep 하여 일관성 확인.

**Why**: plan039 code-reviewer FIX_NEEDED + docs-verifier UPDATE_NEEDED — "19자리" 가 README, SKILL.md, flow.md 3곳에 전파. regex 는 15+자리.

## 7-2. 조기 반환 (early return) 에서 출력 모드 분기 누락

**패턴**: `download-all` 류 명령에서 "파일 0개" 조기 반환 시 `--json` 분기만 추가하고 `--quiet` 분기를 누락.
결과: `--quiet` 사용 시 "첨부파일이 없습니다." plain text 가 stdout 에 출력 → 자동화 스크립트 parse 깨짐.

**검출**:
```bash
# early return 분기에서 json 만 체크하고 quiet 누락 탐지
grep -B2 -A5 "return;" src/commands/**/file/*.ts src/commands/**/page-file/*.ts | grep -A5 "globalOpts.json" | grep -v "globalOpts.quiet"
```

**Self-check**: 조기 반환 블록에 `globalOpts.json` 이 있으면 `globalOpts.quiet` 도 반드시 동반 확인.

**Why**: plan040 code-reviewer FIX_NEEDED — download-all 빈 파일 시 `--quiet` 에도 plain text 출력. 양 명령군 동일 사고.

# 8. 캐시 안전성

## 8-1. 캐시 파일 비원자 쓰기 (`writeFile` 직접 호출)

**증상**: `~/.nhncloud/cache/` 등 캐시 파일을 `writeFile(path, data)` 로 직접 기록.
프로세스가 쓰기 도중 종료되면 부분 기록 파일이 남는다.
read 시 catch 로 `null` 반환해 graceful 하더라도, 매 만료 전 재사용 캐시가 무효화되어 불필요한 재교환 발생 — 그리고 동시 실행 시 race.

**Good**: temp 파일에 쓰고 `rename` 으로 원자적 교체.

```ts
import { rename } from "node:fs/promises";
import { randomBytes } from "node:crypto";

const tmp = filePath + "." + randomBytes(4).toString("hex") + ".tmp";
await writeFile(tmp, JSON.stringify(data, null, 2), { encoding: "utf-8", mode: 0o600 });
await rename(tmp, filePath);   // 원자적 교체
```

**검출**:
```bash
grep -rnE "writeFile\(" src/cache/   # 캐시 쓰기에 temp+rename 없이 직접 writeFile 의심
# 같은 함수에 rename 호출이 동반되는지 확인
```

**Self-check**: `src/cache/` 의 모든 쓰기가 temp 파일 + `rename` 패턴인가? 비밀 파일이면 `mode: 0o600` 도 동반.

**Why**: plan002 (PR #2) code-reviewer FIX_NEEDED — deploy 토큰 캐시(`token-store.ts`)가 `writeFile` 직접 호출. build-with-teams 검사 항목 #10 이 명시하는데도 executor 가 첫 구현에서 누락 → 구체 grep 으로 사전 차단.

# 9. 상수·주석 위생 (AI slop)

## 9-1. exit code 등 의미 상수를 리터럴 + 주석으로 사용

**증상**: `exit-codes.ts` 에 `EXIT_PARAM_ERROR = 3` 상수가 이미 있는데 한 파일만 `throw new NhnCloudCliError("...", 3 /* EXIT_PARAM_ERROR */)` 처럼 리터럴 + 주석.
나머지 파일은 상수 import 사용 — 신규 파일만 예외 상태로 일관성 깨짐.

**Good**: 정의된 상수를 import 해서 쓴다. 주석으로 상수명을 다는 것은 "상수가 있다는 걸 알면서 안 쓴" 신호.

**검출**:
```bash
# NhnCloudCliError / process.exit 의 2번째 인자가 숫자 리터럴인 곳
grep -rnE "NhnCloudCliError\([^,]+,\s*[0-9]+|process\.exit\([0-9]+\)" src/
# exit-codes.ts 상수 목록과 대조
grep -nE "EXIT_[A-Z_]+ =" src/utils/exit-codes.ts
```

**Self-check**: 새 파일의 exit code 인자가 숫자 리터럴인가? 같은 값의 `EXIT_*` 상수가 exit-codes.ts 에 있으면 import 로 교체.

**Why**: PR #3 (plan003) code-reviewer MEDIUM — configure.ts 가 `3 // EXIT_PARAM_ERROR` 리터럴. 다른 파일은 모두 상수 import. 신규 명령·helper 파일마다 재발 가능.

## 9-2. 함수 시그니처 수정 시 구 JSDoc 블록 미삭제

**증상**: 기존 함수에 파라미터를 추가하며 새 JSDoc 블록을 함수 위에 작성했는데 구 JSDoc 블록을 지우지 않아 **JSDoc 두 개가 연속**으로 남음.
TypeScript 는 마지막 블록만 귀속시켜 런타임 영향은 없으나 구 블록이 AI slop 으로 잔존 + 구 설명이 현행과 모순.

**Good**: 시그니처 수정 시 기존 JSDoc 을 **수정**한다 (새 블록을 위에 덧붙이지 않는다). 덧붙였으면 구 블록 삭제.

**검출**:
```bash
# 연속된 JSDoc 종료-시작 (*/ 다음 줄이 /**) 탐지
grep -nA1 "^\s*\*/$" src/**/*.ts | grep -B1 "^\S*-\s*/\*\*"
```

**Self-check**: 함수 시그니처를 바꾼 파일에서 함수 직전에 JSDoc 블록이 2개 연속인 곳이 없는가?

**Why**: PR #3 (plan003) code-reviewer LOW — `getAccessToken` 에 forceRefresh 추가하며 새 JSDoc 을 위에 붙이고 구 블록을 안 지움. 시그니처 변경 리팩토링마다 재발 가능.

---

# 9. 파일 입력 처리

## 9-1. 파일 옵션을 readFileSync 로 바로 읽음 (크기 가드·errno·파일유형 누락)

`--user-data <path>` 같은 파일 입력 옵션을 `readFileSync(path)` 로 곧장 읽으면 세 가지 함정이 동시에 생긴다.

- **메모리 폭발**: 크기 한도가 있어도 (예: base64 후 65535) 임의 크기 파일을 통째로 읽은 뒤에야 실패 → fail-fast 위반.
- **errno 삼킴**: `catch {}` 로 에러를 버리면 ENOENT (없음) · EACCES (권한) · EISDIR (디렉터리) 가 동일 메시지로 합쳐져 디버깅 불가.
- **디렉터리 통과**: `statSync(dir).size` 는 성공하므로 size 가드만으로는 디렉터리를 못 거른다 → 뒤이은 `readFileSync` 에서 EISDIR generic leak (EXIT 코드도 어긋남).

**Good**: 읽기 전에 `statSync` 한 번으로 세 검증을 끝내고, 통과한 정상 파일에만 `readFileSync` 호출.

```ts
let stat: ReturnType<typeof statSync>;
try {
  stat = statSync(path);
} catch (e) {
  const reason = (e as NodeJS.ErrnoException).code ?? (e instanceof Error ? e.message : String(e));
  throw new NhnCloudCliError(`... 읽을 수 없습니다: ${path} (${reason})`, EXIT_PARAM_ERROR);
}
if (!stat.isFile()) throw new NhnCloudCliError("... 일반 파일이 아닙니다", EXIT_PARAM_ERROR);
if (stat.size > RAW_LIMIT) throw new NhnCloudCliError("... 너무 큽니다", EXIT_PARAM_ERROR);
const raw = readFileSync(path);
```

- raw 한도는 인코딩 후 한도에서 역산한다 (base64 는 floor 경계 — 65535 → 49149).

**검출**:

```bash
# 파일 옵션을 읽는 곳에서 직전에 statSync 가드가 있는지
grep -n "readFileSync\|readFile(" src/commands/
```

**Self-check**: 파일 경로 옵션을 읽는 command 에서 `readFileSync` 직전에 `statSync` + `isFile()` + size 가드 + errno 노출이 모두 있는가?

**Why**: PR #8 (plan006) code-reviewer 🟡 2건 — `--user-data` 를 stat 없이 readFileSync. 파일 입력 옵션 (--*-file / config import 등) 추가마다 재발 가능.

---

## 회고 절차 (build-with-teams 9단계)

PR 생성 후 team-lead 자문:
- code-reviewer 가 이번 plan 에서 FIX_NEEDED 또는 코멘트로 지적한 항목이 있는가?
- 있으면, 그 패턴이 **다른 plan 에서도 발생할 가능성** 이 있는가? (1회성 typo 제외)
- 가능성 있으면, 본 docs 의 해당 카테고리에 항목 추가 (또는 새 카테고리 신설). 1줄 단서 + 검출 명령 + Self-check 까지 채워야 추가.

회고에서 발견된 패턴은 **다음 plan 의 phase 작성 시 critic 평가 전에 소진** 됨 (planning SKILL 8단계 self-check + build-with-teams critic 평가 7번 게이트가 본 docs 도 참조).
