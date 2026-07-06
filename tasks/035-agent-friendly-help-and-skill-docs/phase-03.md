# Phase 03 — 사용자 가이드와 검증 동기화

## 목표

Phase 01, Phase 02의 결과를 사용자 가이드와 내부 검증 기준에 반영한다.

공개 skill reference 구조와 신규 `commands` 명령이 docs-verifier, release, docs-check에서 누락되지 않게 한다.

## 구현 항목

### 1. AGENTS.md 갱신

`AGENTS.md`에서 다음을 갱신한다.

- 지원 명령 수를 `commands` 추가 후 실제 개수로 갱신한다.
- 지원 명령 목록에 `commands`를 추가한다.
- 스킬 폴더 구분 설명에서 공개 skill이 router + `references/` 구조를 가질 수 있음을 명시한다.

주의:

- `agent_type`, `$workflow`, 경로 같은 기계 계약 토큰은 바꾸지 않는다.
- 개인 식별 정보 금지 정책은 수정하지 않는다.

### 2. docs/code-architecture.md와 docs/flow.md 갱신

`docs/code-architecture.md`에 다음을 반영한다.

- `src/commands/commands.ts` 항목 추가
- 공개 skill 구조 설명이 있다면 `skills/nhncloud-cli/references/`를 추가
- command catalog가 Commander tree에서 동적으로 생성된다는 사실을 한 줄로 기록

`docs/flow.md`에 agent 사용 흐름을 추가한다.

권장 흐름:

1. `nhncloud commands --json`으로 command path와 option을 확인한다.
2. 필요한 서비스 reference를 읽는다.
3. discovery 명령을 `--json`으로 호출한다.
4. 쓰기/삭제 명령은 `--yes`, payload file, region/profile을 명시한다.

### 3. README.md 갱신

사용자-facing 문서에 짧게만 반영한다.

- 지원 명령 소개에 `commands` 추가
- 자동화/AI 에이전트 섹션에 `nhncloud commands --json` 예시 추가
- `--help`에 agent hint가 있다는 내용을 길게 설명하지 않는다.

### 4. 공개 skill 문서 갱신

Phase 01 구조 기준으로 다음을 보강한다.

- `skills/nhncloud-cli/SKILL.md`
  - frontmatter description에 `commands --json`을 포함한다.
  - routing 표에서 `commands --json`을 먼저 안내한다.
- `skills/nhncloud-cli/references/common.md`
  - command catalog 사용법 추가
- 필요한 경우 각 서비스 reference에 discovery workflow 한 줄 추가

### 5. 내부 검증 스크립트와 문구 갱신

다음 파일에서 단일 `SKILL.md`만 전제하는 검증 문구가 있으면 reference 구조를 반영한다.

- `.agents/skills/release/SKILL.md`
- `.agents/skills/build-with-teams/SKILL.md`
- `.agents/skills/docs-check/SKILL.md`
- `.agents/skills/plan-and-build/SKILL.md`
- `.agents/skills/codebase-maintenance/references/nhncloud-cli-checks.md`
- `.agents/skills/planning/SKILL.md`
- `.agents/skills/planning/task-create.md`
- `.agents/skills/review-fix/SKILL.md`
- `.agents/skills/_shared/pitfalls/INDEX.md`
- `.agents/skills/_shared/pitfalls/plan/new-command-docs-required-skip.md`
- `.agents/skills/_shared/pitfalls/plan/external-state-gate-missing.md`
- `.agents/skills/_shared/pitfalls/plan/four-face-guard-missing.md`
- `.agents/skills/_shared/pitfalls/plan/function-signature-unverified.md`
- `.agents/skills/_shared/pitfalls/plan/input-validation-policy-asymmetry.md`
- `.agents/skills/_shared/pitfalls/plan/manual-verification-criterion.md`
- `.agents/skills/_shared/pitfalls/plan/noninteractive-trigger-dead-warning.md`
- `.agents/skills/_shared/pitfalls/plan/type-change-tsc-missing.md`
- `.agents/skills/_shared/pitfalls/team/cwd-tracking-dual-status.md`
- `.agents/skills/_shared/pitfalls/code-review/adjacent-command-pattern-missing.md`
- `.agents/skills/_shared/pitfalls/code-review/ambiguous-option-positional-silent-fallback.md`
- `.agents/skills/_shared/pitfalls/code-review/client-dep-in-utils.md`
- `.agents/skills/_shared/pitfalls/code-review/dead-field-function-name-mismatch.md`
- `.agents/skills/_shared/pitfalls/code-review/docs-regex-digit-range-mismatch.md`
- `.agents/skills/_shared/pitfalls/code-review/double-assertion-union-type.md`
- `.agents/skills/_shared/pitfalls/code-review/dry-run-location-asymmetry.md`
- `.agents/skills/_shared/pitfalls/code-review/dry-run-output-mode-missing.md`
- `.agents/skills/_shared/pitfalls/code-review/duplicate-map-block-no-helper.md`
- `.agents/skills/_shared/pitfalls/code-review/exitcode-param-error-in-api-path.md`
- `.agents/skills/_shared/pitfalls/code-review/test-regex-dotall-missing.md`
- `.agents/skills/_shared/pitfalls/code-review/quiet-mode-identifier-missing.md`
- `.agents/skills/_shared/pitfalls/code-review/resolver-after-editor.md`
- `.agents/skills/_shared/pitfalls/code-review/path-traversal-filename.md`
- `.agents/skills/_shared/pitfalls/code-review/resolver-boundary-empty-id.md`
- `.claude/agents/nhncloud-cli-docs-verifier.md`
- `.claude/agents/nhncloud-cli-executor.md`
- `.codex/agents/nhncloud-cli-docs-verifier.toml`
- `.codex/agents/nhncloud-cli-executor.toml`

예:

- 기존: `skills/nhncloud-cli/SKILL.md`만 grep
- 변경: `skills/nhncloud-cli/SKILL.md`와 `skills/nhncloud-cli/references/*.md`를 함께 grep

## 회피 항목

구현 전후로 다음 pitfall을 읽고 self-check한다.

- `.agents/skills/_shared/pitfalls/plan/path-migration-agents-missing.md`
- `.agents/skills/_shared/pitfalls/plan/new-command-docs-required-skip.md`
- `.agents/skills/_shared/pitfalls/plan/success-criterion-no-enforcement.md`

특히 확인할 점:

- 신규 명령인데 README 또는 공개 skill frontmatter를 빠뜨리지 않았는가?
- docs 검증 grep이 기존 텍스트로도 통과하는 약한 검사가 아닌가?
- `.claude/agents`와 `.codex/agents`에 단일 skill 파일 경로를 하드코딩한 검증이 남아 있지 않은가?

## 검증

자동 검증:

```bash
pnpm tsc --noEmit
pnpm build
pnpm test
python3 /Users/nhn/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/nhncloud-cli
node dist/index.js commands --json | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const j=JSON.parse(s); if (!j.commands.some(c=>c.path==='commands')) process.exit(1);})"
rg -n "commands --json|nhncloud commands" README.md AGENTS.md docs/flow.md skills/nhncloud-cli
rg -n "skills/nhncloud-cli/SKILL.md" .agents/skills .claude/agents .codex/agents
if rg -n "skills/nhncloud-cli/SKILL.md" .agents/skills .claude/agents .codex/agents \
  | rg -v 'references/\\*\\.md|references/|SKILL\\.md.*skills/nhncloud-cli/references|skills/nhncloud-cli/references.*SKILL\\.md'; then
  echo "stale single-file skill assumption remains"
  exit 1
fi
```

기대값:

- `pnpm tsc --noEmit`, `pnpm build`, `pnpm test` 모두 exit 0.
- skill quick validate가 exit 0.
- `commands --json` catalog에 `commands` command가 포함된다.
- README, AGENTS, flow, public skill 경로에 `commands --json` 안내가 있다.
- 단일 `skills/nhncloud-cli/SKILL.md`만 검증하는 문구가 남으면 마지막 stale 검사에서 exit 1로 실패한다.

## 변경 파일

- `AGENTS.md`
- `docs/code-architecture.md`
- `docs/flow.md`
- `README.md`
- `skills/nhncloud-cli/SKILL.md`
- `skills/nhncloud-cli/references/common.md`
- `skills/nhncloud-cli/references/logncrash.md`
- `skills/nhncloud-cli/references/deploy.md`
- `skills/nhncloud-cli/references/iaas.md`
- `skills/nhncloud-cli/references/ncr.md`
- `skills/nhncloud-cli/references/nks.md`
- `skills/nhncloud-cli/references/troubleshooting.md`
- `.agents/skills/release/SKILL.md`
- `.agents/skills/build-with-teams/SKILL.md`
- `.agents/skills/docs-check/SKILL.md`
- `.agents/skills/plan-and-build/SKILL.md`
- `.agents/skills/codebase-maintenance/references/nhncloud-cli-checks.md`
- `.agents/skills/planning/SKILL.md`
- `.agents/skills/planning/task-create.md`
- `.agents/skills/review-fix/SKILL.md`
- `.agents/skills/_shared/pitfalls/INDEX.md`
- `.agents/skills/_shared/pitfalls/plan/new-command-docs-required-skip.md`
- `.agents/skills/_shared/pitfalls/plan/external-state-gate-missing.md`
- `.agents/skills/_shared/pitfalls/plan/four-face-guard-missing.md`
- `.agents/skills/_shared/pitfalls/plan/function-signature-unverified.md`
- `.agents/skills/_shared/pitfalls/plan/input-validation-policy-asymmetry.md`
- `.agents/skills/_shared/pitfalls/plan/manual-verification-criterion.md`
- `.agents/skills/_shared/pitfalls/plan/noninteractive-trigger-dead-warning.md`
- `.agents/skills/_shared/pitfalls/plan/type-change-tsc-missing.md`
- `.agents/skills/_shared/pitfalls/team/cwd-tracking-dual-status.md`
- `.agents/skills/_shared/pitfalls/code-review/adjacent-command-pattern-missing.md`
- `.agents/skills/_shared/pitfalls/code-review/ambiguous-option-positional-silent-fallback.md`
- `.agents/skills/_shared/pitfalls/code-review/client-dep-in-utils.md`
- `.agents/skills/_shared/pitfalls/code-review/dead-field-function-name-mismatch.md`
- `.agents/skills/_shared/pitfalls/code-review/docs-regex-digit-range-mismatch.md`
- `.agents/skills/_shared/pitfalls/code-review/double-assertion-union-type.md`
- `.agents/skills/_shared/pitfalls/code-review/dry-run-location-asymmetry.md`
- `.agents/skills/_shared/pitfalls/code-review/dry-run-output-mode-missing.md`
- `.agents/skills/_shared/pitfalls/code-review/duplicate-map-block-no-helper.md`
- `.agents/skills/_shared/pitfalls/code-review/exitcode-param-error-in-api-path.md`
- `.agents/skills/_shared/pitfalls/code-review/test-regex-dotall-missing.md`
- `.agents/skills/_shared/pitfalls/code-review/quiet-mode-identifier-missing.md`
- `.agents/skills/_shared/pitfalls/code-review/resolver-after-editor.md`
- `.agents/skills/_shared/pitfalls/code-review/path-traversal-filename.md`
- `.agents/skills/_shared/pitfalls/code-review/resolver-boundary-empty-id.md`
- `.claude/agents/nhncloud-cli-docs-verifier.md`
- `.claude/agents/nhncloud-cli-executor.md`
- `.codex/agents/nhncloud-cli-docs-verifier.toml`
- `.codex/agents/nhncloud-cli-executor.toml`
- `tasks/035-agent-friendly-help-and-skill-docs/index.json`
- `tasks/035-agent-friendly-help-and-skill-docs/phase-03.md`

## task 상태

Phase 03 완료 후 `tasks/035-agent-friendly-help-and-skill-docs/index.json`을 갱신한다.

- phase 1, 2, 3 status: `completed`
- task status: `completed`

## 커밋

```bash
git commit -m "docs: document agent-friendly command discovery"
```
