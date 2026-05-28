# Phase 1: OAuth 토큰 교환 + 단기 캐시

## 컨텍스트

nhncloud-cli 에 `nhncloud deploy` 명령군을 추가 중이다. Deploy 인증은 정적 토큰이 아니라 OAuth `client_credentials` 로 교환하는 단기 Bearer 토큰이다.
이 task 는 **task 001 (logncrash search) 이 만든 공통 인프라에 의존**한다 — `src/utils/errors.ts`(`NhnCloudCliError`), `src/utils/exit-codes.ts`, `src/api/httpError.ts` 가 이미 있다고 가정. 없으면 BLOCKED.

이 phase 는 OAuth 토큰 교환 + 단기 캐시를 만든다.

먼저 아래 문서를 읽어라:

- `docs/adr.md` — ADR-007 (OAuth 교환 + 캐시, 엔드포인트 함정)
- `docs/data-schema.md` — deploy credentials 블록(UAK), 토큰 캐시 파일 구조
- `CLAUDE.md` — NHN 인증 모델 표

실사용 참조 (읽기만 — OAuth 흐름의 정답):

- `/Users/nhn/projects/ai-playground-docu-parser/scripts/nhn-deploy-trigger.sh` (1~76행 — Basic 인증 + token/create + access_token 추출)

기존 코드 참조:

- `src/api/httpError.ts` (`toNhnCloudCliError`), `src/utils/errors.ts`, `src/utils/exit-codes.ts`

## 목표

UAK → access_token 교환 + 만료 전 재사용 캐시.

## 작업 목록

- [ ] `src/cache/token-store.ts`
  - 경로 `~/.nhncloud/cache/deploy-token-<profile>.json`
  - `readToken(profile): Promise<{accessToken, expiresAt} | null>` — 파일 없음/만료/파싱실패 시 null
  - `writeToken(profile, accessToken, expiresAt): Promise<void>` — `{ mode: 0o600 }`, 디렉터리 자동 생성
- [ ] `src/api/oauth.ts`
  - `getAccessToken(profile, uakId, uakSecret): Promise<string>`
  - 캐시 토큰이 만료 전이면 그대로 반환
  - 아니면 `POST https://oauth.api.nhncloudservice.com/oauth2/token/create`
    - 헤더 `Authorization: Basic base64(uakId:uakSecret)`, `Content-Type: application/x-www-form-urlencoded`
    - body `grant_type=client_credentials`
    - 응답에서 `access_token` + 만료(`expires_in` 초 → expiresAt) 추출, `writeToken` 후 반환
  - 실패는 `toNhnCloudCliError` 통과 (401/403 → AUTH)

## 성공 기준

```bash
# cwd: /Users/nhn/personal/nhncloud-cli
test -f src/utils/errors.ts || echo "PHASE_BLOCKED: task 001 인프라 없음"
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l   # 기대: 0
ls src/api/oauth.ts src/cache/token-store.ts
grep -c "oauth.api.nhncloudservice.com/oauth2/token/create" src/api/oauth.ts   # 기대: 1
grep -c "client_credentials" src/api/oauth.ts        # 기대: 1
grep -c "mode: 0o600" src/cache/token-store.ts       # 기대: >=1
```

## 주의사항

- HTTP 는 `ky` 전용.
- 토큰 캐시 파일은 비밀 — 반드시 `mode: 0o600`.
- 만료 판정에 약간의 여유(예: 60초 buffer)를 둬 경계 만료 회피.
- JSON.parse 결과 즉시 `as` 단언 금지 — 타입 가드 (common-pitfalls CLI5).

## Blocked 조건

- task 001 공통 인프라(`src/utils/errors.ts` 등) 부재 시: `PHASE_BLOCKED: task 001 먼저 실행 필요`
