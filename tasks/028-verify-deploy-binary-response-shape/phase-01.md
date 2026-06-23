# Phase 01 — Deploy binary 응답 실측과 결정 기록

## 컨텍스트

Issue #15는 PR #13 이후 남은 후속 작업이다.
현재 구현은 일부 필드 누락에 대해 출력부에서 `?? ""`로 방어하지만, 타입과 가드가 실제 응답 계약을 설명하지 못한다.

먼저 아래 문서를 읽어라.

- `AGENTS.md`
- `docs/adr/015-deploy-binary-transfer.md`
- `docs/flow.md`
- `tasks/011-feat-deploy-binaries/phase-01.md`

기존 코드 참조:

- `src/services/deploy/types.ts`
- `src/services/deploy/client.ts`
- `src/commands/deploy/binary-groups.ts`
- `src/commands/deploy/binaries.ts`

## 목표

Deploy `binary-groups`와 `binaries` 실제 응답에서 표 출력 필드가 필수인지 선택인지 확인한다.
확인 결과를 다음 phase에서 구현할 수 있게 명확한 결정으로 남긴다.

## 작업 목록

### 1. 실측 가능 여부 확인

- [ ] 현재 환경에 Deploy target과 UAK 자격증명이 있는지 확인한다.
- [ ] 자격증명이 없거나 실제 API 호출 권한이 없으면 `PHASE_BLOCKED`로 멈춘다.
- [ ] 실측 없이 타입을 추측해서 결정하지 않는다.

### 2. 실제 응답 수집

- [ ] `nhncloud deploy binary-groups <target> --json`으로 그룹 목록을 확인한다.
- [ ] 그룹 key 하나를 선택해 `nhncloud deploy binaries <target> --binary-group <key> --json`을 실행한다.
- [ ] 원본 응답 shape가 필요하면 code path에 임시 로그를 넣지 말고, 가능한 CLI JSON 출력과 API 문서를 우선 비교한다.

### 3. 민감 정보 제거

- [ ] 실측 내용을 문서에 남길 때 appKey, artifactId, host, 사용자 이름, 내부 도메인, 실제 파일명을 placeholder로 치환한다.
- [ ] 비밀값이나 사내 식별자는 task 파일, docs, test fixture에 남기지 않는다.

### 4. 결정 기록

- [ ] `docs/adr/015-deploy-binary-transfer.md`에 짧은 "실측 갱신" 단락을 추가한다.
- [ ] 아래 중 하나를 명시한다.
  - 모든 출력 필드가 항상 존재하면 가드를 엄격화한다.
  - 일부 필드가 누락 가능하면 TypeScript 타입을 optional로 완화하고 출력 fallback을 유지한다.
- [ ] `tasks/028-verify-deploy-binary-response-shape/phase-02.md`가 결정에 따라 바로 실행 가능하도록 필요한 필드 목록을 적는다.

## 실측 결과

- Deploy target 하나에서 `binaryGroups` 응답을 읽기 전용으로 확인했다.
- `binaryGroups`는 1건이었고, `description` 필드는 존재하지만 값이 `null`이었다.
- `key`, `name`, `regionCode`, `createDate`는 각각 number/string/string/string으로 확인했다.
- 같은 그룹의 `binaries` 조회는 `totalCount` number, `binaries` 빈 배열로 확인했다.
- 공개 repo에 남길 수 없으므로 실제 target, appKey, artifactId, 파일명, 사용자 식별자는 기록하지 않는다.

## 결정

- `BinaryGroup.description`은 `string | null`로 취급한다.
- `description` 누락도 방어적으로 수용하되, 값이 있으면 string 또는 null만 허용한다.
- `binaries` 개별 항목 필드 필수성은 표본이 없어 추가 완화하지 않는다.

## 성공 기준

- [x] 실측 근거 또는 `PHASE_BLOCKED` 사유가 남아 있다.
- [x] 실측 성공 시 필드 필수성 결정이 task에 남아 있다.
- [x] `git diff --check`가 통과한다.

## 주의사항

- 실측 없이 "항상 존재할 것"이라고 가정하지 않는다.
- raw 응답을 그대로 붙여넣지 않는다.
- 실제 target 이름, appKey, artifactId, 파일명, 사용자 이름을 공개 repo에 남기지 않는다.

## Blocked 조건

- Deploy target 또는 UAK 자격증명이 없으면 `PHASE_BLOCKED: Deploy 실측 자격증명 또는 target 필요`.
- API가 권한 오류를 반환하면 `PHASE_BLOCKED: Deploy API 권한 확인 필요`.
