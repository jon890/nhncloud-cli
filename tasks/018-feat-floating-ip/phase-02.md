# Phase 02 — 코드: floatingip 메서드 + commands/floatingip (list/create/delete, associate 는 실측 통과 시)

## 목표

`floatingip` 명령군을 추가한다 — 인스턴스 공인 IP(Floating IP) 관리.

- `nhncloud floatingip list` — Floating IP 목록 조회.
- `nhncloud floatingip create` — Floating IP 발급(`--network <id>` 또는 외부 VPC 자동 조회).
- `nhncloud floatingip delete <id>` — Floating IP 삭제(기본 confirm, `--yes` 즉시).
- `nhncloud floatingip associate <floatingip-id> <instance-id>` — **phase-01 실측 통과 시에만 포함**.
  실측 미통과면 이 명령을 제외하고 list/create/delete 만 낸다(보류 사유는 phase-03 docs/blocked).

근거: NHN Cloud Network(VPC) Floating IP public-api docs.

> **⚠️ 1-26 (create/associate/delete = 쓰기)**: `floatingip create`(공인 IP 발급·비용)·`associate`(인스턴스 연결)·`delete`(IP 회수)는 **쓰기 작업**이라 executor 가 자율 호출하지 않는다 (코드만, 실제 호출은 수동 QA). `list` 와 phase-01 의 `GET /v2.0/ports`(읽기)만 executor 가 확인. create/associate 응답 형태는 docs 예제로 작성하되 수동 QA 첫 호출로 확정.
> **결정 docs(CLAUDE/flow/code-architecture)는 phase-03 의 team-lead docs-first** — phase-02 는 코드만. 새 ADR 없음(013 network endpoint 재사용).

- 목록: `GET /v2.0/floatingips` → `{ floatingips: [{ id, floating_ip_address, status, port_id, fixed_ip_address, floating_network_id, label }] }`.
  - status 는 `ACTIVE`/`DOWN`/`ERROR`.
- 생성: `POST /v2.0/floatingips`, body `{ "floatingip": { "floating_network_id": "<external-vpc-id>" } }`(필수).
  - 외부 네트워크 id 는 `GET /v2.0/vpcs?router:external=true` 로 조회(013 의 network endpoint 재사용).
- 연결: `PUT /v2.0/floatingips/{id}`, body `{ "floatingip": { "port_id": "<port>" } }`. 해제는 `port_id: null`.
- 삭제: `DELETE /v2.0/floatingips/{id}`(무본문).

## 013 재사용 — endpoint·client·인증을 새로 만들지 않는다 (핵심 설계 결정)

floatingip 의 catalog type 은 013 의 vpc/subnet 과 동일한 **`network`** 다.

- **host/endpoint**: 013 이 확정한 `networkEndpoint`(host 패턴·`/v2.0/...` 경로, tenantId segment 없음)를 그대로 base 로 쓴다. 새 host 맵·새 endpoint 해석을 추가하지 않는다.
- **인증**: 기존 Keystone `X-Auth-Token` 재사용 — 새 토큰 발급 없음.
- **client**: 013 의 `services/network/client.ts`(`NetworkClient`)에 floatingip 메서드를 **더한다**(새 service 디렉터리 신설 X). `resolveNetworkClient`(013 helper)를 commands 에서 그대로 호출.
- **ADR**: 새 endpoint·새 인증이 없으므로 ADR 미동반 — 013 의 ADR-013(network endpoint 해석)을 그대로 재사용한다.

> 013 선행 의존: 이 phase 는 `NetworkClient` + `resolveNetworkClient` + `networkEndpoint` 가 이미 있다는 전제다. 없으면(013 미구현) 013 을 먼저 끝낸다(phase-01 의 013 의존 확인 게이트).
> 013 이 정한 정확한 식별자명(`NetworkClient` / `resolveNetworkClient` / `networkEndpoint`)을 phase 시작 시 grep 으로 확인해 일치시킨다 — 추측으로 이름을 박지 않는다.

## 변경 파일

associate **포함** 시(실측 통과):

1. `src/services/network/types.ts` — `FloatingIp` / `CreateFloatingIpParams`(+ associate 가 쓰는 `Port` 요약) 타입 추가
2. `src/services/network/client.ts` — `listFloatingIps()` / `createFloatingIp()` / `deleteFloatingIp()` / `associateFloatingIp()` / `findExternalNetworkId()` / `findPortByInstance()` 메서드 + 응답 가드
3. `src/commands/floatingip/list.ts` — 신규
4. `src/commands/floatingip/create.ts` — 신규
5. `src/commands/floatingip/delete.ts` — 신규
6. `src/commands/floatingip/associate.ts` — 신규 (**실측 통과 시에만**)
7. `src/index.ts` — `floatingipCommand` 부모 + 하위 명령 등록

associate **보류** 시: 위 2 에서 `associateFloatingIp`/`findPortByInstance` 제외, 6 제외, 7 에서 associate 등록 제외.

## 회피 항목 (code-review-pitfalls 사전 확인)

- **1-2 (spinner 후 try/catch + stopSpinner(false))**: 모든 `client.*` 호출을 `startSpinner` 직후 try/catch 로 감싸고 catch 에서 `stopSpinner(false)` 후 re-throw, 성공 시 `stopSpinner(true)`. `list.ts`/`delete.ts` 가 reference. create 가 다단계(외부 네트워크 조회 → 발급)면 1-2 의 "다단계 spinner 전환 시 직전 spinner stop 누락" 도 적용 — 두 번째 spinner 전에 첫 spinner 를 `stopSpinner(true)`.
- **9-1 (exit code 리터럴 금지)**: 입력 검증 실패는 `EXIT_PARAM_ERROR` **상수** import(숫자 리터럴·주석 금지). API 응답 형식 오류는 `EXIT_API_ERROR` 상수.
- **5-4 (`floatingips` 배열 가드)**: `GET /v2.0/floatingips` 응답을 `as FloatingIp[]` 캐스트하지 않는다 — `isFloatingIpsResponse` 가드로 `Array.isArray(obj["floatingips"]) && every(isFloatingIp)` 검증 후 좁힌다. 같은 가드를 `vpcs`(외부 네트워크 조회)·`ports`(instance 매핑)에도 적용 — 배열 요소가 primitive 일 때 `Object.entries`/필드 접근이 깨지지 않도록 element 가드 먼저.
- **`router:external` 콜론 필드명**: `GET /v2.0/vpcs?router:external=true` 의 쿼리 키와 응답 필드 `router:external` 은 **콜론을 포함한 리터럴 키**다. JS object 접근 시 `obj["router:external"]`(점 접근 `obj.router:external` 불가) — 가드·필터에서 반드시 bracket + 따옴표 키로 다룬다. searchParams 키도 `"router:external"` 문자열 그대로.
- **2-1 / type 변경 → tsc**: 새 type + client 메서드 추가 = type 변경 → 성공 기준에 `pnpm tsc --noEmit` 필수.
- **7-2 (출력 모드 분기)**: list 0건은 `output()` 이 모드별 처리(table="결과 없음"·quiet=빈·json=`[]`). early return 분기 금지.
- **delete confirm 패턴**: non-TTY + `--yes` 없으면 `EXIT_PARAM_ERROR` 거부, TTY 면 confirm 프롬프트 — `instance/delete.ts` 와 동일.

## 작업 상세

### 1. `src/services/network/types.ts`

013 이 만든 `Vpc`/`Subnet` 타입 **뒤** 에 추가. 보장 필드는 docs 예제 기준.

```ts
/** Floating IP — `GET /v2.0/floatingips`. status 는 ACTIVE/DOWN/ERROR. */
export interface FloatingIp {
  id: string;
  floating_ip_address: string;
  status: string;
  /** 연결된 port (미연결이면 null) */
  port_id: string | null;
  /** 연결 port 의 사설 IP (미연결이면 null) */
  fixed_ip_address: string | null;
  floating_network_id: string;
  label?: string;
}

/** Floating IP 발급 파라미터 — floating_network_id 만 필수. */
export interface CreateFloatingIpParams {
  floating_network_id: string;
}
```

associate **포함** 시 port 요약 타입도 추가:

```ts
/** port 요약 — `GET /v2.0/ports?device_id=<instance-id>` (associate 의 instance→port_id 매핑). */
export interface Port {
  id: string;
  device_id: string;
}
```

> `label`·`fixed_ip_address` 가 docs 예제에 항상 있는지 phase 시작 시 docs 예제 JSON 으로 재확인. 미연결 시 null 이면 `| null`, 응답에서 누락 가능이면 `?` optional — 추측으로 required 박지 않는다.

### 2. `src/services/network/client.ts`

013 의 `NetworkClient`(`networkEndpoint` 를 base 로 가짐)에 메서드를 더한다.
`authHeaders()`/`DEFAULT_TIMEOUT_MS`/`toNhnCloudCliError` 는 013 이 둔 기존 것을 그대로 쓴다.

(a) import 에 새 type 추가(013 의 type import 옆):

```ts
import type { Vpc, Subnet, FloatingIp, CreateFloatingIpParams, Port } from "./types.js";
```

(b) 응답 가드 추가(013 의 vpc/subnet 가드 근처). **5-4 — element 가드 먼저**:

```ts
function isFloatingIp(val: unknown): val is FloatingIp {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj["id"] === "string" &&
    typeof obj["floating_ip_address"] === "string" &&
    typeof obj["status"] === "string"
  );
}

function isFloatingIpsResponse(val: unknown): val is { floatingips: FloatingIp[] } {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return Array.isArray(obj["floatingips"]) && obj["floatingips"].every(isFloatingIp);
}

function isFloatingIpResponse(val: unknown): val is { floatingip: FloatingIp } {
  if (typeof val !== "object" || val === null) return false;
  const obj = val as Record<string, unknown>;
  return isFloatingIp((obj as Record<string, unknown>)["floatingip"]);
}
```

(c) 메서드 추가:

```ts
  /** Floating IP 목록을 조회한다 (GET /v2.0/floatingips). */
  async listFloatingIps(): Promise<FloatingIp[]> {
    const url = `${this.networkEndpoint}/floatingips`;
    try {
      const raw = await ky
        .get(url, { headers: this.authHeaders(), retry: 0, timeout: DEFAULT_TIMEOUT_MS })
        .json();
      if (!isFloatingIpsResponse(raw)) {
        throw new NhnCloudCliError(
          "floatingip list 응답 형식이 올바르지 않습니다 — floatingips 배열이 없습니다.",
          EXIT_API_ERROR,
        );
      }
      return raw.floatingips;
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  /** Floating IP 를 발급한다 (POST /v2.0/floatingips). */
  async createFloatingIp(params: CreateFloatingIpParams): Promise<FloatingIp> {
    const url = `${this.networkEndpoint}/floatingips`;
    try {
      const raw = await ky
        .post(url, {
          headers: this.authHeaders(),
          json: { floatingip: { floating_network_id: params.floating_network_id } },
          retry: 0,
          timeout: DEFAULT_TIMEOUT_MS,
        })
        .json();
      if (!isFloatingIpResponse(raw)) {
        throw new NhnCloudCliError(
          "floatingip create 응답 형식이 올바르지 않습니다 — floatingip 객체가 없습니다.",
          EXIT_API_ERROR,
        );
      }
      return raw.floatingip;
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  /** Floating IP 를 삭제한다 (DELETE /v2.0/floatingips/{id}, 무본문). */
  async deleteFloatingIp(id: string): Promise<void> {
    const url = `${this.networkEndpoint}/floatingips/${encodeURIComponent(id)}`;
    try {
      await ky.delete(url, { headers: this.authHeaders(), retry: 0, timeout: DEFAULT_TIMEOUT_MS });
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  /**
   * 외부(external) VPC 의 id 를 찾는다 — create 의 floating_network_id 기본 소스.
   * router:external 은 콜론 포함 리터럴 키 — bracket 접근 필수.
   * region 에 external VPC 가 둘 이상이면 첫 매칭을 반환한다 (조용한 임의 선택 회피용:
   * 사용자는 `--network <id>` 로 명시 지정 가능 — create 의 stderr 안내에 그 사실을 노출).
   */
  async findExternalNetworkId(): Promise<string | null> {
    const url = `${this.networkEndpoint}/vpcs`;
    try {
      const raw = await ky
        .get(url, {
          headers: this.authHeaders(),
          searchParams: { "router:external": "true" },
          retry: 0,
          timeout: DEFAULT_TIMEOUT_MS,
        })
        .json();
      if (typeof raw !== "object" || raw === null) return null;
      const vpcs = (raw as Record<string, unknown>)["vpcs"];
      if (!Array.isArray(vpcs)) return null;
      for (const v of vpcs) {
        if (typeof v !== "object" || v === null) continue;
        const obj = v as Record<string, unknown>;
        if (obj["router:external"] === true && typeof obj["id"] === "string") {
          return obj["id"];
        }
      }
      return null;
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }
```

associate **포함** 시 추가:

```ts
  /**
   * 인스턴스 id 로 port_id 를 찾는다 (GET /v2.0/ports?device_id=<instance-id>).
   * 경로·쿼리·응답 필드명은 phase-01 실측으로 확정한 값을 반영한다.
   */
  async findPortByInstance(instanceId: string): Promise<string | null> {
    const url = `${this.networkEndpoint}/ports`;
    try {
      const raw = await ky
        .get(url, {
          headers: this.authHeaders(),
          searchParams: { device_id: instanceId },
          retry: 0,
          timeout: DEFAULT_TIMEOUT_MS,
        })
        .json();
      if (typeof raw !== "object" || raw === null) return null;
      const ports = (raw as Record<string, unknown>)["ports"];
      if (!Array.isArray(ports) || ports.length === 0) return null;
      const first = ports[0];
      if (typeof first !== "object" || first === null) return null;
      const id = (first as Record<string, unknown>)["id"];
      return typeof id === "string" ? id : null;
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }

  /**
   * Floating IP 를 port 에 연결/해제한다 (PUT /v2.0/floatingips/{id}).
   * port 가 null 이면 해제(disassociate).
   */
  async associateFloatingIp(id: string, portId: string | null): Promise<void> {
    const url = `${this.networkEndpoint}/floatingips/${encodeURIComponent(id)}`;
    try {
      await ky.put(url, {
        headers: this.authHeaders(),
        json: { floatingip: { port_id: portId } },
        retry: 0,
        timeout: DEFAULT_TIMEOUT_MS,
      });
    } catch (err) {
      throw toNhnCloudCliError(err);
    }
  }
```

> `device_id`/`router:external` 쿼리 키는 docs/실측이 확정한 이름 그대로 — camelCase 로 바꾸지 않는다.

### 3. `src/commands/floatingip/list.ts` (신규)

`list.ts`(instance) 패턴. spinner → try/catch → `output()`.

```ts
import { Command } from "commander";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { resolveNetworkClient } from "../network/helpers.js";
import type { FloatingIp } from "../../services/network/types.js";

interface ListGlobalOpts extends OutputOptions {
  region?: string;
  profile?: string;
}

export const listCommand = new Command("list")
  .description("Floating IP 목록을 조회한다")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<ListGlobalOpts>();
    const { client } = await resolveNetworkClient(opts);

    startSpinner("Floating IP 목록 조회 중...");
    let fips: FloatingIp[];
    try {
      fips = await client.listFloatingIps();
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    output(opts, {
      headers: ["id", "floating_ip_address", "status", "port_id", "fixed_ip_address"],
      rows: fips.map((f) => [
        f.id,
        f.floating_ip_address,
        f.status,
        f.port_id ?? "-",
        f.fixed_ip_address ?? "-",
      ]),
      raw: fips,
      ids: fips.map((f) => f.id),
    });
  });
```

> `resolveNetworkClient` 의 정확한 경로·시그니처는 013 이 정한 것을 grep 으로 확인해 import 한다(`../network/helpers.js` 는 013 컨벤션 추정 — 실제 위치로 맞춘다).

### 4. `src/commands/floatingip/create.ts` (신규)

`--network <id>` 미지정 시 `findExternalNetworkId()` 로 외부 VPC 자동 조회.
다단계 spinner — 외부 네트워크 조회와 발급 사이 첫 spinner 를 닫는다(1-2 다단계).

```ts
import { Command } from "commander";
import chalk from "chalk";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { output, type OutputOptions } from "../../formatters/table.js";
import { resolveNetworkClient } from "../network/helpers.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

interface CreateGlobalOpts extends OutputOptions {
  network?: string;
  region?: string;
  profile?: string;
}

export const createCommand = new Command("create")
  .description("Floating IP 를 발급한다 (--network 미지정 시 외부 VPC 자동 조회)")
  .option("--network <id>", "외부 네트워크(VPC) id (미지정 시 router:external=true 자동 조회)")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (_opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<CreateGlobalOpts>();
    const { client } = await resolveNetworkClient(opts);

    let networkId = opts.network;
    if (networkId === undefined) {
      startSpinner("외부 네트워크 조회 중...");
      try {
        const found = await client.findExternalNetworkId();
        if (found === null) {
          stopSpinner(false);
          throw new NhnCloudCliError(
            "외부 네트워크(router:external=true)를 찾지 못했습니다. --network <id> 로 직접 지정하세요.",
            EXIT_PARAM_ERROR,
          );
        }
        networkId = found;
      } catch (err) {
        stopSpinner(false);
        throw err;
      }
      stopSpinner(true); // 두 번째 spinner 전에 첫 spinner 닫기 (1-2 다단계)
    }

    startSpinner(`Floating IP 발급 중... (network: ${networkId})`);
    let fip;
    try {
      fip = await client.createFloatingIp({ floating_network_id: networkId });
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    process.stderr.write(chalk.green(`✓ Floating IP "${fip.floating_ip_address}" 를 발급했습니다 (id: ${fip.id}).\n`));
    output(opts, {
      headers: ["id", "floating_ip_address", "status", "floating_network_id"],
      rows: [[fip.id, fip.floating_ip_address, fip.status, fip.floating_network_id]],
      raw: fip,
      ids: [fip.id],
    });
  });
```

### 5. `src/commands/floatingip/delete.ts` (신규)

`instance/delete.ts` confirm 패턴 그대로(non-TTY + `--yes` 거부 → `EXIT_PARAM_ERROR` 상수, TTY confirm).
부수효과 명령이라 성공은 stderr, stdout 비움.

```ts
import { Command } from "commander";
import chalk from "chalk";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { resolveNetworkClient } from "../network/helpers.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

interface DeleteGlobalOpts {
  yes?: boolean;
  region?: string;
  profile?: string;
}

export const deleteCommand = new Command("delete")
  .description("Floating IP 를 삭제한다")
  .argument("<id>", "Floating IP ID")
  .option("--yes", "확인 프롬프트 생략 (CI/비대화형 필수)")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (id: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<DeleteGlobalOpts>();
    const isTTY = process.stdin.isTTY;

    if (!isTTY && !opts.yes) {
      throw new NhnCloudCliError(
        "비대화형 환경에서 Floating IP 삭제는 --yes 플래그가 필요합니다.",
        EXIT_PARAM_ERROR,
      );
    }
    if (isTTY && !opts.yes) {
      const { confirm } = await import("@inquirer/prompts");
      const ok = await confirm({ message: `Floating IP "${id}" 를 삭제하시겠습니까?`, default: false });
      if (!ok) {
        process.stderr.write(chalk.yellow("삭제가 취소되었습니다.\n"));
        return;
      }
    }

    const { client } = await resolveNetworkClient(opts);

    startSpinner(`Floating IP 삭제 중... (id: ${id})`);
    try {
      await client.deleteFloatingIp(id);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    process.stderr.write(chalk.green(`✓ Floating IP "${id}" 가 삭제되었습니다.\n`));
  });
```

### 6. `src/commands/floatingip/associate.ts` (신규 — phase-01 실측 통과 시에만)

instance id → port_id 변환 후 연결. 다단계 spinner.
`--detach` 로 해제(port_id:null).

```ts
import { Command } from "commander";
import chalk from "chalk";
import { startSpinner, stopSpinner } from "../../utils/spinner.js";
import { resolveNetworkClient } from "../network/helpers.js";
import { NhnCloudCliError } from "../../utils/errors.js";
import { EXIT_PARAM_ERROR } from "../../utils/exit-codes.js";

interface AssociateGlobalOpts {
  detach?: boolean;
  region?: string;
  profile?: string;
}

export const associateCommand = new Command("associate")
  .description("Floating IP 를 인스턴스에 연결한다 (--detach 로 해제)")
  .argument("<floatingip-id>", "Floating IP ID")
  .argument("<instance-id>", "연결할 인스턴스 ID")
  .option("--detach", "연결을 해제한다 (port_id 를 null 로)")
  .option("--region <region>", "region override (기본: iaas 자격증명의 region)")
  .option("--profile <name>", "사용할 profile 이름")
  .action(async (fipId: string, instanceId: string, _opts: unknown, cmd: Command) => {
    const opts = cmd.optsWithGlobals<AssociateGlobalOpts>();
    const { client } = await resolveNetworkClient(opts);

    if (opts.detach) {
      startSpinner(`Floating IP 연결 해제 중... (id: ${fipId})`);
      try {
        await client.associateFloatingIp(fipId, null);
      } catch (err) {
        stopSpinner(false);
        throw err;
      }
      stopSpinner(true);
      process.stderr.write(chalk.green(`✓ Floating IP "${fipId}" 연결을 해제했습니다.\n`));
      return;
    }

    // 1단계: instance → port_id 매핑
    startSpinner(`인스턴스 port 조회 중... (instance: ${instanceId})`);
    let portId: string | null;
    try {
      portId = await client.findPortByInstance(instanceId);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    if (portId === null) {
      stopSpinner(false);
      throw new NhnCloudCliError(
        `인스턴스 "${instanceId}" 의 port 를 찾지 못했습니다.`,
        EXIT_PARAM_ERROR,
      );
    }
    stopSpinner(true); // 두 번째 spinner 전에 첫 spinner 닫기 (1-2 다단계)

    // 2단계: 연결
    startSpinner(`Floating IP 연결 중... (id: ${fipId}, port: ${portId})`);
    try {
      await client.associateFloatingIp(fipId, portId);
    } catch (err) {
      stopSpinner(false);
      throw err;
    }
    stopSpinner(true);

    process.stderr.write(chalk.green(`✓ Floating IP "${fipId}" 를 인스턴스 "${instanceId}" 에 연결했습니다.\n`));
  });
```

### 7. `src/index.ts`

(a) import 추가:

```ts
import { listCommand as fipListCommand } from "./commands/floatingip/list.js";
import { createCommand as fipCreateCommand } from "./commands/floatingip/create.js";
import { deleteCommand as fipDeleteCommand } from "./commands/floatingip/delete.js";
// associate 포함 시:
import { associateCommand as fipAssociateCommand } from "./commands/floatingip/associate.js";
```

(b) 부모 명령 + 하위 등록(013 의 `networkCommand` 등록 패턴 참고):

```ts
const floatingipCommand = new Command("floatingip").description("Floating IP(인스턴스 공인 IP) 관리");
floatingipCommand.addCommand(fipListCommand);
floatingipCommand.addCommand(fipCreateCommand);
floatingipCommand.addCommand(fipDeleteCommand);
floatingipCommand.addCommand(fipAssociateCommand); // associate 포함 시에만
program.addCommand(floatingipCommand);
```

> import alias(`fipListCommand` 등)는 instance 의 `listCommand` 등과 이름 충돌을 피하기 위함. 013 이 network 명령에서 쓴 alias 컨벤션이 있으면 그쪽을 따른다.

## 성공 기준 (검증 명령 + 기대값)

```bash
# cwd: <repo root 또는 worktree>

# 1. 타입 체크 — 새 type + client 메서드 추가 → 필수
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l
# 기대: 0

# 2. 빌드 성공
pnpm build
# 기대: dist/index.js 생성, exit 0

# 3. floatingip 부모 명령 + 하위 노출
node dist/index.js floatingip --help 2>&1 | grep -Ec -- "list|create|delete"
# 기대: 3 이상 (associate 포함 시 4 이상)

# 4. create 에 --network 노출
node dist/index.js floatingip create --help 2>&1 | grep -c -- "--network"
# 기대: 1

# 5. delete 에 <id> argument + --yes 노출
node dist/index.js floatingip delete --help 2>&1 | grep -Ec -- "--yes"
# 기대: 1

# 6. delete non-TTY + --yes 없음 → EXIT_PARAM_ERROR(3) (자격증명 전 차단)
echo "" | node dist/index.js floatingip delete <floatingip-id>; echo "exit=$?"
# 기대: stderr 에 "--yes 플래그가 필요", exit=3

# 7. exit code 리터럴 미사용 (9-1)
grep -rnE "NhnCloudCliError\([^,]+,\s*[0-9]+" src/commands/floatingip/ | wc -l
# 기대: 0

# 8. floatingips 배열 응답 캐스트 회피 (5-4) — 가드 사용, as FloatingIp[] 없음
grep -nE "as FloatingIp\[\]|as unknown as" src/services/network/client.ts src/commands/floatingip/*.ts | wc -l
# 기대: 0
grep -c "isFloatingIpsResponse" src/services/network/client.ts
# 기대: 1 이상 (가드 정의 + 사용)

# 9. router:external 콜론 키 bracket 접근 (점 접근 금지)
grep -nE "router:external" src/services/network/client.ts | grep -cE "\[\"router:external\"\]|searchParams.*router:external"
# 기대: 1 이상 (모두 bracket/문자열 키 — obj.router 점 접근 없음)

# 10. spinner leak 회귀 없음 (1-2) — 각 client 호출이 try/catch 로 감싸짐
grep -rcE "stopSpinner\(false\)" src/commands/floatingip/*.ts | awk -F: '{s+=$2} END {print s}'
# 기대: list 1 + create 2(다단계) + delete 1 (+ associate 3) = 4 이상 (associate 포함 시 7 이상)

# 11. 013 endpoint 재사용 — 새 host 맵/새 endpoint 해석을 floatingip 가 추가하지 않음
grep -rnE "_HOST\s*[:=]|nhncloudservice\.com" src/commands/floatingip/ src/services/network/client.ts | grep -iE "floating" | wc -l
# 기대: 0 (host 는 013 networkEndpoint 재사용 — floatingip 전용 host 신설 없음)
```

성공 기준 3~7 은 자격증명·네트워크 없이 help / commander 검증만으로 통과한다.

## associate 보류 시 분기

phase-01 실측에서 instance→port_id 매핑이 확정 안 되면:

- 위 6(associate.ts) 작성 제외, 2 에서 `findPortByInstance`/`associateFloatingIp` 제외, 7 에서 associate 등록 제외.
- 성공 기준 3 은 "3 이상"(associate 없음), 10 은 "4 이상"으로 맞춘다.
- 보류 사유 1줄을 phase-03 의 docs/blocked 기록과 index.json `blocked_reason` 에 남긴다.

## 수동 확인 (자격증명 필요 — phase-02 후 사용자/QA)

```bash
# 개인 식별 정보 placeholder — 실제 profile/region/id 로 치환
node dist/index.js floatingip list
# 기대: id·floating_ip_address·status·port_id·fixed_ip_address 테이블

node dist/index.js floatingip create
# 기대: 외부 VPC 자동 조회 후 발급, "✓ Floating IP <addr> 를 발급했습니다"

node dist/index.js floatingip associate <floatingip-id> <instance-id>   # associate 포함 시
# 기대: port 조회 → 연결, list 에서 해당 fip 의 port_id 채워짐 + status ACTIVE

node dist/index.js floatingip associate <floatingip-id> <instance-id> --detach
# 기대: port_id 비워짐 + status DOWN

node dist/index.js floatingip delete <floatingip-id> --yes
# 기대: "✓ Floating IP <id> 가 삭제되었습니다"
```
