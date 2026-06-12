# Phase 01 — 테스트 인프라 + ky mock 패턴 시범 테스트

## 목표 (검증 가능)

`pnpm test` 가 실제 테스트를 실행해 모두 그린이고, 후속 task(021/022)가 복사해 쓸 ky mock 레시피가 존재한다.

- 검증: `pnpm test` → 3개 파일의 케이스 전부 PASS, "no test files" 아님.
- 검증: `pnpm tsc --noEmit` → 0 에러(테스트 파일 포함 타입 안전).

## 배경

기존 코드에 `*.test.ts` 가 0개다(`vitest run --passWithNoTests` 로 빈 스위트 통과 중). NCR client·envelope·가드를 검증하려면 먼저 테스트 기반과 ky mock 패턴을 확립해야 한다. 본 task 는 **신규 기능이 아니라 검증 기반 도입**이다 — 기존 동작을 바꾸지 않고 테스트만 추가한다(외과적: 프로덕션 코드 무수정).

## 구현 항목

### 1. `vitest.config.ts` 생성

루트에 추가. 최소 설정:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

### 2. `src/api/envelope.test.ts` — 순수 함수(mock 불요)

`unwrap` / `unwrapHeader` 의 분기를 직접 호출로 검증. 봉투 객체를 리터럴로 만들어 넣는다.

- `unwrap` — `{ header: { isSuccessful: true, resultCode: 0, resultMessage: "OK" }, body: { x: 1 } }` → `{ x: 1 }` 반환.
- `unwrap` — `isSuccessful: false` → `NhnCloudCliError` throw, `err.exitCode === EXIT_API_ERROR`.
- `unwrap` — `isSuccessful: true` 인데 `body` 누락 → throw(EXIT_API_ERROR). **5-3 회피의 런타임 보증**(optional body undefined 누수 차단)을 테스트로 고정한다.
- `unwrapHeader` — `isSuccessful: false` → throw, `true` → 무반환(throw 안 함).
- `resultCode` 가 string("0")일 때도 `isSuccessful` 만으로 판정하는지 1케이스(ADR-006 — 타입 비교 금지).

`expect(() => unwrap(x)).toThrowError()` + `try/catch` 로 `exitCode` 단언.

### 3. `src/api/httpError.test.ts` — toNhnCloudCliError 매핑

ky `HTTPError` 를 mock 으로 구성(`new HTTPError(response, request, options)` 형태가 까다로우면 `{ response: { status } }` 형태를 충족하는 최소 객체 + `instanceof` 우회 불가 시 실제 `HTTPError` import). **실제 매핑이 곧 후속 테스트의 mock 기준이므로 정확히 고정한다**:

- status 401 → `EXIT_AUTH_ERROR`
- status 403 → `EXIT_AUTH_ERROR`
- status 404 → `EXIT_API_ERROR`(404 가 AUTH 아님을 명시 — code-review-pitfalls 2-2 의 근거를 테스트로 박제)
- status 500 → `EXIT_API_ERROR`
- 비-HTTP `new Error("ECONNREFUSED")` → NhnCloudCliError 로 감싸지 않고 원형/일반 처리(현행 `toNhnCloudCliError` 동작을 먼저 코드로 확인 후 그 동작을 그대로 단언 — 테스트가 코드를 mirror, 코드를 테스트에 맞추지 말 것).

> 작성 전 `src/api/httpError.ts` 를 읽어 실제 분기(어떤 status 가 어떤 exit code, raw Error 처리)를 확인하고 **코드의 실제 동작을 단언**한다. 추측으로 기대값을 쓰지 않는다.

### 4. `src/services/deploy/client.test.ts` — ky mock 레시피(후속 표준)

`vi.mock("ky")` 로 ky 를 가로채 `.json()` 반환을 주입한다. 이 파일이 021/022 가 복붙할 **레퍼런스 레시피**다.

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import ky from "ky";
import { DeployClient } from "./client.js";

vi.mock("ky");

describe("DeployClient.artifacts", () => {
  beforeEach(() => vi.resetAllMocks());

  it("봉투를 unwrap 해 body 를 반환", async () => {
    vi.mocked(ky.get).mockReturnValue({
      json: async () => ({
        header: { isSuccessful: true, resultCode: 0, resultMessage: "OK" },
        body: { artifacts: [{ id: "a1" }] },
      }),
    } as never);
    const client = new DeployClient("token");
    const res = await client.artifacts("appkey");
    expect(res).toEqual({ artifacts: [{ id: "a1" }] });
  });

  it("isSuccessful=false 면 throw", async () => {
    vi.mocked(ky.get).mockReturnValue({
      json: async () => ({
        header: { isSuccessful: false, resultCode: "ERROR", resultMessage: "fail" },
      }),
    } as never);
    const client = new DeployClient("token");
    await expect(client.artifacts("appkey")).rejects.toThrow();
  });
});
```

- 실제 `DeployClient.artifacts` 시그니처/반환을 먼저 읽어 mock 반환 구조를 맞춘다(현재 `Record<string, unknown>` 반환).
- mock 의 reject 케이스를 추가한다면, reject value 는 **production 의 `toNhnCloudCliError` 매핑을 흉내**낸다(404→`NhnCloudCliError(EXIT_API_ERROR)`) — code-review-pitfalls 2-3.

## 회피 항목 (executor self-check)

- **2-3 mock reject mirror**: 에러 케이스 mock 의 reject value 가 production `toNhnCloudCliError` 매핑(EXIT_API_ERROR/EXIT_AUTH_ERROR)과 일치하는가? 임의 exitCode 금지.
- **테스트가 코드를 mirror**: httpError 기대값을 추측으로 쓰지 않고 `httpError.ts` 실제 동작을 읽고 단언했는가? (테스트를 코드에 맞춤, 역 금지)
- **외과적**: 프로덕션 코드(`envelope.ts`·`httpError.ts`·`deploy/client.ts`)를 수정하지 않았는가? 본 task 는 테스트만 추가한다. 테스트 작성 중 프로덕션 버그를 발견하면 **고치지 말고 보고**(별 task).
- **ESM import 확장자**: 테스트 import 도 `.js` 확장자 규약을 따른다(`./client.js`).

## 완료 조건

1. `pnpm test` — 3개 파일 전 케이스 PASS, 빈 스위트 아님.
2. `pnpm tsc --noEmit` — 0 에러.
3. `pnpm run build` — 정상(테스트 파일이 번들에 안 들어가는지 확인 — tsup entry 는 `src/index.ts`).
4. index.json `status: completed`, `current_phase: 1`.
