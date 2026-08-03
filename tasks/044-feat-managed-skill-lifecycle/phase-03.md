# Phase 03 — skills 명령과 doctor 통합

**Execution profile**: standard
**Status**: completed

---

## 목표

관리형 상태 판정과 설치기를 `nhncloud skills` 명령군과 `doctor`에 연결하고 자동화 가능한 출력 계약을 제공한다.

**범위 외**: README와 공개 스킬 문서는 Phase 4에서 갱신한다.

---

## 실행 전제

```bash
# cwd: <repo root>
# branch: feat/044-feat-managed-skill-lifecycle
set -e
test "$(git branch --show-current)" = "feat/044-feat-managed-skill-lifecycle"
test -f src/skill/manager.ts
pnpm test -- src/skill/manager.test.ts
```

관리 저장소 테스트가 실패하면 명령 연결로 넘어가지 않는다.

---

## 확정 계약

- `nhncloud skills`와 `nhncloud skills status`는 같은 상태 조회다.
- `install`과 `update`는 같은 안전한 설치기를 호출하고 `--force`, 전역 `--json`, `--quiet`을 지원한다.
- 기본 출력과 오류·경고는 사람이 읽을 수 있게 하며 JSON·상태 토큰 데이터는 stdout에만 출력한다.
- 관리 저장소가 npx 임시 package source를 복사하므로 기존 npx 설치 거부는 제거한다.
- 기존 `uninstall` 명령은 유지하고 활성 링크만 제거한다.

---

## 작업 항목 (4)

### 1. skills 상태 출력

`src/commands/skills.ts`가 `createSkillManagerContext`와 `inspectSkill`을 사용하게 바꾼다.
기본 출력은 상태, 현재 버전, 설치 버전, 링크 대상, 설치 경로와 복구 방법을 보여준다.
`--json`은 상태 객체, `--quiet`은 상태 토큰 하나만 출력한다.

### 2. install·update·uninstall 연결

`skills install`과 새 `skills update`에 `--force`를 제공하고 같은 설치 함수를 호출한다.
`current`는 성공 no-op으로 표시하고 변경 시 이전·현재 상태와 백업 경로를 출력 모드에 맞춰 제공한다.
`skills uninstall`은 manager의 제거 함수를 호출하며 관리 저장소 보존을 안내한다.

### 3. doctor 통합

`src/commands/doctor.ts`가 별도 링크 존재 검사를 제거하고 `inspectSkill` 결과를 사용한다.
`current`만 정상으로 표시하고 나머지 상태는 `skills install`, `skills update`, `skills update --force` 중 정확한 복구 명령을 안내한다.
명령 전환이 끝나면 대체된 `src/utils/skill-install.ts`와 `src/utils/skill-install.test.ts`를 제거한다.

### 4. 명령 표면 테스트와 상태 갱신

관리 함수 호출을 주입하거나 출력 함수를 분리해 `src/commands/skills.test.ts`에서 기본·JSON·quiet 출력과 `--force` 전달을 검증한다.
`commands --json`에서 기준값 147개에 `skills status`, `skills update` 두 경로가 추가된 149개를 확인한다.
Phase 3을 `completed`, `current_phase`를 `4`로 갱신한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/commands/skills.ts` | status·install·update·uninstall과 출력 모드 |
| `src/commands/skills.test.ts` | 명령 출력·옵션 전달 테스트 |
| `src/commands/doctor.ts` | 공통 상태 판정과 복구 안내 |
| `src/utils/skill-install.ts` | 새 manager 전환 후 삭제 |
| `src/utils/skill-install.test.ts` | 새 manager 테스트로 대체 후 삭제 |
| `tasks/044-feat-managed-skill-lifecycle/index.json` | phase 상태 갱신 |

## 검증

```bash
# cwd: <repo root>
# branch: feat/044-feat-managed-skill-lifecycle
set -e
pnpm tsc --noEmit
pnpm test -- src/skill/manager.test.ts src/commands/skills.test.ts
test ! -e src/utils/skill-install.ts
test ! -e src/utils/skill-install.test.ts
pnpm run build
node dist/index.js commands --json | jq -e '.commands | length == 149'
node dist/index.js commands --json | jq -e \
  '[.commands[].path | select(. == "skills status" or . == "skills update")] | length == 2'
git diff --check
```

## Blocked 조건

- 전역 `--json`·`--quiet`을 상속하지 못해 별도 중복 옵션이 필요하면 Commander 구조를 확인하고 차단한다.
- JSON 출력과 사람용 안내가 stdout에서 섞이면 자동화 계약 위반이므로 완료 처리하지 않는다.
