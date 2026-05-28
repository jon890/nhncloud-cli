# Phase 3: config/credentials 계층 (profile 해석)

## 컨텍스트

nhncloud-cli 의 `nhncloud logncrash search` 구현 중. Phase 1(utils) + Phase 2(api 공통) 완료.
이 phase 는 profile 기반 자격증명 로드 계층을 만든다. AWS 방식 — 비밀(credentials)과 설정(config) 분리.

먼저 아래 문서를 읽어라:

- `docs/data-schema.md` — `~/.nhncloud/` 파일 구조, credentials/config 스키마, profile 해석 순서
- `docs/adr.md` — ADR-003 (JSON + 분리), ADR-004 (서비스별 블록)
- `CLAUDE.md` — profile 해석 우선순위

기존 코드 참조 (dooray-cli, 읽기만):

- `/Users/nhn/personal/dooray-cli/src/config/store.ts` — config 로드 + getConfigOrThrow 패턴
- `.claude/skills/_shared/common-pitfalls.md` CLI4 (mode 0600), CLI5 (JSON.parse 타입가드)

이전 phase 산출물:

- `src/utils/errors.ts` (`NhnCloudCliError`), `src/utils/exit-codes.ts` (`EXIT_CONFIG_ERROR`)

## 목표

src/config/ 에 타입 + 자격증명 로더 작성.

## 작업 목록

- [ ] `src/config/types.ts`
  - `interface ServiceCredential { appkey: string; secret?: string; token?: string }`
  - `interface Credentials { version: 1; profiles: Record<string, Record<string, ServiceCredential>> }`
  - `interface Config { version: 1; defaultProfile?: string }`
- [ ] `src/config/credentials.ts`
  - 경로: `~/.nhncloud/credentials.json`, `~/.nhncloud/config.json`
  - `resolveProfileName(cliProfile?: string): Promise<string>` — `--profile` > `NHNCLOUD_PROFILE` env > `config.defaultProfile` > `"default"`
  - `getServiceCredential(service: string, profileName: string): Promise<ServiceCredential>`
    - credentials.json 로드 (JSON.parse 후 타입 가드 — CLI5)
    - 해당 profile/service 블록 없으면 `NhnCloudCliError(설정 안내, EXIT_CONFIG_ERROR)`
  - 파일 쓰기 기능을 추가한다면 `{ mode: 0o600 }` (CLI4) — 본 phase 는 읽기만이라 미해당

## 성공 기준

```bash
# cwd: <레포 루트>
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l   # 기대: 0
ls src/config/types.ts src/config/credentials.ts
grep -c "NHNCLOUD_PROFILE" src/config/credentials.ts        # 기대: >=1 (env 폴백)
grep -c "EXIT_CONFIG_ERROR" src/config/credentials.ts       # 기대: >=1
# JSON.parse 후 즉시 as 단언 금지 (CLI5)
grep -nE "JSON\.parse.*\)\s+as\b" src/config/credentials.ts # 기대: 0건
```

## 주의사항

- profile 해석 순서를 정확히 (`--profile` > env > config > default).
- 파일 없음/JSON 파싱 실패는 친절한 설정 안내 메시지 + `EXIT_CONFIG_ERROR`.
- JSON.parse 결과는 타입 가드 함수로 검증 후 사용 (즉시 `as` 단언 금지).

## Blocked 조건

- 없음 (자기완결적). 모호하면 docs/data-schema.md 우선.
