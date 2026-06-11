# Phase 02 — network/subnet 조회 명령 (새 서비스 디렉터리)

## 목표

`nhncloud network list`(VPC 목록) · `nhncloud network subnet list`(서브넷 목록)로 VPC·서브넷 정보를 조회한다. 두 명령은 `instance create --network` 에 넣을 id 를 사용자가 **확인**하는 도구다.

- `GET /v2.0/vpcs`(NHN VPC, phase-01 에서 확장한 `networkEndpoint` 사용) → `vpcs[].{id, name, cidrv4, state, router:external}`
- `GET /v2.0/vpcsubnets` → `vpcsubnets[].{id, cidr, vpc_id, gateway, available_ip_count}`
- 핵심 필드만 테이블, 전체는 `--json`.

## ⚠️ 미확인 항목 — `instance create --network` 가 받는 id 종류 (docs 단정 전 확정)

`instance create --network <uuid>` 는 Nova `networks: [{ uuid }]` 로 매핑된다(`src/services/instance/client.ts`). 그 `uuid` 가 **VPC id(`vpcs[].id`)** 인지 **subnet id(`vpcsubnets[].id`)** 인지 **별도 Neutron network id** 인지가 docs 만으로 확정되지 않았다 (NHN VPC 는 raw Neutron `/v2.0/networks` 가 아니다 — 콘솔 흐름은 "VPC 선택 → 서브넷 선택").

- **확정 방법 (우선순위)**:
  1. NHN Cloud Instance/VPC OpenStack 호환 public-api docs 의 `POST /servers` `networks` 필드 예제로 어느 id 인지 확인 (docs 단일 소스).
  2. docs 로 불확정이면 read-only 실측 — `instance get <기존 인스턴스>` 또는 `instance list --json` 의 network 첨부 정보에 나타나는 id 를 `vpcs[].id`·`vpcsubnets[].id` 와 대조 (기존 인스턴스가 어느 id 로 붙어 있는지).
  3. 그래도 불확정이면 수동 QA 로 테스트 인스턴스 1회 발급(쓰기 작업 — 사용자 동의 하)으로 round-trip 확정.
- **docs 반영 규칙 (phase-03)**: 확정되기 전에는 README/SKILL/flow 에서 "`network list` id 를 `--network` 에 그대로" 라는 **단정을 쓰지 않는다.** 확정된 id 종류(VPC 또는 subnet)를 명시하거나, 미확정이면 "VPC·서브넷 id 를 확인해 `--network` 에 사용 (어느 id 인지는 콘솔/ docs 로 확인)" 수준으로 보수적으로 적는다.
- 이 확정 결과는 team-lead 가 phase-03 결정 docs(flow.md create 소스 문구) 와 executor 의 README/SKILL 에 반영한다.

근거: NHN Cloud VPC public-api docs (NHN 고유 `/v2.0/vpcs`·`/v2.0/vpcsubnets` — raw Neutron `/v2.0/networks` 아님).
- VPC 응답: `{ vpcs: [{ id, name, cidrv4, state, "router:external", ... }] }`
- subnet 응답: `{ vpcsubnets: [{ id, cidr, vpc_id, gateway, available_ip_count, ... }] }`

> phase 시작 시 docs 예제 JSON 으로 위 필드 실재·타입을 재확인한다(CLAUDE.md "request/response body 구조도 공식 레퍼런스 먼저"). 항상 있지 않은 필드는 `?` optional 로 낮춘다 — 추측으로 required 박지 않는다.

## 핵심 설계 결정 — 새 서비스 디렉터리 + resolveNetworkClient

network 는 instance(Compute)와 **다른 서비스(VPC)** 다. instance 의 `services/instance/` · `commands/instance/` 에 끼워 넣지 않고 별도 디렉터리를 신설한다.

- 신규 `src/services/network/`(client+types) — `NetworkClient` 가 `networkEndpoint` 를 base 로 `/vpcs`·`/vpcsubnets` 호출.
- 신규 `src/commands/network/`(list, subnet) — `network list` · `network subnet list` 명령.
- **인증·endpoint 해석은 instance 와 공유**: Keystone 토큰(`X-Auth-Token`)·`getIaasToken`(phase-01 의 `networkEndpoint`)을 그대로 쓴다. 새 토큰을 발급하지 않는다.
- `resolveNetworkClient` helper 신설 — `resolveInstanceClient`(helpers.ts) 패턴을 따른다. `getIaasToken` 에서 `networkEndpoint` 를 꺼내 `new NetworkClient(tokenId, networkEndpoint)` 로 넘긴다.

> instance 의 `resolveInstanceClient` 는 건드리지 않는다(010/013 phase-01 이 추가한 반환 필드는 그쪽 destructuring 에서 무시됨). network 전용 resolver 를 새로 만들어 책임을 분리한다.

## 명령 구조 — network 명령군 + subnet 하위 명령

instance 가 `instanceCommand.addCommand(...)` 로 하위를 묶듯, network 도 부모 `networkCommand` 아래 묶는다.

```
nhncloud network list                  # VPC 목록 (create --network <uuid> 소스)
nhncloud network subnet list           # 서브넷 목록
```

- `networkCommand`(부모) → `listCommand`(VPC) + `subnetCommand`(부모) → 그 아래 `subnet list`.
- subnet 을 `network subnet list` 로 둔 이유: 추후 `subnet get` 등 확장 여지 + VPC 와 subnet 이 별개 리소스라 평평하게 `network list`/`subnet list` 두 최상위로 흩지 않고 network 아래로 묶는다.

## 변경 파일 (6개)

1. `src/services/network/types.ts` (신규) — `Vpc` / `VpcSubnet` 타입
2. `src/services/network/client.ts` (신규) — `NetworkClient` (`listVpcs()` / `listSubnets()`) + 응답 가드
3. `src/commands/network/helpers.ts` (신규) — `resolveNetworkClient`(`resolveInstanceClient` 패턴)
4. `src/commands/network/list.ts` (신규) — `network list`(VPC)
5. `src/commands/network/subnet.ts` (신규) — `network subnet list`(서브넷)
6. `src/index.ts` — `networkCommand` 등록 + 하위 `list`·`subnet` 묶기

## 회피 항목 (code-review-pitfalls 사전 확인)

- **1-2 (spinner 후 try/catch)**: `client.listVpcs()`·`client.listSubnets()` 는 `startSpinner` 직후 try/catch 로 감싸고 catch 에서 `stopSpinner(false)` 후 re-throw. `list.ts`(instance) 가 reference.
- **9-1 (exit code 리터럴 금지)**: 입력 검증(있다면) 실패는 `EXIT_PARAM_ERROR` **상수**(숫자 리터럴·주석 금지). 응답 가드 실패는 `EXIT_API_ERROR` 상수.
- **4-2 (region 목록 여러 맵 중복)**: 이 phase 는 host 맵을 새로 만들지 않는다(phase-01 이 `NETWORK_HOST` 추가). resolver 가 `--region` override 를 instance 와 **같은 방식**(`opts.region ? {...iaas, region: opts.region} : iaas`)으로 처리해 region 해석 분기가 갈라지지 않게 한다.
- **5-1 / 5-3 (캐스트 회피)**: 응답을 `as Vpc[]`·`as VpcSubnet[]` 캐스트하지 않는다 — `isVpcsResponse`·`isSubnetsResponse` 가드로 좁힌다.
- **7-2 (출력 모드 분기)**: 0건은 `output()` 이 모드별 처리(table="결과 없음"·quiet=빈·json=`[]`). early return 분기 금지.
- **콜론 필드명 접근 주의**: VPC 응답의 `router:external` 은 콜론을 포함한 키다. TypeScript 에서 `vpc.router:external` 로 점 접근 불가 — interface 에 `"router:external": boolean` 으로 따옴표 키 선언하고, 접근은 `vpc["router:external"]` 대괄호 표기로 한다(flavor 의 `"OS-FLV-EXT-DATA:ephemeral"` 가 reference).
- **2-1 / type 변경 → tsc**: 새 type + 새 client = type 변경 → 성공 기준에 `pnpm tsc --noEmit` 필수.

## 작업 상세

### 1. `src/services/network/types.ts` (신규)

```ts
/**
 * VPC 요약 — `GET /v2.0/vpcs` (NHN VPC). 보장 필드는 docs 예제 기준.
 * `router:external` 은 콜론 포함 키라 따옴표로 선언하고 대괄호로 접근한다.
 */
export interface Vpc {
  id: string;
  name: string;
  /** VPC IPv4 CIDR (예: 192.168.0.0/16) */
  cidrv4: string;
  /** 상태 (예: AVAILABLE) */
  state: string;
  /** 외부 라우터 연결 여부 (콜론 포함 키) */
  "router:external": boolean;
}

/**
 * 서브넷 요약 — `GET /v2.0/vpcsubnets` (NHN VPC).
 */
export interface VpcSubnet {
  id: string;
  /** 서브넷 CIDR (예: 192.168.0.0/24) */
  cidr: string;
  /** 소속 VPC id */
  vpc_id: string;
  /** 게이트웨이 IP */
  gateway: string;
  /** 사용 가능한 IP 수 */
  available_ip_count: number;
}
```

> 위 필드 중 docs 예제에 항상 있지 않은 것(예: `gateway` 가 없는 서브넷)은 `?` optional 로 낮춘다 — phase 시작 시 docs 예제로 재확인.
> **optional 로 낮추면 row 매핑도 함께 고친다 (minor 3)**: `subnet.ts` 의 `s.gateway`·`String(s.available_ip_count)` 가 `string|undefined` 가 되어 tsc 오류 → `s.gateway ?? ""`·`s.available_ip_count != null ? String(s.available_ip_count) : ""` 로 fallback. types 를 optional 로 바꾸면서 row fallback 을 빠뜨리면 빌드 실패.

### 2. `src/services/network/client.ts` (신규)

`instance/client.ts` 패턴(ky · `authHeaders` · 응답 가드 · `toNhnCloudCliError`)을 따른다.

```ts
import ky from "ky";
import { toNhnCloudCliError } from "../../api/httpError.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_API_ERROR } from "../../utils/exit-codes.js";
import type { Vpc, VpcSubnet } from "./types.js";

const DEFAULT_TIMEOUT_MS = 30_000;

// ── 응답 타입 가드 ─────────────────────────────────────────────────────────────

function isVpc(val: unknown): val is Vpc {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return typeof obj["id"] === "string" && typeof obj["name"] === "string";
}

function isVpcsResponse(val: unknown): val is { vpcs: Vpc[] } {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return Array.isArray(obj["vpcs"]) && obj["vpcs"].every(isVpc);
}

function isSubnet(val: unknown): val is VpcSubnet {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return typeof obj["id"] === "string" && typeof obj["cidr"] === "string";
}

function isSubnetsResponse(val: unknown): val is { vpcsubnets: VpcSubnet[] } {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return Array.isArray(obj["vpcsubnets"]) && obj["vpcsubnets"].every(isSubnet);
}

// ── NetworkClient ───────────────────────────────────────────────────────────────

export class NetworkClient {
  private readonly tokenId: string;
  private readonly networkEndpoint: string;

  constructor(tokenId: string, networkEndpoint: string) {
    this.tokenId = tokenId;
    this.networkEndpoint = networkEndpoint;
  }

  private authHeaders(): Record<string, string> {
    return { "X-Auth-Token": this.tokenId };
  }

  /**
   * VPC 목록을 조회한다 (GET /v2.0/vpcs, NHN VPC).
   * instance 와 다른 host(networkEndpoint)지만 같은 Keystone 토큰을 쓴다.
   */
  async listVpcs(): Promise<Vpc[]> {
    const url = `${this.networkEndpoint}/vpcs`;
    try {
      const raw = await ky
        .get(url, {
          headers: this.authHeaders(),
          retry: 0,
          timeout: DEFAULT_TIMEOUT_MS,
        })
        .json();

      if (!isVpcsResponse(raw)) {
        throw new NhnCloudCliError(
          "network list 응답 형식이 올바르지 않습니다 — vpcs 배열이 없습니다.",
          EXIT_API_ERROR,
        );
      }
      return raw.vpcs;
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  /**
   * 서브넷 목록을 조회한다 (GET /v2.0/vpcsubnets, NHN VPC).
   */
  async listSubnets(): Promise<VpcSubnet[]> {
    const url = `${this.networkEndpoint}/vpcsubnets`;
    try {
      const raw = await ky
        .get(url, {
          headers: this.authHeaders(),
          retry: 0,
          timeout: DEFAULT_TIMEOUT_MS,
        })
        .json();

      if (!isSubnetsResponse(raw)) {
        throw new NhnCloudCliError(
          "network subnet list 응답 형식이 올바르지 않습니다 — vpcsubnets 배열이 없습니다.",
          EXIT_API_ERROR,
        );
      }
      return raw.vpcsubnets;
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }
}
```

### 3. `src/commands/network/helpers.ts` (신규)

`resolveInstanceClient`(instance/helpers.ts) 패턴. `getIaasToken` 에서 `networkEndpoint` 만 꺼낸다.

```ts
import { resolveProfileName, getIaasCredential } from "../../config/credentials.js";
import { getIaasToken } from "../../api/keystone.js";
import { NetworkClient } from "../../services/network/client.js";

/**
 * profile 해석 → iaas 자격증명 로드 → region override → Keystone 토큰 교환 → NetworkClient 생성.
 * Keystone 토큰·endpoint 해석은 instance 와 공유한다 (새 토큰 발급 없음).
 * spinner 시작 *전* (파라미터 검증·자격증명 로드 단계) 에 호출한다.
 */
export async function resolveNetworkClient(opts: {
  profile?: string;
  region?: string;
}): Promise<{ client: NetworkClient; profileName: string }> {
  const profileName = await resolveProfileName(opts.profile);
  const iaas = await getIaasCredential(profileName);

  // --region flag 가 있으면 자격증명의 region 을 덮어쓴다 (instance 와 같은 방식)
  const effectiveIaas = opts.region ? { ...iaas, region: opts.region } : iaas;

  const { tokenId, networkEndpoint } = await getIaasToken(profileName, effectiveIaas);
  return { client: new NetworkClient(tokenId, networkEndpoint), profileName };
}
```

### 4. `src/commands/network/list.ts` (신규)

`instance/list.ts` 패턴. `router:external` 은 대괄호 접근.

```ts
import { Command } from "commander";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { resolveNetworkClient } from "./helpers.js";
import type { Vpc } from "../../services/network/types.js";

interface ListGlobalOpts extends OutputOptions {
  region?: string;
  profile?: string;
}

export const listCommand = new Command("list")
  .description("VPC 목록을 조회한다 (create --network <uuid> 소스, 전체 필드는 --json)")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<ListGlobalOpts>();

    // ── 1. 자격증명 + token 획득 (spinner 시작 전) ──
    const { client } = await resolveNetworkClient(opts);

    // ── 2. API 호출 (spinner 내부) ──
    startSpinner("VPC 목록 조회 중...");

    let vpcs: Vpc[];
    try {
      vpcs = await client.listVpcs();
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    // ── 3. 출력 (router:external 은 콜론 포함 키 → 대괄호 접근) ──
    output(opts, {
      headers: ["id", "name", "cidrv4", "state", "external"],
      rows: vpcs.map((v) => [v.id, v.name, v.cidrv4, v.state, String(v["router:external"])]),
      raw: vpcs,
      ids: vpcs.map((v) => v.id),
    });
  });
```

### 5. `src/commands/network/subnet.ts` (신규)

`network subnet list` — `subnetCommand`(부모) 아래 `list`. instance 의 부모/하위 구조 mirror.

```ts
import { Command } from "commander";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { resolveNetworkClient } from "./helpers.js";
import type { VpcSubnet } from "../../services/network/types.js";

interface SubnetListGlobalOpts extends OutputOptions {
  region?: string;
  profile?: string;
}

const subnetListCommand = new Command("list")
  .description("서브넷 목록을 조회한다 (전체 필드는 --json)")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<SubnetListGlobalOpts>();

    const { client } = await resolveNetworkClient(opts);

    startSpinner("서브넷 목록 조회 중...");

    let subnets: VpcSubnet[];
    try {
      subnets = await client.listSubnets();
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    output(opts, {
      headers: ["id", "cidr", "vpc_id", "gateway", "available_ip"],
      rows: subnets.map((s) => [
        s.id,
        s.cidr,
        s.vpc_id,
        s.gateway,
        String(s.available_ip_count),
      ]),
      raw: subnets,
      ids: subnets.map((s) => s.id),
    });
  });

/** `network subnet` 부모 — 현재 하위는 list 하나(추후 get 등 확장 여지). */
export const subnetCommand = new Command("subnet")
  .description("서브넷 관련 명령")
  .addCommand(subnetListCommand);
```

### 6. `src/index.ts`

(a) import 추가 (instance 명령 import 근처):

```ts
import { listCommand as networkListCommand } from "./commands/network/list.js";
import { subnetCommand } from "./commands/network/subnet.js";
```

> 주의: instance 의 `listCommand` 와 이름이 겹치므로 `networkListCommand` 로 alias import 한다.

(b) `instanceCommand` 등록부 인근에 network 명령군 등록:

```ts
const networkCommand = new Command("network").description("VPC·서브넷 조회 (instance create --network 소스)");
networkCommand.addCommand(networkListCommand);
networkCommand.addCommand(subnetCommand);
program.addCommand(networkCommand);
```

> `Command` import 가 index.ts 에 이미 있는지 확인 — 없으면 commander 의 `Command` 를 import 한다. instance 명령군 등록 방식(`new Command("instance")` 또는 별도 파일)과 동일 패턴을 따른다(index.ts 의 기존 instance 등록 코드를 읽고 같은 모양으로 맞춘다 — 추측 금지).

## 성공 기준 (검증 명령 + 기대값)

```bash
# cwd: <repo root 또는 worktree>

# 1. 타입 체크 — 새 type + 새 client → 필수
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l
# 기대: 0

# 2. 빌드 성공
pnpm build
# 기대: dist/index.js 생성, exit 0

# 3. network 명령군 노출
node dist/index.js network --help 2>&1 | grep -Ec "list|subnet"
# 기대: 2 (list + subnet)

# 4. network list 옵션 노출
node dist/index.js network list --help 2>&1 | grep -Ec -- "--region|--profile"
# 기대: 2

# 5. network subnet list 노출
node dist/index.js network subnet --help 2>&1 | grep -c "list"
# 기대: 1 이상

# 6. exit code 리터럴 미사용 (9-1) — network 명령·client 전체
grep -rnE "NhnCloudCliError\([^,]+,\s*[0-9]+" src/commands/network/ src/services/network/ | wc -l
# 기대: 0

# 7. 데이터 응답 캐스트 회피 (5-1/5-3) — as Vpc[] / as VpcSubnet[] / as unknown as 없음
grep -rnE "as Vpc\[\]|as VpcSubnet\[\]|as unknown as" src/commands/network/ src/services/network/ | wc -l
# 기대: 0

# 8. router:external 콜론 키 대괄호 접근 (점 접근으로 인한 컴파일 오류 방지)
grep -nE 'v\["router:external"\]|"router:external"' src/commands/network/list.ts src/services/network/types.ts | wc -l
# 기대: 2 이상 (types 선언 + list 접근)

# 9. resolveNetworkClient 가 networkEndpoint 만 꺼내고 NetworkClient 에 전달
grep -nE "networkEndpoint" src/commands/network/helpers.ts | wc -l
# 기대: 2 (destructuring + new NetworkClient 인자)

# 10. instance 의 resolveInstanceClient 미변경 (책임 분리)
grep -c "NetworkClient" src/commands/instance/helpers.ts
# 기대: 0
```

성공 기준 3~5 는 자격증명·네트워크 호출 없이 help 출력만 검사한다.
실제 VPC/subnet 목록 조회(자격증명 필요)는 phase-02 후 사용자가 수동 확인한다.

## 수동 확인 (자격증명 필요 — phase-02 후 사용자/구현자)

```bash
# 실제 VPC/subnet 목록 (개인 식별 정보 placeholder — 실제 profile/region 로 치환)
node dist/index.js network list
# 기대: id·name·cidrv4·state·external 테이블, exit 0

node dist/index.js network subnet list
# 기대: id·cidr·vpc_id·gateway·available_ip 테이블, exit 0

node dist/index.js network list --json | head
# 기대: JSON 배열, 각 원소에 id·name·"router:external"

# create 에 넣을 id 확인 흐름 (위 "미확인 항목" 확정 후)
node dist/index.js network list --quiet      # VPC id 한 줄씩
node dist/index.js network subnet list --quiet  # subnet id 한 줄씩
# instance create --network 가 받는 id 종류(VPC vs subnet)를 위 "미확인 항목" 절차로 확정한 뒤,
# 기존 인스턴스(instance get/list --json)의 network 첨부 id 와 대조해 어느 목록의 id 를 쓰는지 확인.
```
