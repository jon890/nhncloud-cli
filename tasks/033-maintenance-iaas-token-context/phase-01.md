# Phase 01 — IaaS token context helper

## 목표

Issue #39를 처리한다.
Instance, Network, Volume, NKS command helper에 반복된 IaaS profile/region/Keystone token 해석 흐름을 공통 helper로 정리한다.

동작 변경은 하지 않는다.
서비스별 client 생성과 서비스별 header 책임은 각 helper/client에 남긴다.

## 현재 중복 근거

아래 네 파일이 같은 흐름을 반복한다.

- `src/commands/instance/helpers.ts`
- `src/commands/network/helpers.ts`
- `src/commands/volume/helpers.ts`
- `src/commands/nks/helpers.ts`

반복 흐름:

```ts
const profileName = await resolveProfileName(opts.profile);
const iaas = await getIaasCredential(profileName);
const effectiveIaas = opts.region ? { ...iaas, region: opts.region } : iaas;
const token = await getIaasToken(profileName, effectiveIaas);
```

## 설계 결정

### 추출할 것

`src/commands/iaas.ts`를 추가한다.

역할:

- profile 이름 해석
- `iaas` 자격증명 로드
- `--region` override 적용
- `getIaasToken(profileName, effectiveIaas)` 호출
- `profileName`과 token/endpoints를 한 객체로 반환

권장 인터페이스:

```ts
export interface IaasResolverOpts {
  profile?: string;
  region?: string;
}

export interface IaasTokenContext {
  profileName: string;
  tokenId: string;
  computeEndpoint: string;
  imageEndpoint: string;
  networkEndpoint: string;
  blockStorageEndpoint: string;
  nksEndpoint: string;
}

export async function resolveIaasTokenContext(opts: IaasResolverOpts): Promise<IaasTokenContext>
```

### 추출하지 않을 것

다음은 공통 helper로 묶지 않는다.

- `new InstanceClient(...)`
- `new NetworkClient(...)`
- `new BlockStorageClient(...)`
- `new NksClient(...)`
- NKS의 `OpenStack-API-Version: container-infra latest` header
- NKS command helper의 `readJsonFile`, `readTextFile`, 숫자 parser

이유:

- client constructor 인자가 서비스마다 다르다.
- NKS header는 `NksClient` 내부 책임이다.
- 인증 모델이 다른 Deploy, Log & Crash, NCR과 섞이면 안 된다.

## 구현 항목

### 1. 공통 helper 추가

- `src/commands/iaas.ts`
  - `IaasResolverOpts`
  - `IaasTokenContext`
  - `resolveIaasTokenContext(opts)`

`resolveIaasTokenContext`는 기존 네 helper의 profile/region/token 흐름을 그대로 옮긴다.
에러 메시지나 exit code를 새로 감싸지 않는다.
기존 `resolveProfileName`, `getIaasCredential`, `getIaasToken`의 에러 흐름을 보존한다.

### 2. 서비스별 helper 축소

- `src/commands/instance/helpers.ts`
  - `resolveIaasTokenContext`를 호출한다.
  - `InstanceClient(tokenId, computeEndpoint, imageEndpoint)` 생성만 남긴다.
- `src/commands/network/helpers.ts`
  - `NetworkClient(tokenId, networkEndpoint)` 생성만 남긴다.
- `src/commands/volume/helpers.ts`
  - `BlockStorageClient(tokenId, blockStorageEndpoint)` 생성만 남긴다.
- `src/commands/nks/helpers.ts`
  - `NksClient(tokenId, nksEndpoint)` 생성만 남긴다.
  - 파일 읽기 helper와 숫자 parser는 그대로 둔다.

### 3. 테스트 추가

- `src/commands/iaas.test.ts`

테스트 케이스:

- `profile`이 없으면 `resolveProfileName(undefined)` 결과를 사용한다.
- `profile`이 있으면 해당 값을 `resolveProfileName(profile)`에 전달한다.
- `region`이 있으면 `getIaasToken`에 전달되는 credential의 `region`을 override한다.
- `region`이 없으면 자격증명 region을 그대로 사용한다.
- 반환값에 `profileName`, `tokenId`, 모든 endpoint가 포함된다.

mock 대상:

- `src/config/credentials.ts`
- `src/api/keystone.ts`

### 4. 문서 갱신

- `docs/code-architecture.md`
  - `commands/iaas.ts` 항목을 추가한다.
  - 설명: IaaS command helper 공통 profile/region/token context 해석.

사용자-facing 명령 surface는 바뀌지 않으므로 `README.md`, `skills/nhncloud-cli/SKILL.md`, `docs/flow.md`, `AGENTS.md` 명령 목록은 갱신하지 않는다.
새 ADR도 작성하지 않는다.

### 5. task 상태

- `tasks/033-maintenance-iaas-token-context/index.json`
  - Phase 1 완료 시 `status: completed`
  - phase status를 `completed`로 갱신

## 회피 항목

구현 전후로 다음 pitfall을 읽고 self-check한다.

- `.agents/skills/_shared/pitfalls/code-review/duplicate-map-block-no-helper.md`
- `.agents/skills/_shared/pitfalls/plan/file-scope-inaccurate.md`
- `.agents/skills/_shared/pitfalls/plan/type-change-tsc-missing.md`
- `.agents/skills/_shared/pitfalls/code-review/adjacent-command-pattern-missing.md`

## 검증

자동 검증:

```bash
pnpm tsc --noEmit
pnpm build
pnpm test
rg -n "resolveProfileName|getIaasCredential|getIaasToken|effectiveIaas" src/commands/{instance,network,volume,nks}/helpers.ts
rg -n "resolveIaasTokenContext" src/commands
```

기대값:

- `pnpm tsc --noEmit`, `pnpm build`, `pnpm test` 모두 exit 0.
- 첫 번째 `rg`는 0건이어야 한다.
- 두 번째 `rg`는 `src/commands/iaas.ts`와 네 서비스 helper에서 확인된다.
- `src/commands/nks/helpers.ts`의 `readJsonFile`, `readTextFile`, 숫자 parser는 유지된다.
- `src/services/nks/client.ts`의 `OpenStack-API-Version` header는 그대로 유지된다.

## 변경 파일

- `src/commands/iaas.ts`
- `src/commands/iaas.test.ts`
- `src/commands/instance/helpers.ts`
- `src/commands/network/helpers.ts`
- `src/commands/volume/helpers.ts`
- `src/commands/nks/helpers.ts`
- `docs/code-architecture.md`
- `tasks/033-maintenance-iaas-token-context/index.json`

## 커밋

```bash
git commit -m "refactor(commands): share iaas token context resolution"
```
