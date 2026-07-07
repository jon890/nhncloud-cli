# Phase 01 — verifyNcs + configure ncs 블록 + UAK 재사용 + validate 통일

## 목표

configure 를 일관 규칙(각 자격증명 블록 = confirm+입력 / validate / flag / verify / 저장)에 맞추고 NCS 를 추가한다.

- 검증: `pnpm tsc --noEmit`, `pnpm run build`, `pnpm test`.
- help: `node dist/index.js configure --help` stdout 에 `--ncs-appkey` 포함.
- 자격증명 가능 시 실측: `nhncloud configure --profile <p> --uak-id .. --ncs-appkey ..` 가 ncs 블록을 저장하고 verify 를 수행한다.

## 선행

`profile = 프로젝트` 모델(모델1)이다 — 스키마를 바꾸지 않는다.
`ncs` 서비스 블록(`ServiceCredential.appkey`)은 이미 `config/types.ts` 인덱스 시그니처로 허용된다.
`docs/flow.md` configure 흐름에 이번 결정이 선반영돼 있으니 그 흐름대로 구현한다.

## 구현 항목

### 1. verifyNcs (`src/commands/configure-verify.ts`)

`verifyNcs(uak: UserAccessKey, appkey: string): Promise<boolean>` 추가.

**exemplar 는 `verifyNcr` 이 아니라 `verifyUserAccessKey` 다** — NCS 는 OAuth 토큰 인증(ADR-020), NCR 은 정적 UAK(ADR-016)라 인증 모델이 다르다.
`NcsClient` 생성자는 `(accessToken: string, region: string, appKey: string)` (src/services/ncs/client.ts:136) — id/secret 이 아니라 **OAuth access_token 이 먼저 필요**하다. `new NcsClient(uak.id, uak.secret, "kr1")` 로 흉내내면 tsc 는 통과하나 region="<secret>"·appKey="kr1" 로 런타임 의미가 깨진다(mock 테스트로 안 잡힘 — function-signature-unverified pitfall).

- `appkey` 빈값이면 `false`.
- **캐시 우회 필수** — `verifyUserAccessKey` 와 동일하게 `getAccessToken("__verify__", uak.id, uak.secret, true)` (forceRefresh=true, `__verify__` profile). 기본값(cache-first, 실제 profile 명)으로 호출하면 틀린 UAK 인데도 옛 유효 토큰 캐시 히트로 false-positive 발생(cache-bypass-in-verify-helper pitfall, PR3).
- 정확한 구성:
  ```ts
  const token = await getAccessToken("__verify__", uak.id, uak.secret, true);
  const client = new NcsClient(token, "kr1", appkey);
  await client.listTemplates({ size: 1 });
  ```
- 401/403(`EXIT_AUTH_ERROR`)이면 `false`, 그 외는 throw.
- 주석에 ncr 과 동일한 **kr1 가정** 한계를 남긴다.

### 2. configure ncs 블록 (`src/commands/configure.ts`)

- `ConfigureOptions` 에 `ncsAppkey?: string` 추가.
- 대화형 `runInteractive`: ncr 블록 바로 뒤에 ncs 블록 추가.
  - `confirm("ncs 자격증명도 설정하시겠습니까?", default false)`.
  - `input("ncs appkey", validate: 빈값 거부)` — ncr 과 동일한 validate.
- 비대화형 `runNonInteractive`: `opts.ncsAppkey?.trim()` 으로 `{ appkey }` 구성. appkey 는 secret 이 아니므로 env 불요.
- `saveAndVerify` 시그니처에 `ncs: ServiceCredential | undefined` 추가.
  - verify: `ncs` 있으면 `uak` 존재 시 `verifyNcs(uak, ncs.appkey ?? "")`, 없으면 ncr 과 동일하게 skip 경고(interactive-warning-mismatch 회피 — ncr 문구와 대칭).
  - 저장: `setServiceCredential(profileName, "ncs", ncs)`.
- `hasFlag` 판정에 `opts.ncsAppkey` 추가.
- command 정의에 `.option("--ncs-appkey <key>", "ncs appkey (비대화형)")` 추가.
- 비대화형 "하나가 필요합니다" 안내 메시지에 `--ncs-appkey` 도 포함.

### 3. logncrash appkey validate 통일 (`src/commands/configure.ts`)

- 대화형 logncrash `input("logncrash appkey")` 에 ncr/ncs 와 동일한 `validate: (v) => v.trim().length > 0 || "..."` 추가.

### 4. UAK 재사용 (대화형만) (`src/commands/configure.ts`)

- profile 이름 입력 후, 다른 profile 에 `userAccessKey` 가 있으면 `confirm("기존 profile <name> 의 UAK 를 재사용하시겠습니까?", default true)` 를 먼저 묻는다.
  - 여러 profile 에 UAK 가 있으면 `select` 로 어느 profile 의 UAK 를 쓸지 고른다.
  - 재사용 선택 시 UAK 입력 프롬프트를 건너뛰고 그 UAK 를 사용.
  - 재사용 안 함 또는 UAK 보유 profile 이 없으면 기존대로 id/secret 입력.
- profile UAK 조회는 `config/credentials.ts` 에 읽기 helper 가 없으면 최소 추가(예: `listProfilesWithUak(): Promise<string[]>` + `getUserAccessKey`). 비대화형 경로는 이 로직을 타지 않는다.

### 5. tests

- `src/commands/configure-verify.test.ts` (있으면 확장, 없으면 신규): `verifyNcs` 성공(true)/401(false)/빈 appkey(false) — `NcsClient` ky mock.
- UAK 재사용 helper 가 순수 함수면 단위 테스트. 대화형 프롬프트 자체는 테스트하지 않는다.

### 6. task 상태

- `tasks/038-feat-configure-ncs-consistency/index.json` Phase 1 `completed`, `current_phase` 2.

## 회피 항목

- `grep -nE "NhnCloudCliError\([^,]+,\s*[0-9]+" src/commands/configure.ts src/commands/configure-verify.ts` → 0건 (리터럴 exit code 금지, `EXIT_*` 상수).
- verifyNcs 가 캐시 우회(`forceRefresh=true`, `__verify__` profile)로 토큰 교환하는지 — `grep -n "forceRefresh\|__verify__" src/commands/configure-verify.ts` 에 verifyNcs 라인 포함 (cache-bypass-in-verify-helper 회피).
- ncs verify skip 경고 문구가 ncr 문구와 대칭인지 확인 (interactive-warning-mismatch 회피).
- 대화형/비대화형 양쪽에 ncs 가 추가됐는지 (noninteractive-interactive-duplication — 저장/verify 는 saveAndVerify 로 공유).
- verify 함수가 stderr 출력·프롬프트 없이 boolean 만 반환하는지 (io-throw-bundled 회피).

## 완료 조건

1. `pnpm tsc --noEmit` 0.
2. `pnpm run build` 정상.
3. `pnpm test` 정상(verifyNcs 성공/401/빈 appkey 테스트 포함).
4. `node dist/index.js configure --help` stdout 에 `--ncs-appkey` 포함.
5. `grep -n "forceRefresh" src/commands/configure-verify.ts` 에 verifyNcs 의 캐시 우회 라인 존재.
6. index.json Phase 2 대기로 갱신.

## 변경 파일 (정확)

- `src/commands/configure-verify.ts`
- `src/commands/configure.ts`
- `src/config/credentials.ts` (UAK 보유 profile 조회 helper — 필요 시)
- `src/commands/configure-verify.test.ts`
- `tasks/038-feat-configure-ncs-consistency/index.json`

## 커밋

```bash
git commit -m "feat(configure): add ncs credential + verifyNcs + UAK reuse + logncrash validate"
```
