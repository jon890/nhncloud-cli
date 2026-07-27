# Phase 01 — Load Balancer·IP ACL 조회 client와 타입 가드

**Execution profile**: standard
**Status**: pending

---

## 목표

기존 OpenStack network endpoint와 Keystone IaaS 토큰을 재사용하는 조회 전용 `LoadBalancerClient`를 구현한다.
공식 Load Balancer API 응답 중 명령 출력과 후속 제어가 의존하는 필드를 런타임 타입 가드로 검증한다.

**범위 외**: 생성·삭제·연결·재연결 API와 Commander 명령 등록은 이 phase에서 구현하지 않는다.

---

## 확정 계약

- 단일 소스는 [NHN Cloud Load Balancer API](https://docs.nhncloud.com/ko/Network/Load%20Balancer/ko/public-api/)다.
- endpoint와 인증은 `src/api/endpoints.ts`의 network endpoint 및 기존 IaaS 토큰 흐름을 재사용한다.
- HTTP는 `ky`만 사용하고 `retry: 0`, `timeout: 30_000`, `X-Auth-Token`을 적용한다.
- OpenStack 응답은 NHN 공통 봉투가 없는 일반 JSON이다.
- 목록 API에는 공개 페이지네이션 옵션을 추가하지 않고 각 명령이 한 번만 요청한다.
- 경로 식별자는 `encodeURIComponent`로 인코딩하고 HTTP 오류는 기존 `toNhnCloudCliError` 패턴으로 변환한다.
- `docs/adr/022-loadbalancer-ipacl-safety.md`, `docs/flow.md`, `docs/code-architecture.md`의 확정 계약을 따른다.

---

## 작업 항목 (4)

### 1. `src/services/loadbalancer/types.ts` — 조회 타입

다음 최소 타입을 정의한다.

- Load Balancer: `id`, `name`, `vip_address`, `provisioning_status`, `operating_status`, nullable `ipacl_group_action`, 연결된 IP ACL 그룹 식별자 목록.
- IP ACL 그룹: `id`, `name`, `action`, `ipacl_target_count`, 연결된 Load Balancer 식별자 목록.
- IP ACL 대상: `id`, `cidr_address`, `description`, `ipacl_group_id`.
- 공식 응답 봉투: `loadbalancers`, `loadbalancer`, `ipacl_groups`, `ipacl_group`, `ipacl_targets`.

API가 문자열로 반환하는 `ipacl_target_count`는 숫자로 강제 변환하지 않는다.
nullable 필드와 선택 필드는 공식 예제에 맞춰 표현한다.

### 2. `src/services/loadbalancer/client.ts` — 조회 메서드

`LoadBalancerClient`에 아래 시그니처를 구현한다.

- `listLoadBalancers(query?: Record<string, string>): Promise<LoadBalancer[]>`
- `getLoadBalancer(id: string): Promise<LoadBalancer>`
- `listIpAclGroups(query?: Record<string, string>): Promise<IpAclGroup[]>`
- `getIpAclGroup(id: string): Promise<IpAclGroup>`
- `listIpAclTargets(query: { ipacl_group_id: string }): Promise<IpAclTarget[]>`

각 응답은 배열 키와 배열 항목을 분리해 검사한다.
키가 없을 때와 항목 형식이 다를 때의 오류 메시지를 구분하고 `EXIT_API_ERROR`를 사용한다.

### 3. 타입 가드 경계

`unknown` 응답의 배열 항목이 객체인지 먼저 확인한 뒤 명령 출력과 해석기가 읽는 모든 필드를 검사한다.
빈 문자열 식별자, 배열 안의 `null`, 중첩 배열의 비객체 항목을 허용하지 않는다.
client가 endpoint 해석이나 credential 파일 접근을 직접 소유하지 않도록 기존 command 조립 경계를 유지한다.

### 4. `src/services/loadbalancer/client.test.ts` — client 단위 테스트

`ky`를 모의 처리해 다음을 고정한다.

- 각 URL, `searchParams`, 인증 header, retry, timeout.
- 다섯 조회 메서드의 정상 응답.
- 빈 목록 정상 반환.
- 배열 키 누락과 항목 형식 오류의 구분.
- nullable `ipacl_group_action`과 문자열 `ipacl_target_count`.
- 식별자 경로 인코딩과 HTTP 오류 변환.

phase 완료 시 `tasks/041-feat-loadbalancer-ipacl-read/index.json`의 Phase 1을 `completed`, `current_phase`를 `2`로 갱신한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/services/loadbalancer/types.ts` | 신규 |
| `src/services/loadbalancer/client.ts` | 신규 |
| `src/services/loadbalancer/client.test.ts` | 신규 |
| `tasks/041-feat-loadbalancer-ipacl-read/index.json` | 상태 갱신 |

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm test -- src/services/loadbalancer/client.test.ts
rg -n "listLoadBalancers|listIpAclGroups|listIpAclTargets" src/services/loadbalancer/client.ts
```

성공 기준은 명령 종료 코드가 0이고, 마지막 검색이 세 메서드를 모두 찾는 것이다.

## 의도 메모

- 후속 쓰기 plan도 같은 client와 타입을 확장하므로 읽기 응답 경계를 먼저 고정한다.
- 목록을 단일 호출로 유지해 문서에 없는 페이지네이션 계약을 추측하지 않는다.
- 새 dependency, cache, credential schema, endpoint resolver를 추가하지 않는다.

## Blocked 조건

- 공식 문서의 응답 구조와 구현에 필요한 필드가 충돌하면 `PHASE_BLOCKED: Load Balancer 조회 응답 구조 재확인 필요`를 보고하고 추측 구현을 중단한다.
