# Phase 3: DeployClient (run + 읽기 3종)

## 컨텍스트

`nhncloud deploy` 명령군 추가 중. Phase 1(oauth/캐시) + 2(config target/endpoints) 완료.
이 phase 는 Deploy v2.1 API 를 호출하는 client 를 만든다 — 배포 실행 + 조회 3종.

먼저 아래 문서를 읽어라:

- `docs/flow.md` — deploy 명령 시그니처, run 동기/비동기, 인증 흐름
- `docs/adr.md` — ADR-007 (Bearer), ADR-006 (봉투)
- `CLAUDE.md` — Deploy 인증 모델

API 스펙 (Deploy v2.1, base `https://api-deploy.nhncloudservice.com`):

- 실행: `POST /api/v2.1/projects/{appKey}/artifacts/{artifactId}/server-group/{serverGroupId}/deploy`
  - body: `{ targetServerHostnames?: string(csv), concurrentNum: number, nextWhenFail: boolean, scenarioIds: string(csv), deployNote: string, async: boolean }`
  - `targetServerHostnames` 빈 값이면 필드 자체 제외 (서버그룹 전체)
- 아티팩트 목록: `GET /api/v2.1/projects/{appKey}/artifacts`
- 서버그룹 목록: `GET /api/v2.1/projects/{appKey}/artifacts/{artifactId}/server-groups`
- 배포 이력: `GET /api/v2.1/projects/{appKey}/artifacts/{artifactId}/deploy-histories`
- 공통 헤더: `X-NHN-AUTHORIZATION: Bearer {accessToken}`
- 응답: NHN 공통 봉투 `{ header:{isSuccessful,resultCode(문자열 가능),resultMessage}, body }`

기존 코드 참조:

- `src/api/oauth.ts` (`getAccessToken`), `src/api/endpoints.ts` (`endpointFor("deploy")`)
- `src/api/envelope.ts` (`unwrap`), `src/api/httpError.ts` (`toNhnCloudCliError`)
- 실사용 payload: `/Users/nhn/projects/ai-playground-docu-parser/scripts/nhn-deploy-trigger.sh` (81~114행)

## 목표

DeployClient — run + artifacts + serverGroups + histories.

## 작업 목록

- [ ] `src/services/deploy/types.ts`
  - `interface DeployRunParams { appKey; artifactId; serverGroupId; scenarioIds; targetHosts?; concurrentNum?; nextWhenFail?; deployNote?; async? }`
  - 응답 타입은 `Record<string, unknown>` 수준 (동적 — 강제 타입 금지)
- [ ] `src/services/deploy/client.ts`
  - `class DeployClient { constructor(accessToken: string) }`
  - `run(params)` — POST deploy. `targetHosts` 빈 값이면 `targetServerHostnames` 제외. `unwrap` 봉투 해제
  - `artifacts(appKey)` — GET
  - `serverGroups(appKey, artifactId)` — GET
  - `histories(appKey, artifactId)` — GET
  - 모든 호출 catch 는 `toNhnCloudCliError`

## 성공 기준

```bash
# cwd: /Users/nhn/personal/nhncloud-cli
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l   # 기대: 0
ls src/services/deploy/types.ts src/services/deploy/client.ts
grep -c "X-NHN-AUTHORIZATION" src/services/deploy/client.ts   # 기대: >=1
grep -c "server-group/" src/services/deploy/client.ts          # 기대: 1 (deploy 실행)
grep -cE "/server-groups|/deploy-histories|/artifacts" src/services/deploy/client.ts  # 기대: >=3
# 이중 단언 금지
grep -nE "as unknown as " src/services/deploy/   # 기대: 0건
```

## 주의사항

- `targetServerHostnames` 는 빈 값이면 payload 에서 **제외** (포함 시 빈 그룹 배포 위험) — 스크립트 동작과 동일.
- 동기 모드(async=false)는 응답이 오래 걸릴 수 있음 — ky timeout 을 넉넉히 (예: 600s) 설정.
- 봉투 판정은 `isSuccessful` (resultCode 가 "SUCCESS" 문자열일 수 있음 — 비교 금지).

## Blocked 조건

- Phase 1·2 산출물(`oauth.ts`/`endpoints.ts`) 부재 시: `PHASE_BLOCKED: 이전 phase 미완`
