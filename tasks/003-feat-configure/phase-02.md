# Phase 2: credentials/config 머지 쓰기 helper

## 컨텍스트

`nhncloud configure` 마법사 추가 중. Phase 1 에서 profile 공통 `userAccessKey` 모델로 타입·로딩을 리팩토링했다.
이 phase 는 `~/.nhncloud/` 파일을 **머지 쓰기**하는 helper 를 만든다 (configure 가 사용).

먼저 아래 문서를 읽어라:

- `docs/data-schema.md` — credentials.json / config.json 구조, mode 0600
- `docs/adr.md` — ADR-003 (파일 분리), ADR-009 (머지·all-or-nothing)

기존 코드 참조:

- `src/config/credentials.ts` (읽기 helper — 같은 파일에 쓰기 추가), `src/config/types.ts`
- `src/cache/token-store.ts` (mode 0600 쓰기 패턴 참조), `.claude/skills/_shared/common-pitfalls.md` CLI4

## 목표

기존 값 보존 머지 + 0600 쓰기 helper.

## 작업 목록

- [ ] `src/config/credentials.ts` 에 쓰기 helper 추가
  - `setUserAccessKey(profileName, uak: UserAccessKey): Promise<void>`
  - `setServiceCredential(profileName, service, cred: ServiceCredential): Promise<void>`
  - 공통 내부 `loadCredentials()` (없으면 `{version:1,profiles:{}}`) + `saveCredentials(creds)` (`{ mode: 0o600 }`, 디렉터리 자동 생성)
  - **머지 원칙**: 같은 profile 의 다른 서비스 / 다른 profile 은 보존. 해당 키만 갱신
- [ ] (선택) config 쓰기가 필요하면 `saveConfig` 도 동일 패턴 (deploy target 은 본 task scope 외 — 추가 금지)

## 성공 기준

```bash
# cwd: <레포 루트>
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l   # 기대: 0
grep -cE "setUserAccessKey|setServiceCredential" src/config/credentials.ts   # 기대: >=2
grep -c "mode: 0o600" src/config/credentials.ts   # 기대: >=1
# 머지 — 쓰기 전 기존 로드 후 spread (전체 덮어쓰기 아님)
grep -nE "loadCredentials|\.\.\.cred" src/config/credentials.ts   # 기대: >=1
```

## 주의사항

- 비밀 파일은 반드시 `{ mode: 0o600 }`. 기존 파일이 이미 있으면 권한 유지·재설정.
- 머지 쓰기 — 전체 객체 덮어쓰기 금지 (다른 profile/서비스 유실 방지).
- atomic 이 필요하면 temp+rename, 단 과설계 금지 — 단일 사용자 CLI 라 직접 write + mode 로 충분.

## Blocked 조건

- 없음 (Phase 1 산출물 기반 자기완결).
