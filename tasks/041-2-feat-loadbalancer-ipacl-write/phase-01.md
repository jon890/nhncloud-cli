# Phase 01 — 선행 기반 검증과 IP ACL 쓰기 client

**Execution profile**: standard
**Status**: pending

---

## 목표

`041-feat-loadbalancer-ipacl-read`가 병합된 최신 main을 기반으로 실행 중인지 먼저 검증한다.
확정된 조회 client를 확장해 IP ACL 그룹·대상 변경과 Load Balancer 연결 API를 제공한다.

**범위 외**: Commander 쓰기 명령과 재바인딩 알고리즘은 다음 phase에서 구현한다.

---

## 실행 전제

이 task 브랜치는 계획 작성 시점에는 읽기 PR 이전의 `origin/main`을 기준으로 생성됐다.
`build-with-teams` team-lead는 Phase 01을 위임하기 전에 아래를 수행한다.

```bash
# cwd: <repo root>
set -e
git fetch origin
git rebase origin/main
test -f src/services/loadbalancer/client.ts
test -f docs/adr/022-loadbalancer-ipacl-safety.md
test -f tasks/041-feat-loadbalancer-ipacl-read/index.json
git push --force-with-lease origin feat/041-2-feat-loadbalancer-ipacl-write
```

선행 파일이나 task 이력이 없으면 읽기 PR이 아직 병합되지 않은 상태다.
이 경우 `PHASE_BLOCKED: 041-feat-loadbalancer-ipacl-read 병합과 최신 main rebase 필요`를 보고하고 구현을 시작하지 않는다.

---

## 확정 계약

- 공식 [NHN Cloud Load Balancer API](https://docs.nhncloud.com/ko/Network/Load%20Balancer/ko/public-api/)의 경로·method·payload·응답을 그대로 따른다.
- 기존 `LoadBalancerClient`, network endpoint, Keystone token, `ky`, `toNhnCloudCliError`를 재사용한다.
- OpenStack 일반 JSON 응답에 NHN 공통 봉투를 적용하지 않는다.
- `docs/adr/022-loadbalancer-ipacl-safety.md`의 완전 대체·재바인딩·부분 실패 결정을 변경하지 않는다.
- dependency, credential schema, cache, endpoint resolver를 추가하지 않는다.

---

## 작업 항목 (4)

### 1. 쓰기 요청·응답 타입

`src/services/loadbalancer/types.ts`에 공식 payload와 응답 타입을 추가한다.

- 그룹 생성 요청: `{ ipacl_group: { name, action: "ALLOW" | "DENY", description? } }`.
- 대상 생성 요청: `{ ipacl_target: { ipacl_group_id, cidr_address, description? } }`.
- 연결 요청: `{ ipacl_groups_binding: Array<{ ipacl_group_id: string }> }`.
- 그룹·대상 생성 응답은 각각 `ipacl_group`, `ipacl_target` wrapper를 사용한다.
- 연결 응답은 `Array<{ loadbalancer_id: string; ipacl_group_id: string }>`이며 빈 배열도 정상이다.
- 그룹·대상 삭제의 빈 본문 성공은 JSON 파싱을 시도하지 않는다.

### 2. 그룹·대상 쓰기 메서드

`src/services/loadbalancer/client.ts`에 아래 시그니처를 추가한다.

- `createIpAclGroup(input: CreateIpAclGroupInput): Promise<IpAclGroup>`
- `deleteIpAclGroup(id: string): Promise<void>`
- `getIpAclTarget(id: string): Promise<IpAclTarget>`
- `createIpAclTarget(input: CreateIpAclTargetInput): Promise<IpAclTarget>`
- `deleteIpAclTarget(id: string): Promise<void>`

경로 식별자는 인코딩하고, 요청 전 빈 ID를 허용하지 않는다.

### 3. 연결 메서드

`bindIpAclGroups(loadBalancerId: string, ipAclGroupIds: string[]): Promise<IpAclBinding[]>`를 추가한다.
공식 `bind_ipacl_groups` 요청은 전달받은 그룹 목록으로 기존 연결을 완전 대체한다.
빈 배열은 `clear-ipacl`의 명시적 호출에서만 command가 전달하지만 client는 공식 payload로 직렬화할 수 있어야 한다.
연결 응답 배열의 두 UUID 필드를 항목별로 검증한다.

### 4. `src/services/loadbalancer/client.test.ts` — 쓰기 API 테스트

- 여섯 메서드의 URL, method, 공식 wrapper·binding JSON payload, header, retry, timeout.
- 그룹·대상 생성 wrapper의 정상 파싱과 항목 형식 오류.
- delete의 빈 본문 성공과 bind 응답 배열의 정상·빈 배열·항목 형식 오류.
- 빈 ID 선검증과 HTTP 오류 변환.
- bind payload가 그룹 ID 순서와 빈 배열을 보존하는지 검증.

phase 완료 시 Phase 1을 `completed`, `current_phase`를 `2`로 갱신한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/services/loadbalancer/types.ts` | 쓰기 타입 확장 |
| `src/services/loadbalancer/client.ts` | 쓰기 메서드 확장 |
| `src/services/loadbalancer/client.test.ts` | 쓰기 API 테스트 |
| `tasks/041-2-feat-loadbalancer-ipacl-write/index.json` | 상태 갱신 |

## 검증

```bash
# cwd: <repo root>
pnpm tsc --noEmit
pnpm test -- src/services/loadbalancer/client.test.ts
rg -n "createIpAclGroup|deleteIpAclGroup|getIpAclTarget|createIpAclTarget|deleteIpAclTarget|bindIpAclGroups" src/services/loadbalancer/client.ts
```

성공 기준은 명령 종료 코드가 0이고 검색 결과에 여섯 메서드가 모두 나타나는 것이다.

## 의도 메모

- client는 HTTP와 응답 가드만 소유하고 `--yes`, 이름 해석, 재바인딩 순서는 command 계층이 소유한다.
- 삭제 성공에서 존재하지 않는 JSON을 파싱하지 않아 204 응답을 오류로 오판하지 않는다.
- 빈 배열의 의미는 command 이름으로 분리하고 client는 공식 API 표현을 그대로 전달한다.

## Blocked 조건

- 공식 payload 또는 응답 wrapper가 계획과 다르면 `PHASE_BLOCKED: IP ACL 쓰기 API 구조 재확인 필요`를 보고하고 추측 구현을 중단한다.
