# Phase 1: UAK 모델 리팩토링 (types + deploy 자격증명 로딩)

## 컨텍스트

nhncloud-cli 에 `nhncloud configure` 마법사를 추가하는 task 다. logncrash(task 001) + deploy(task 002) 는 이미 구현·머지되어 있다.
이 phase 는 UAK 를 **profile 공통 `userAccessKey`** 로 끌어올리는 리팩토링이다 (ADR-004 갱신). 현재 deploy 는 `getServiceCredential("deploy")` 로 `uakId`/`uakSecret` 을 읽는데, 이를 profile 공통 UAK 로 바꾼다.

먼저 아래 문서를 읽어라:

- `docs/adr.md` — ADR-004 (profile 공통 UAK + 서비스 블록), ADR-007 (OAuth)
- `docs/data-schema.md` — credentials.json 새 구조 (`profiles.X.userAccessKey` + 서비스 블록)

기존 코드 참조 (현재 구현 — 반드시 먼저 grep 으로 시그니처 확인):

- `src/config/types.ts` — `Credentials` / `ServiceCredential`
- `src/config/credentials.ts` — `getServiceCredential` / `resolveProfileName` / `getDeployTarget`
- deploy 의 UAK 사용처: `grep -rn "uakId\|uakSecret\|getServiceCredential" src/`

## 목표

타입과 자격증명 로딩을 profile 공통 UAK 모델로 전환하되 **deploy 동작을 유지**한다.

## 작업 목록

- [ ] `src/config/types.ts`
  - `interface UserAccessKey { id: string; secret: string }`
  - profile 구조를 `userAccessKey?: UserAccessKey` + 서비스 블록 **flat sibling** 으로 표현
    - **단정 (data-schema.md 가 단일 소스)**: on-disk JSON 은 `profiles.<name>.{ userAccessKey, logncrash, ... }` flat 구조다. nested `services:` 래퍼 도입 금지 — 이미 commit 된 `docs/data-schema.md` 및 기존 `getServiceCredential` 읽기 경로와 불일치하게 된다.
    - 타입 예: `interface ProfileCredentials { userAccessKey?: UserAccessKey; [service: string]: UserAccessKey | ServiceCredential | undefined }`
  - `ServiceCredential` 에서 `uakId`/`uakSecret`/`token` 제거 (UAK 는 분리됨, logncrash 는 appkey/secret 만)
- [ ] `src/config/credentials.ts`
  - `getUserAccessKey(profileName): Promise<UserAccessKey>` — 없으면 `NhnCloudCliError(EXIT_CONFIG_ERROR, configure 안내)`
  - `getServiceCredential` 은 서비스 블록 전용 유지 (userAccessKey 키 제외)
- [ ] deploy UAK 사용처 전환
  - deploy 가 `getServiceCredential("deploy")` 대신 `getUserAccessKey(profile)` 사용하도록 수정
  - `grep -rn "uakId\|uakSecret" src/services/deploy src/commands/deploy` 결과 모두 반영

## 성공 기준

```bash
# cwd: <레포 루트>
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l   # 기대: 0
pnpm run build
grep -c "getUserAccessKey" src/config/credentials.ts   # 기대: >=1
grep -rn "userAccessKey" src/config/types.ts            # 기대: >=1
# deploy 가 더 이상 deploy 서비스 블록에서 UAK 를 읽지 않음
grep -rn "getServiceCredential(\"deploy\"\|getServiceCredential('deploy'" src/   # 기대: 0건
# 기존 ServiceCredential 의 uak 필드 제거 확인
grep -c "uakId" src/config/types.ts   # 기대: 0
```

## 주의사항

- **deploy 동작 유지가 핵심** — 리팩토링 후에도 deploy 가 UAK 로 OAuth 교환하는 흐름은 동일.
- 기존 사용자 `credentials.json` (구 `deploy.{uakId,uakSecret}` 형태) 은 새 구조와 다르다. 본 phase 는 코드 형태만 바꾸고, 마이그레이션은 configure(phase 4) 가 새 형태로 쓰는 것으로 해소 — 구 형태 fallback 읽기는 추가하지 않는다 (back-compat shim 금지).
  - **영향 (의도된 결정)**: 구 `deploy.{uakId,uakSecret}` 로 설정한 기존 사용자는 리팩토링 후 deploy 가 즉시 깨진다. `getUserAccessKey` 가 configure 안내를 throw 하므로 재configure 로 복구한다. v0.1.0 pre-release 라 수용. 기존 테스트 fixture 가 구 형태를 쓰면 새 형태로 갱신 필요.
- JSON.parse 결과 타입 가드 유지 (common-pitfalls CLI5).

## Blocked 조건

- logncrash/deploy 구현(`src/services/deploy/`) 부재 시: `PHASE_BLOCKED: task 001/002 먼저 필요`
