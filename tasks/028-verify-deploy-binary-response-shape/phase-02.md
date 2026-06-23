# Phase 02 — 타입·가드·출력 정합화

## 컨텍스트

Phase 01에서 Deploy `binary-groups`와 `binaries` 실제 응답의 필드 필수성을 결정했다.
이 phase는 그 결정만 반영한다.
새로운 API 추측을 추가하지 않는다.

먼저 아래 문서를 읽어라.

- `AGENTS.md`
- `docs/adr/015-deploy-binary-transfer.md`
- `tasks/028-verify-deploy-binary-response-shape/phase-01.md`

기존 코드 참조:

- `src/services/deploy/types.ts`
- `src/services/deploy/client.ts`
- `src/commands/deploy/binary-groups.ts`
- `src/commands/deploy/binaries.ts`

## 목표

실측 결정에 맞게 TypeScript 타입, 런타임 타입 가드, 표 출력 fallback, 테스트를 정합화한다.

## 작업 목록

### 1. 타입 반영

- [x] `src/services/deploy/types.ts`의 `BinaryGroup`과 `Binary` 필드를 실측 필수성에 맞춘다.
- [x] 누락 가능 필드는 optional로 표시한다.
- [x] 필수 필드는 `string` 또는 `number | string` 등 실제 응답 타입과 일치시킨다.

### 2. 타입 가드 반영

- [x] `src/services/deploy/client.ts`의 `isBinaryGroup`과 `isBinary`가 타입 정의와 같은 필수성을 검증하게 한다.
- [x] optional 필드는 타입만 맞으면 수용하고, 누락을 오류로 보지 않는다.
- [x] 가드 오류 메시지는 어떤 배열 또는 필드가 문제인지 알 수 있게 유지한다.

### 3. 출력 정리

- [x] optional 필드는 `src/commands/deploy/binary-groups.ts`와 `src/commands/deploy/binaries.ts`에서 빈 문자열 fallback을 유지한다.
- [x] 필수 필드는 불필요한 `?? ""`를 제거해 타입과 출력 계약을 맞춘다.

### 4. 테스트 추가

- [x] 기존 테스트 패턴에 맞춰 Deploy client 가드 테스트를 추가하거나 보강한다.
- [x] optional 필드 누락 케이스와 잘못된 필수 필드 케이스를 각각 검증한다.

## 반영 결과

- 반영 커밋: `b319c14 fix(deploy): accept null binary group description`
- `BinaryGroup.description`을 `string | null`로 완화했다.
- 런타임 가드는 `description` 누락, `null`, `string`을 수용하고 다른 타입은 거부한다.
- 출력은 기존 빈 문자열 fallback을 유지한다.

## 성공 기준

- [x] `pnpm build`가 통과한다.
- [x] `bunx tsc --noEmit` 또는 repo 표준 타입 체크가 통과한다.
- [x] 추가한 테스트가 통과한다.
- [x] `rg -n "undefined\\\" 박힘|실측 후|진단 노트" src/services/deploy src/commands/deploy docs/adr/015-deploy-binary-transfer.md`로 stale 진단 문구가 남지 않았는지 확인한다.
- [x] `git diff --check`가 통과한다.

## 주의사항

- Phase 01 결정과 다른 방향으로 임의 변경하지 않는다.
- 실측 raw 값을 테스트 fixture에 그대로 넣지 않는다.
- 공개 repo 금지 식별자 검증 grep을 통과해야 한다.

## Blocked 조건

- Phase 01에 실측 결정이 없으면 `PHASE_BLOCKED: Phase 01 실측 결정 필요`.
