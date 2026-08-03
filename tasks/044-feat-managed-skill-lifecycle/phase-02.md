# Phase 02 — 관리 저장소와 상태 전이

**Execution profile**: standard
**Status**: pending

---

## 목표

스킬 설치 상태를 정확히 판정하고 버전·해시별 관리 저장소를 준비한 뒤 활성 링크를 원자적으로 전환한다.

**범위 외**: Commander 출력과 사용자 가이드는 다음 phase가 소유한다.

---

## 실행 전제

```bash
# cwd: <repo root>
# branch: feat/044-feat-managed-skill-lifecycle
set -e
test "$(git branch --show-current)" = "feat/044-feat-managed-skill-lifecycle"
test -f src/skill/context.ts
test -f src/skill/manifest.ts
git log origin/main --oneline -20 -- src/utils/skill-install.ts src/commands/skills.ts
```

Phase 1 산출물이 없거나 현재 브랜치가 다르면 `PHASE_BLOCKED: Phase 1 또는 실행 경로 확인 필요`를 보고한다.

---

## 확정 계약

- 상태 토큰은 `current`, `missing`, `outdated`, `broken`, `unmanaged`, `modified`, `corrupt`만 사용한다.
- 상태 객체는 schemaVersion, destination, source, currentVersion, 선택 installedVersion·linkTarget과 managed를 포함한다.
- 관리 저장소는 `<dataRoot>/skills/<version>-<digestHex>`이며 새 디렉터리와 활성 링크를 각각 같은 파일시스템에서 `rename`으로 전환한다.
- 기존 npm 패키지·저장소 직접 링크는 package metadata가 `@bifos/nhncloud-cli`면 `outdated`·managed로 이전한다.
- 기존 실제 디렉터리·알 수 없는 링크와 수정·손상 상태는 `--force` 없이 바꾸지 않는다.

---

## 작업 항목 (4)

### 1. 상태 모델과 판정

`src/skill/manager.ts`에 `SkillStatus`, `SkillInstallResult`, `inspectSkill(context)`를 구현한다.
관리 저장소에서는 경로의 버전·해시, 매니페스트, 실제 콘텐츠 해시와 현재 package source를 모두 대조한다.
깨진 링크는 관리 저장소 또는 `@bifos/nhncloud-cli/skills/nhncloud-cli` 형태일 때만 managed로 판정한다.

### 2. 관리 저장소 준비

source의 해시를 계산하고 staging 디렉터리에 `SKILL.md`, `references/`, `.nhncloud-skill.json`을 완성한 뒤 canonical 저장소로 `rename`한다.
같은 canonical 경로가 있으면 매니페스트와 실제 해시를 검증해 재사용한다.
수정·손상된 canonical 저장소의 `--force` 복구는 UTC 시각 백업으로 격리하고 실패 시 복원한다.

### 3. 설치·갱신·제거

`installSkill(context, { force? })`가 `current`에서는 무변경하고 나머지 관리 가능 상태는 새 저장소로 전환하게 한다.
활성 링크는 같은 부모의 임시 링크를 `rename`해 교체하고 비관리 항목의 `--force` 교체는 먼저 백업한다.
`uninstallSkill(context)`은 활성 심볼릭 링크만 제거하고 실제 디렉터리와 관리 저장소는 삭제하지 않는다.

### 4. 회귀 테스트와 상태 갱신

`src/skill/manager.test.ts`에서 모든 상태와 install→source 변경→outdated→update→current 흐름을 검증한다.
동시 canonical 저장소 준비, 전환 실패 복구, 사용자 항목 보존, 손상 저장소 `--force` 복구를 포함한다.
기존 명령이 아직 import하는 `src/utils/skill-install.ts`와 테스트는 이 phase에서 제거하지 않는다.
Phase 3이 명령을 새 manager로 전환한 뒤 두 파일을 함께 제거한다.
Phase 2를 `completed`, `current_phase`를 `3`으로 갱신한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `src/skill/manager.ts` | 상태 판정·저장소 준비·원자적 전환·제거 |
| `src/skill/manager.test.ts` | 상태 전이와 실패 복구 테스트 |
| `tasks/044-feat-managed-skill-lifecycle/index.json` | phase 상태 갱신 |

## 검증

```bash
# cwd: <repo root>
# branch: feat/044-feat-managed-skill-lifecycle
set -e
pnpm tsc --noEmit
pnpm test -- src/skill/manifest.test.ts src/skill/manager.test.ts
test -e src/utils/skill-install.ts
test -e src/utils/skill-install.test.ts
git diff --check
```

## Blocked 조건

- 사용자 항목을 백업 없이 교체해야만 구현 가능한 경우 차단한다.
- 새 저장소와 활성 링크의 원자적 전환을 같은 파일시스템에서 보장할 수 없으면 차단한다.
