# Phase 02 — docs/adr.md 참조 전수 갱신 + 완료 마킹

## 목표 (검증 가능)

phase-01 의 `adr.md → docs/adr/` 이전에 따라 모든 참조가 새 경로를 가리키고, 죽은 참조가 0이다.

- 검증: `grep -rn "docs/adr\.md\|adr\.md" CLAUDE.md docs/ .claude/skills/ README.md skills/` → `docs/adr/` 외 잔존 0.
- 검증: ADR 간 `[[adr-NNN]]` wikilink 와 INDEX 링크가 모두 실재 파일로 해석.

## 구현 항목

### 1. `docs/adr.md` 문자열 참조 전수 갱신

`grep -rn "adr\.md" CLAUDE.md docs/ .claude/skills/ README.md skills/ src/ 2>/dev/null` 로 전수 찾아 새 경로로:

- **CLAUDE.md**: "직관에 반하는 동작은 `docs/adr.md` 에 ADR 로 보존" → "`docs/adr/` 에 ADR 로 보존(번호별 파일·INDEX)". "상황별 ADR 필수 참조" 표의 ADR-NNN 텍스트는 그대로(경로 아님).
- **docs/code-architecture.md**: `adr.md` 언급 → `docs/adr/`. ADR-NNN 역참조 텍스트는 유지.
- **README.md / skills/nhncloud-cli/SKILL.md**: `adr.md` 경로 언급 있으면 갱신(대개 없음 — 확인).
- **.claude/skills/ (planning·build-with-teams·docs-check·review-fix)**: SKILL 본문의 `docs/adr.md` / `adr.md` 언급을 `docs/adr/`(또는 `docs/adr/INDEX.md`)로. 특히:
  - planning SKILL 의 "문서 책임 표" 의 `docs/adr.md` → `docs/adr/`
  - planning 의 ADR 번호 확인 명령 `grep "^## ADR-{N}" docs/adr.md` → `ls docs/adr/{N}-*.md` 또는 `grep -rl "ADR-{N}" docs/adr/`
  - docs-check SKILL 의 adr.md 점검 대상 경로
  - build-with-teams 의 docs-verifier 항목에 adr.md 언급 있으면

### 2. 앵커/wikilink 점검

- `grep -rnE "\(#adr-[0-9]" docs/ CLAUDE.md` → phase-01 에서 처리됐는지 재확인. 남으면 `docs/adr/INDEX.md` 경유 또는 `[[adr-NNN]]` 로.
- `[[adr-NNN]]` wikilink 가 18개 파일과 해석되는지(번호 매칭). docs/adr/ 안 파일끼리의 cross-link 도 동일.

### 3. index.json 완료 마킹 (마지막 phase)

- `tasks/023-refactor-adr-directory/index.json` 의 `status: "completed"`, `current_phase: 2`, 모든 phase `status: "completed"`.

## 회피 항목 (executor self-check)

- **전수 grep**: `adr.md` 문자열이 `docs/adr/` 외에 한 곳도 안 남아야(스킬 포함). 누락 시 죽은 경로.
- **ADR-NNN 텍스트 vs 경로 구분**: "ADR-016" 같은 식별자 텍스트는 갱신 대상 아님(유지). `adr.md` 파일 경로만 갱신.
- **갱신 시점**: 본 phase 는 사용자 가이드 docs(README/SKILL) 도 만지지만, 이는 코드 산출물이 아니라 경로 참조 갱신이라 phase-02 에서 OK.

## 완료 조건

1. `grep -rn "adr\.md" CLAUDE.md docs/ .claude/skills/ README.md skills/ src/` → `docs/adr/` 외 0건.
2. `[[adr-NNN]]` + INDEX 링크 전부 실재 파일 해석.
3. `pnpm run build` 정상.
4. index.json `status: completed` 마킹.

## 커밋

```
refactor(adr): docs/adr.md 참조를 docs/adr/ 로 전수 갱신 (ADR-018 완료)
```
