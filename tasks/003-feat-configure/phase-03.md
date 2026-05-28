# Phase 3: 연결 테스트 helper (UAK OAuth + logncrash)

## 컨텍스트

`nhncloud configure` 마법사 추가 중. Phase 1(UAK 모델) + 2(쓰기 helper) 완료.
이 phase 는 입력한 자격증명을 저장 전 검증하는 연결 테스트 helper 를 만든다 (ADR-009).

먼저 아래 문서를 읽어라:

- `docs/flow.md` — configure "연결 테스트" 섹션 (UAK → OAuth 발급, logncrash → 최소 검색)
- `docs/adr.md` — ADR-007 (OAuth), ADR-009 (검증 정책)

기존 코드 참조:

- `src/api/oauth.ts` (`getAccessToken(profile, uakId, uakSecret)` — **캐시 우선** OAuth 교환. `readToken(profile)` 캐시가 유효하면 OAuth 호출 없이 반환), `src/services/logncrash/client.ts` (`LogncrashClient.search`)
- `src/api/httpError.ts` (`toNhnCloudCliError` — 401/403 → `EXIT_AUTH_ERROR` 매핑. verify 가 인증 실패 분기 전 이 매핑을 실제로 확인할 것, code-review-pitfalls 2-2)

**⚠️ 캐시 우회 필수 (검증 정확성 핵심)**:
`getAccessToken` 의 캐시는 **profile 키** 기준이지 UAK 값 기준이 아니다.
configure 재실행 시 (틀린 UAK 재입력) 직전 profile 의 유효 토큰이 캐시에 남아 있으면 **틀린 UAK 인데도 verify 가 false-positive 통과** → ADR-009 (검증 없으면 잘못된 키를 실제 명령에서야 발견) 를 무력화.
→ verify 는 **반드시 캐시를 우회**한다. `getAccessToken` 에 `forceRefresh?: boolean` 파라미터를 추가하고 (true 면 `readToken` 건너뛰고 OAuth 직접 호출 + 캐시 갱신 안 함), `verifyUserAccessKey` 는 `forceRefresh=true` 로 호출한다.

## 목표

UAK·logncrash 자격증명 유효성 검증 helper.

## 작업 목록

- [ ] `src/api/oauth.ts` — `getAccessToken` 에 `forceRefresh?: boolean` 파라미터 추가 (true 면 캐시 읽기·쓰기 건너뛰고 OAuth 직접 호출). 기존 deploy 호출은 인자 추가 없이 동작 유지 (default false).
- [ ] `src/commands/configure-verify.ts` (또는 configure 명령 내부 helper)
  - `verifyUserAccessKey(uak): Promise<boolean>` — `getAccessToken(<임시 profile>, uak.id, uak.secret, true)` (forceRefresh) 호출 성공 = true. 401/403 = false. 그 외 네트워크 에러는 throw (검증 불가 구분)
  - `verifyLogncrash(appkey, secret): Promise<boolean>` — 짧은 범위(예: 직전 1분) 검색 1회. 인증 실패(401/403) = false, 성공/빈결과 = true
- [ ] 검증 결과를 사람이 읽을 메시지로 (성공 ✓ / 실패 ✗) — stderr

## 성공 기준

```bash
# cwd: <레포 루트>
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l   # 기대: 0
grep -cE "verifyUserAccessKey|verifyLogncrash" src/   # 기대: >=2
# OAuth 검증은 기존 oauth helper 재사용 (중복 구현 금지)
grep -c "getAccessToken\|oauth" src/commands/configure-verify.ts 2>/dev/null || grep -rc "getAccessToken" src/commands/ | head -1
# 캐시 우회 — getAccessToken 에 forceRefresh 추가 + verify 가 true 로 호출
grep -c "forceRefresh" src/api/oauth.ts   # 기대: >=1
```

## 주의사항

- OAuth·검색 호출은 기존 helper(`getAccessToken`, `LogncrashClient`) 재사용 — 중복 HTTP 코드 금지.
- 인증 실패(401/403)와 네트워크 오류를 구분 — 전자는 "키 오류" false, 후자는 "검증 불가" throw.
- 검증은 read-only — 어떤 상태도 변경하지 않음.

## Blocked 조건

- `src/api/oauth.ts` 부재 시: `PHASE_BLOCKED: deploy(task 002) oauth helper 필요`
