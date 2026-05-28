# Phase 2: deploy target config 로딩 + endpoints 확장

## 컨텍스트

`nhncloud deploy` 명령군 추가 중. Phase 1 에서 OAuth 토큰 교환·캐시(`src/api/oauth.ts`, `src/cache/token-store.ts`) 완료.
이 phase 는 배포 좌표(named target)를 config.json 에서 로드하고, 엔드포인트 맵에 deploy/oauth 를 정리한다. task 001 의 `src/config/credentials.ts`, `src/api/endpoints.ts` 가 있다고 가정.

먼저 아래 문서를 읽어라:

- `docs/data-schema.md` — config.json `deploy.targets.<name>` 구조, credentials deploy(UAK) 블록
- `docs/adr.md` — ADR-008 (named target + UAK/좌표 분리), ADR-005 (엔드포인트 맵)

기존 코드 참조:

- `src/config/credentials.ts` (profile 해석, `getServiceCredential`), `src/config/types.ts`
- `src/api/endpoints.ts` (`endpointFor`)

## 목표

deploy target 로딩 + UAK 자격증명 로딩 + 엔드포인트 정리.

## 작업 목록

- [ ] `src/config/types.ts` 확장
  - `interface DeployTarget { appKey: string; artifactId: string; serverGroupId: string; scenarioIds: string }`
  - `Config` 에 `deploy?: { targets?: Record<string, DeployTarget> }`
  - `ServiceCredential` 에 `uakId?: string`, `uakSecret?: string` 두 optional 필드를 **신규 추가**한다 (현재 타입은 `{ appkey: string; secret?; token? }` 뿐 — uakId/uakSecret 부재).
  - `appkey` 는 현재 필수(`appkey: string`)인데 deploy 자격증명 블록(data-schema.md)은 `{ uakId, uakSecret }` 만 가지고 appkey 가 없다. `appkey?: string` 으로 **optional 로 완화**한다 (logncrash 블록은 여전히 appkey 를 채우므로 런타임 동작 불변).
- [ ] `src/config/credentials.ts` 확장
  - `getDeployTarget(name: string): Promise<DeployTarget>` — config.json 의 `deploy.targets[name]`. 없으면 `NhnCloudCliError(사용 가능 target 목록 안내 메시지, EXIT_PARAM_ERROR)` (인자 순서: message, exitCode)
  - deploy UAK 로딩은 기존 `getServiceCredential("deploy", profile)` 재사용 — 시그니처는 **2인자 `(service, profileName)`**. 반환된 cred 의 `uakId`/`uakSecret` 가 비었으면 설정 안내 에러.
- [ ] `src/api/endpoints.ts` 정리
  - `deploy` → `https://api-deploy.nhncloudservice.com` (api-tcd 아님)
  - oauth 는 `src/api/oauth.ts` 가 직접 상수 보유 (endpoints 맵에는 deploy API 만)

## 성공 기준

```bash
# cwd: <레포 루트 (worktree)>
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l   # 기대: 0
grep -c "api-deploy.nhncloudservice.com" src/api/endpoints.ts   # 기대: 1
grep -c "getDeployTarget" src/config/credentials.ts             # 기대: >=1
grep -c "DeployTarget" src/config/types.ts                      # 기대: >=1
# api-tcd 잔존 없어야 함
grep -c "api-tcd" src/api/endpoints.ts   # 기대: 0
```

## 주의사항

- 좌표는 config(비밀 아님), UAK 만 credentials(비밀) — 혼재 금지 (ADR-008).
- target 미존재 에러는 사용 가능 target 이름 목록을 안내 (AI/사용자 친화).
- JSON.parse 결과 타입 가드 (CLI5).

## Blocked 조건

- task 001 의 `src/config/credentials.ts` 부재 시: `PHASE_BLOCKED: task 001 먼저 실행 필요`
