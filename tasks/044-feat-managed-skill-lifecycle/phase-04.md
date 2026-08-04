# Phase 04 — 빌드 검증·테스트·사용자 가이드 갱신

**Execution profile**: fast
**Status**: completed

---

## 목표

관리형 스킬 수명주기의 전체 회귀를 검증하고 README와 공개 스킬 문서를 실제 명령 표면에 맞춘다.

**범위 외**: 결정 문서와 ADR은 planning의 docs-first 커밋에 이미 반영됐으므로 이 phase에서 다시 수정하지 않는다.

---

## 작업 항목 (4)

### 1. README 사용 흐름

`README.md`의 소개와 Claude Code 스킬 설치 절차를 `skills status|install|update|uninstall`에 맞춘다.
npm 갱신 후 `nhncloud skills update`가 필요하고 npx에서도 관리 저장소 설치가 가능하다는 점을 설명한다.
상태 토큰과 `--force`의 백업·보존 의미를 간결하게 안내한다.

### 2. 공개 스킬 router와 공통 reference

`skills/nhncloud-cli/SKILL.md`의 frontmatter description과 공통 참조 라우터가 스킬 상태·갱신 요청을 포함하게 한다.
`skills/nhncloud-cli/references/common.md`에 자동화용 `--json`·`--quiet`, 상태별 복구 명령과 npm 갱신 후 순서를 기록한다.

### 3. 잔재·공개 정보 검사

기존 “전역 설치 전제”, “npx 환경에서는 불가”, 링크 존재만으로 정상 판정하는 문구와 `skill-install` import가 남지 않았는지 확인한다.
README·공개 스킬에 ADR 번호나 내부 task 번호를 추가하지 않는다.
공개 도메인과 비밀값 검사를 실행한다.

### 4. 전체 검증과 상태 갱신

타입 검사, 149개 명령 카탈로그, 전체 테스트와 빌드를 실행한다.
Phase 4를 `completed`, `current_phase`를 `5`로 갱신한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `README.md` | 설치·상태·갱신·제거 사용 흐름 |
| `skills/nhncloud-cli/SKILL.md` | frontmatter와 공통 참조 라우팅 |
| `skills/nhncloud-cli/references/common.md` | 상태 토큰·복구·npm 갱신 절차 |
| `tasks/044-feat-managed-skill-lifecycle/index.json` | phase 상태 갱신 |

## 검증

```bash
# cwd: <repo root>
# branch: feat/044-feat-managed-skill-lifecycle
set -e
pnpm tsc --noEmit
pnpm test
pnpm run build
node dist/index.js commands --json | jq -e '.commands | length == 149'
test "$(rg -n 'npx 환경에서는 스킬 설치가 불가|전역 설치 전제|utils/skill-install' \
  README.md skills src docs/code-architecture.md || true)" = ""
test "$(rg -n 'ADR-[0-9]+|Issue #[0-9]+|task [0-9]+' \
  README.md skills/nhncloud-cli/SKILL.md || true)" = ""
(grep -rnoE "(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)" \
  README.md skills/ docs/ AGENTS.md CLAUDE.md src/ 2>/dev/null \
  | grep -vE "nhncloud\.com|nhncloudservice\.com|github\.com|npmjs\.com|example\.com|openai\.com|anthropic\.com" || true) \
  | test "$(cat)" = ""
test "$(grep -rnE \
  "(secret|password|appkey)['\"]?[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9]{16,}" \
  README.md skills/ docs/ AGENTS.md CLAUDE.md src/ 2>/dev/null || true)" = ""
git diff --check
```

## Blocked 조건

- 실제 명령 도움말·카탈로그와 사용자 가이드가 다르면 문서를 추측해 맞추지 않고 구현 표면부터 확정한다.
- 공개 정보 검사 결과가 남으면 placeholder로 교체하기 전에는 다음 phase로 넘어가지 않는다.
