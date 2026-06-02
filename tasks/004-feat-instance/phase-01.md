# Phase 1: iaas 자격증명 타입 + configure 확장

## 컨텍스트

`nhncloud instance` (Compute / OpenStack Nova v2 호환) 명령군을 추가하는 task. logncrash/deploy/configure 는 이미 구현·머지되어 있다.
이 phase 는 새 자격증명 블록 `iaas` 를 타입·로더에 추가하고, `configure` 마법사가 입력받게 확장한다.

먼저 아래 문서를 읽어라:

- `docs/data-schema.md` — credentials.iaas 블록 (`tenantId`/`username`/`password`/`region`), 토큰 캐시 파일명
- `docs/adr.md` — ADR-004 (자격증명 블록), ADR-009 (configure), ADR-010 (Keystone 인증)
- `CLAUDE.md` — Instance 인증 모델 행

기존 코드 참조 (반드시 grep 으로 시그니처 확인):

- `src/config/types.ts` (`Credentials`/`UserAccessKey`/`ProfileCredentials`)
- `src/config/credentials.ts` (`getServiceCredential`/`getUserAccessKey`/`setServiceCredential`/`resolveProfileName`)
- `src/commands/configure.ts` (대화형 + flag 패턴 — iaas 입력 흐름을 동일하게 추가)
- `src/commands/configure-verify.ts` (verify helper — phase 3 에서 verifyIaas 추가 예정, 본 phase 는 타입·configure 만)

## 목표

iaas 자격증명을 저장·로드할 수 있는 상태 + configure 가 입력 받을 수 있는 상태.

## 작업 목록

- [ ] `src/config/types.ts`
  - `interface IaasCredential { tenantId: string; username: string; password: string; region: string }`
  - `ProfileCredentials` 의 service 블록 union 에 `IaasCredential` 추가 (`userAccessKey | ServiceCredential | IaasCredential | undefined`)
- [ ] `src/config/credentials.ts`
  - `getIaasCredential(profileName): Promise<IaasCredential>` — 없거나 region 등 필드 누락 시 `NhnCloudCliError(EXIT_CONFIG_ERROR, configure 안내)`
  - `setIaasCredential(profileName, iaas: IaasCredential): Promise<void>` — 머지 저장 (`setServiceCredential` 패턴 따라)
  - `getServiceCredential` 의 `userAccessKey` 차단 가드에 `iaas` 도 추가 (`if (service === "userAccessKey" || service === "iaas") throw`)
- [ ] `src/commands/configure.ts` 확장
  - flag: `--iaas-tenant-id` `--iaas-username` `--iaas-password` `--iaas-region` (region 기본 `kr1`)
  - 환경변수 fallback: `NHNCLOUD_IAAS_PASSWORD` (password 만 — cmdline 노출 회피)
  - 비대화형: iaas flag 가 하나라도 있으면 iaas 블록 저장 시도
  - 대화형: `confirm "iaas 자격증명도 설정?"` 후 tenantId/username/password(password masked) + region select
  - 사용자 안내 — password 는 NHN 콘솔 IAM 의 API 비밀번호 (로그인 비번 아님)

## 성공 기준

```bash
# cwd: <레포 루트>
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l   # 기대: 0
pnpm run build
node dist/index.js configure --help 2>&1 | grep -cE "iaas-tenant-id|iaas-region"   # 기대: >=2
grep -c "IaasCredential" src/config/types.ts        # 기대: >=1
grep -c "getIaasCredential\|setIaasCredential" src/config/credentials.ts   # 기대: >=2
grep -c "NHNCLOUD_IAAS_PASSWORD" src/commands/configure.ts   # 기대: >=1
# 가드 — iaas 가 getServiceCredential 로 새지 않음
grep -A2 "service === \"userAccessKey\"" src/config/credentials.ts | grep -c "iaas"   # 기대: >=1
```

## 주의사항

- 비밀 파일은 mode 0600 유지 (`setServiceCredential` 의 머지 쓰기 helper 재사용).
- region 기본값 `kr1`. 유효 region 검증은 phase 2(keystone)에서 endpoint 맵으로 한다 — 본 phase 는 입력만.
- 사용자 안내 메시지에서 "API 비밀번호" 명시 (로그인 비번과 혼동 방지).
- common-pitfalls CLI4 (mode 0o600) / CLI5 (JSON.parse 후 가드) 준수.

## Blocked 조건

- logncrash/deploy/configure 구현(`src/config/credentials.ts` 등) 부재 시: `PHASE_BLOCKED: task 001~003 먼저 필요`
