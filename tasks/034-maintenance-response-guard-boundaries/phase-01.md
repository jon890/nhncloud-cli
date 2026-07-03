# Phase 01 — 응답 guard 경계 고정

## 목표

Issue #40을 처리한다.
NKS 구현 후 추가된 응답 guard를 포함해 서비스별 응답 모델을 재평가한다.

전역 generic client나 전역 response guard 모듈은 만들지 않는다.
반복 제거는 NKS 내부의 같은 응답 모델 안에서만 수행한다.

## 현재 근거

NKS 머지 후 확인한 서비스 응답 모델은 서로 다르다.

| 파일 | 응답 모델 | 이번 phase 처리 |
|---|---|---|
| `src/services/nks/client.ts` | OpenStack 계열 평면 JSON, `uuid` 응답, 무본문 응답 | 수정 대상 |
| `src/services/nks/types.ts` | NKS 평면 JSON 타입 guard | 필요 시 수정 |
| `src/services/nks/client.test.ts` | NKS 평면 JSON·봉투 거부 테스트 | 수정 대상 |
| `src/services/instance/client.ts` | Nova/Glance named wrapper, 축약 create, keypair 중첩 wrapper | 읽기 전용 |
| `src/services/network/client.ts` | VPC/Floating IP named wrapper | 읽기 전용 |
| `src/services/blockstorage/client.ts` | Cinder volume named wrapper | 읽기 전용 |
| `src/services/ncr/client.ts` | NCR Management `{ header, registries/registry }`, `unwrapHeader` | 읽기 전용 |
| `src/services/ncr/harbor-client.ts` | Harbor REST 평면 배열, pagination `Link` header | 읽기 전용 |

NKS 안에는 같은 패턴의 배열 wrapper guard가 여러 개 있다.

```ts
function isClustersResponse(...)
function isNamedResourceArrayResponse(...)
function isNodeGroupsResponse(...)
function isAddonTypesResponse(...)
function isAddonsResponse(...)
```

반면 서비스 간 guard는 같은 이름의 wrapper처럼 보여도 필드 요구사항과 실패 의미가 다르다.
따라서 `src/api/responseGuard.ts` 같은 전역 helper로 올리지 않는다.

## 설계 결정

### 할 것

`src/services/nks/client.ts` 안에 파일 로컬 helper를 추가한다.

권장 형태:

```ts
function isArrayFieldResponse<T>(
  key: string,
  val: unknown,
  itemGuard: (item: unknown) => item is T,
): val is Record<string, T[]>
```

적용 대상:

- `isClustersResponse`
- `isNamedResourceArrayResponse`
- `isNodeGroupsResponse`
- `isAddonTypesResponse`
- `isAddonsResponse`

각 endpoint method의 error message는 그대로 유지한다.
`requestUuid`, `requestNoBody`, `getJson`, `getFlatNamedResource` 책임도 유지한다.

### 하지 않을 것

다음은 이번 phase에서 금지한다.

- `src/api/responseGuard.ts` 같은 전역 모듈 추가
- `src/services/instance/client.ts` guard를 NKS helper로 이동
- `src/services/network/client.ts` guard를 NKS helper로 이동
- `src/services/blockstorage/client.ts` guard를 NKS helper로 이동
- `src/services/ncr/client.ts`의 `unwrapHeader` 경계 변경
- `src/services/ncr/harbor-client.ts`에 `unwrap` 또는 `unwrapHeader` 추가
- NKS에 `unwrap` 또는 `unwrapHeader` 추가

## 구현 항목

### 1. NKS guard regression test 보강

`src/services/nks/client.test.ts`에 실패 shape 테스트를 추가한다.

필수 케이스:

- `listNodeGroups()`가 `nodegroups` 비배열을 거부한다.
- `listAddonTypes()`가 `addon_types` 원소의 `name` 누락을 거부한다.
- `listAddons()`가 `addons` 비배열을 거부한다.
- `createCluster()`가 `uuid` 없는 응답을 거부한다.
- `removeClusterAddon()`가 `uuid` 없는 DELETE 응답을 거부한다.

이미 같은 실패 케이스가 있으면 중복 추가하지 말고 기존 케이스를 보강한다.

### 2. NKS 파일 로컬 helper 추가

`src/services/nks/client.ts`에 `isArrayFieldResponse`를 추가한다.

기존 개별 wrapper 함수는 유지해도 된다.
다만 내부 구현은 새 helper를 호출해 object/null/array/element 검증 중복을 줄인다.

예시:

```ts
function isClustersResponse(val: unknown): val is { clusters: NksClusterSummary[] } {
  return isArrayFieldResponse("clusters", val, isNksClusterSummary);
}
```

타입 단언으로 성공시키지 않는다.
각 원소는 기존 item guard로 검증한다.

### 3. 비대상 파일 경계 확인

다음 파일은 읽고 경계를 확인하되, 이번 phase에서 수정하지 않는다.

- `src/services/instance/client.ts`
- `src/services/network/client.ts`
- `src/services/blockstorage/client.ts`
- `src/services/ncr/client.ts`
- `src/services/ncr/harbor-client.ts`

수정이 필요하다고 판단되면 이번 phase에 섞지 말고 별도 issue로 남긴다.

### 4. task 상태

구현 완료 후 `tasks/034-maintenance-response-guard-boundaries/index.json`을 갱신한다.

- phase status: `completed`
- task status: `completed`

## 문서 영향

사용자-facing 명령, 옵션, 출력, 인증 모델은 바뀌지 않는다.

새 전역 모듈을 만들지 않는 계획이므로 다음 문서는 수정하지 않는다.

- `README.md`
- `skills/nhncloud-cli/SKILL.md`
- `docs/flow.md`
- `docs/code-architecture.md`
- `AGENTS.md`
- `docs/adr/`

만약 구현 중 전역 helper 파일을 추가해야 한다는 결론이 나오면 이 phase를 중단하고 planning을 다시 연다.

## 회피 항목

구현 전후로 다음 pitfall을 읽고 self-check한다.

- `.agents/skills/_shared/pitfalls/plan/file-scope-inaccurate.md`
- `.agents/skills/_shared/pitfalls/plan/type-change-tsc-missing.md`
- `.agents/skills/_shared/pitfalls/plan/new-endpoint-envelope-assumed.md`
- `.agents/skills/_shared/pitfalls/code-review/union-overload-common-guard-only.md`
- `.agents/skills/_shared/pitfalls/code-review/unknown-array-object-entries-no-guard.md`

이번 작업에서 특히 확인할 점:

- wrapper 공통 helper가 item-specific guard를 우회하지 않는다.
- `Record<string, T[]>` 반환을 이유로 `raw[key] as T[]` 단언을 추가하지 않는다.
- NKS 평면 JSON에 NHN 봉투 helper를 적용하지 않는다.
- Harbor REST 배열 응답에 NHN 봉투 helper를 적용하지 않는다.

## 검증

자동 검증:

```bash
pnpm tsc --noEmit
pnpm build
pnpm test
rg -n "unwrap|unwrapHeader" src/services/nks
rg -n "isArrayFieldResponse" src/services/nks/client.ts
git diff --name-only
```

기대값:

- `pnpm tsc --noEmit`, `pnpm build`, `pnpm test` 모두 exit 0.
- `rg -n "unwrap|unwrapHeader" src/services/nks`는 0건이다.
- `isArrayFieldResponse`는 `src/services/nks/client.ts` 안에서만 확인된다.
- `git diff --name-only`는 아래 변경 파일 목록과 일치한다.
- `instance`, `network`, `blockstorage`, `ncr` service client 파일은 diff에 없어야 한다.

## 변경 파일

- `src/services/nks/client.ts`
- `src/services/nks/client.test.ts`
- `tasks/034-maintenance-response-guard-boundaries/index.json`

## 커밋

```bash
git commit -m "refactor(nks): consolidate response array guards"
```
