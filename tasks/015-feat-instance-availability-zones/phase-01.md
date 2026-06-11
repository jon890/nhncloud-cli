# Phase 01 — 코드: instance availability-zones 명령 (가용성 영역 목록)

## 목표

`nhncloud instance availability-zones` 로 가용성 영역(availability zone) 목록을 조회한다.

- `GET /os-availability-zone` → `availabilityZoneInfo[].{ zoneName, zoneState: { available } }`
- 표 컬럼 2개: `zoneName`·`available` (`instance list` 와 동일하게 가장 단순한 조회)
- 용도: 가용성 영역(영역명·가용 여부)을 조회한다. **주의 (1-25)**: 현재 `instance create` 에는 `--availability-zone` 옵션이 **없다**(grep 확인). 따라서 docs·`.description` 에서 "create 의 --availability-zone 후보" 라고 **단정하지 않는다** — "가용성 영역 조회 (인스턴스 발급 영역 참고용)" 수준으로 둔다. (향후 create 에 `--availability-zone` 이 추가되면 그때 연계 문구를 넣는다.)

근거: NHN Cloud Instance public-api docs 의 os-availability-zone 응답 구조(확정).
- `GET /v2/{tenantId}/os-availability-zone` 응답: `{ availabilityZoneInfo: [{ zoneName, zoneState: { available } }] }`
- `available` 은 `zoneState` **하위의 boolean** — 한 단계 중첩 필드다.
- 페이지네이션·필터 쿼리 파라미터 없음 (옵션은 `--region`·`--profile` + 전역 `--json`/`--quiet` 만).

인증·endpoint 는 기존 `resolveInstanceClient`(ADR-010, `X-Auth-Token` + region 별 compute endpoint)를 그대로 재사용한다.
endpoint 가 compute 와 동일하므로 ADR 신설은 불필요하다.

## 변경 파일 (4개)

1. `src/services/instance/types.ts` — `AvailabilityZone` interface 추가
2. `src/services/instance/client.ts` — `listAvailabilityZones()` 메서드 + 응답 가드 추가
3. `src/commands/instance/availability-zones.ts` — 신규 명령 (`list.ts` 패턴 그대로)
4. `src/index.ts` — `instanceCommand.addCommand(availabilityZonesCommand)`

## 회피 항목 (code-review-pitfalls 사전 확인)

- **1-2 (spinner 후 try/catch)**: `client.listAvailabilityZones()` 는 `startSpinner` 직후 try/catch 로 감싸고 catch 에서 `stopSpinner(false)` 후 re-throw 한다. `list.ts` 가 reference (spinner 시작 전에 `resolveInstanceClient`).
- **9-1 (exit code 리터럴 금지)**: 응답 형식 오류는 `EXIT_API_ERROR` **상수** 사용 (숫자 1 리터럴·`/* EXIT_API_ERROR */` 주석 금지). client.ts 의 기존 import 에 이미 있음.
- **7-2 (빈 결과는 output() 한 경로)**: 영역 0건은 `output()` 이 모드별로 처리(table="결과 없음"·quiet=빈 출력·json=`[]`). 별도 early return·`--json`/`--quiet` 분기를 만들지 않는다 — `output()` 한 경로로만 출력한다.
- **zoneState.available 중첩 필드 접근**: `available` 은 `zoneState` 하위 boolean 이다. 가드에서 `zoneState` 가 object 인지 먼저 확인한 뒤 그 안의 `available` 을 검사한다 (최상위 `available` 가정 금지 — 중첩을 한 단계 건너뛰면 항상 `undefined` → 표에 "undefined" 셀 출력). command 의 row 매핑도 `z.zoneState.available` 로 한 단계 들어가 접근한다.
- **2-1 / type 변경 → tsc**: 새 type 추가 = type 변경 → 성공 기준에 `pnpm tsc --noEmit` 필수 (tsup 은 type-check 우회).

## 작업 상세

### 1. `src/services/instance/types.ts`

`Flavor` interface 묶음 **뒤**(또는 `CreateServerParams` 앞 — 기존 flavor 타입 인접)에 추가:

```ts
/**
 * 가용성 영역(availability zone) — `GET /os-availability-zone`.
 * `available` 은 zoneState 하위의 boolean 이다 (한 단계 중첩).
 */
export interface AvailabilityZone {
  zoneName: string;
  zoneState: {
    available: boolean;
  };
}
```

### 2. `src/services/instance/client.ts`

(a) import 에 새 type 추가 — `client.ts` 의 기존 type import 는 **multi-line** 이다(Server/CreateServerParams/Flavor/.../Image*/Keypair*/CreateKeypair* 포함). 그 블록에 **`AvailabilityZone` 한 줄만 추가**한다 (아래 단일 줄 snippet 을 literal 로 덮어쓰지 말 것 — 기존 type 누락 시 tsc 깨짐):

```ts
  // ... 기존 multi-line import 블록 안에 추가:
  AvailabilityZone,
```

(b) 응답 타입 가드 추가 (기존 flavor 가드 근처). `available` 은 `zoneState` 하위 boolean 이므로 **중첩을 한 단계 들어가** 검증한다:

```ts
function isAvailabilityZone(val: unknown): val is AvailabilityZone {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  const state = obj["zoneState"];
  if (typeof state !== "object" || state === null) return false;
  return (
    typeof obj["zoneName"] === "string" &&
    typeof (state as Record<string, unknown>)["available"] === "boolean"
  );
}

function isAvailabilityZonesResponse(val: unknown): val is { availabilityZoneInfo: AvailabilityZone[] } {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return Array.isArray(obj["availabilityZoneInfo"]) && obj["availabilityZoneInfo"].every(isAvailabilityZone);
}
```

(c) `listFlavors()` 메서드 **뒤**(또는 `waitForActive` 앞)에 `listAvailabilityZones()` 추가. `list()` 와 동일한 단순 GET 패턴:

```ts
  /**
   * 가용성 영역(availability zone) 목록을 조회한다 (GET /os-availability-zone).
   * 가용성 영역(영역명·가용 여부)을 조회한다. 페이지네이션·필터 없음.
   */
  async listAvailabilityZones(): Promise<AvailabilityZone[]> {
    const url = `${this.computeEndpoint}/os-availability-zone`;
    try {
      const raw = await ky
        .get(url, {
          headers: this.authHeaders(),
          retry: 0,
          timeout: DEFAULT_TIMEOUT_MS,
        })
        .json();

      if (!isAvailabilityZonesResponse(raw)) {
        throw new NhnCloudCliError(
          "instance availability-zones 응답 형식이 올바르지 않습니다 — availabilityZoneInfo 배열이 없습니다.",
          EXIT_API_ERROR,
        );
      }
      return raw.availabilityZoneInfo;
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }
```

### 3. `src/commands/instance/availability-zones.ts` (신규)

`list.ts` 패턴을 그대로 따른다 (입력 옵션·검증 없음 — 가장 단순한 조회). spinner 시작 전에 `resolveInstanceClient`, spinner 내부에서만 API 호출:

```ts
import { Command } from "commander";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { resolveInstanceClient } from "./helpers.js";
import type { AvailabilityZone } from "../../services/instance/types.js";

interface AvailabilityZonesGlobalOpts extends OutputOptions {
  region?: string;
  profile?: string;
}

export const availabilityZonesCommand = new Command("availability-zones")
  .description("가용성 영역(availability zone) 목록을 조회한다 (zoneName·available)")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<AvailabilityZonesGlobalOpts>();

    // ── 1. 자격증명 + token 획득 (spinner 시작 전) ──
    const { client } = await resolveInstanceClient(opts);

    // ── 2. API 호출 (spinner 내부) ──
    startSpinner("가용성 영역 조회 중...");

    let zones: AvailabilityZone[];
    try {
      zones = await client.listAvailabilityZones();
    } catch (err) {
      stopSpinner(false);
      throw err;
    }

    stopSpinner(true);

    // ── 3. 출력 (빈 결과 포함 한 경로 — output() 이 모드별 처리) ──
    output(opts, {
      headers: ["zoneName", "available"],
      rows: zones.map((z) => [z.zoneName, String(z.zoneState.available)]),
      raw: zones,
      ids: zones.map((z) => z.zoneName),
    });
  });
```

> `available` 은 `z.zoneState.available` 로 한 단계 들어가 접근한다 (최상위 `z.available` 은 항상 undefined — 회피 항목 참조). boolean 은 `String(...)` 으로 "true"/"false" 문자열화한다. quiet 모드 식별자는 `zoneName` 을 쓴다 (영역에는 id 가 없다).

### 4. `src/index.ts`

(a) import 추가 (`flavorsCommand` import 근처):

```ts
import { availabilityZonesCommand } from "./commands/instance/availability-zones.js";
```

(b) `instanceCommand.addCommand(flavorsCommand);` **다음** 줄에 추가:

```ts
instanceCommand.addCommand(availabilityZonesCommand);
```

## 성공 기준 (검증 명령 + 기대값)

```bash
# cwd: <repo root 또는 worktree>

# 1. 타입 체크 — type 추가 → 필수
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l
# 기대: 0

# 2. 빌드 성공
pnpm build
# 기대: dist/index.js 생성, exit 0

# 3. availability-zones 가 instance 하위 명령으로 노출
node dist/index.js instance --help 2>&1 | grep -c "availability-zones"
# 기대: 1 이상

# 4. 기존 instance 명령 회귀 없음
node dist/index.js instance --help 2>&1 | grep -Ec "list|flavors|get|create|delete"
# 기대: 5 이상

# 5. exit code 리터럴 미사용 (9-1) — availability-zones.ts 와 client 신규 가드에 숫자 리터럴 exit code 없음
grep -nE "NhnCloudCliError\([^,]+,\s*[0-9]+" src/commands/instance/availability-zones.ts | wc -l
# 기대: 0

# 6. 중첩 필드 접근 — row 매핑이 zoneState.available 로 한 단계 들어가는지 (회피 항목)
grep -c "zoneState.available" src/commands/instance/availability-zones.ts
# 기대: 1 이상  (최상위 z.available 접근이면 0 → 실패)

# 7. 가드가 zoneState 중첩을 검증하는지
grep -c "zoneState" src/services/instance/client.ts
# 기대: 1 이상  (isAvailabilityZone 가드 내부)

# 8. spinner 시작 전 resolveInstanceClient (1-2) — resolveInstanceClient 호출이 startSpinner 보다 앞
awk '/\.action\(async/,/^  \}\)\;/' src/commands/instance/availability-zones.ts | grep -nE "(startSpinner|resolveInstanceClient)" | head -3
# 기대: resolveInstanceClient 호출이 startSpinner 보다 앞 줄번호
```

성공 기준 1-8 은 자격증명·네트워크 없이 검증된다 (빌드·help·grep 정적 검사).
실제 가용성 영역 조회(자격증명 필요)는 phase-02 후 사용자가 수동 확인한다 (phase-02 의 수동 확인 절).
