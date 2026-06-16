# Phase 02 — docs/adr.md 참조 전수 갱신 + docs-check 검증 스크립트 재작성 + 완료 마킹

## 목표 (검증 가능)

phase-01 의 `adr.md → docs/adr/` 이전에 따라 모든 경로 참조가 갱신되고, **docs-check 의 ADR 검증 스크립트가 디렉터리 모델로 동작**하며, 죽은 참조가 0이다.

- 검증: `grep -rln "adr\.md" CLAUDE.md docs/ .claude/skills/ README.md skills/ src/` → `docs/adr/` 외 0건.
- 검증: `docs-check` SKILL 의 ADR INDEX 동기 검증 스크립트가 `docs/adr/` 디렉터리 기준으로 재작성돼 실제로 18개 파일↔INDEX 를 점검(수동 1회 실행 확인).
- 검증: `[[adr-NNN]]` wikilink 가 모두 `docs/adr/NNN-*.md` 파일로 해석(MISSING 0).

## 구현 항목

### 1. `docs/adr.md` 경로 참조 전수 갱신 (**grep 결과가 권위 — 열거 목록 아님**)

작성 시점에 실행하고, 그 결과의 **모든 파일**을 갱신한다(열거 목록은 보조):

```bash
grep -rln "adr\.md" CLAUDE.md docs/ .claude/skills/ README.md skills/ src/ 2>/dev/null
```

critic 실측으로 확인된 대상(최소 — grep 으로 더 나오면 전부):
- `CLAUDE.md` — "직관에 반하는 동작은 `docs/adr.md` 에 ADR 로 보존" → "`docs/adr/` 에 ADR 로 보존(번호별 파일·INDEX)".
- `.claude/skills/planning/SKILL.md` — 문서 책임 표의 `docs/adr.md` → `docs/adr/`, ADR 번호 확인 명령 `grep "^## ADR-{N}" docs/adr.md` → `ls docs/adr/{N}-*.md`, 문서 연결 그래프 노드 라벨 `docs/adr.md` → `docs/adr/`.
- `.claude/skills/planning/task-create.md` — adr.md 참조.
- `.claude/skills/plan-and-build/SKILL.md` — 참조 doc 목록의 adr.md.
- `.claude/skills/_shared/common-pitfalls.md` — self-check 의 adr.md 언급.
- `.claude/skills/docs-check/SKILL.md` — **아래 §1.5 별도 처리(경로 치환 아님)**.
- `.claude/skills/build-with-teams/SKILL.md`, `review-fix/SKILL.md` — 있으면.

**변경 대상은 `adr.md` 파일 경로 문자열만.** 다음은 경로가 아니므로 **변경 금지**:
- `ADR-016` 같은 식별자 텍스트.
- `[[adr-NNN]]` wikilink (경로 무관 — 번호로 해석).
- `docs/code-architecture.md` 의 bare `adr-NNN` 토큰·`[[adr-NNN]]` (path 변경 대상 없음 — phase-01 단계에서 adr.md path 가 거기 없음을 grep 으로 확인).
- `CLAUDE.md` "상황별 ADR 필수 참조" 표(`ADR-NNN`) — 불변.

### 1.5 docs-check SKILL 임베드 검증 스크립트 재작성 (**CRITICAL — 경로 치환이 아니라 로직 재작성**)

`docs-check/SKILL.md` 의 ADR INDEX 동기 검증 스크립트(현 278-310 인근)는 **단일 `adr.md` 구조를 전제**한다. 분리 후 그 construct 가 전부 사라져 스크립트가 조용히 깨진다(파일 부재 → 에러 또는 garbage pass). 디렉터리 모델로 재작성:

| 기존 (단일 파일 전제) | 재작성 (디렉터리 모델) |
|---|---|
| `grep -oE '^## ADR-[0-9]+' docs/adr.md` (BODY) | `grep -h '^# ADR-[0-9]+' docs/adr/[0-9]*.md` |
| 인라인 Index `\[ADR-[0-9]+\]\(#adr-[0-9]+\)` | `docs/adr/INDEX.md` 의 `\[ADR-[0-9]+\]\([0-9]` 링크 목록 |
| `<a id="adr-XXX">` 앵커 검사 | 제거(파일 1개=ADR 1개라 내부 앵커 불요) |
| `awk "/<a id=.../,/^---$/"` 절 경계 | 제거, 필요 시 `wc -l docs/adr/[0-9]*.md` per-file |

- SKILL 271행 인근 "상단 ADR Index ... `<a id>` 앵커" 설명도 디렉터리/INDEX 기준으로 갱신.
- **Why CRITICAL**: docs-check 는 build-with-teams 실행 후 주기적으로 도는 스킬이다. 깨진 채 두면 ADR 이 여러 파일로 흩어진 시점(가장 INDEX-sync 가 필요한 때)에 가드가 무력화된다.

### 2. wikilink·앵커 무결성

- 마크다운 앵커: `grep -rnE "\(#adr-[0-9]" docs/ CLAUDE.md .claude/skills/` — phase-01 에서 처리됐는지 재확인. 남으면 `docs/adr/INDEX.md` 경유.
- wikilink 파일 존재 검증(이 repo 는 wikilink 렌더러가 없으므로 "해석"="해당 파일 존재"):
  ```bash
  for n in $(grep -rhoE "\[\[adr-[0-9]+\]\]" docs/ CLAUDE.md .claude/skills/ 2>/dev/null | grep -oE "[0-9]+" | sort -u); do
    ls docs/adr/${n}-*.md >/dev/null 2>&1 || echo "MISSING adr-$n"
  done
  ```
  → MISSING 0.

### 3. index.json 완료 마킹 (마지막 phase)

- `tasks/023-refactor-adr-directory/index.json` 의 `status: "completed"`, `current_phase: 2`, 모든 phase `status: "completed"`.

## 회피 항목 (executor self-check)

- **grep authoritative**: 열거 목록이 아니라 `grep -rln "adr\.md"` 결과 전체를 갱신. 누락 파일 0.
- **CRITICAL docs-check 스크립트**: 경로 치환이 아니라 로직 재작성. 단일 adr.md 전제 construct(`^## ADR-`·`(#adr-nnn)`·`<a id>`·`---` awk)를 전부 디렉터리 모델로. 재작성 후 1회 실행해 18↔INDEX 점검이 도는지 확인.
- **식별자/wikilink 불변**: `ADR-NNN` 텍스트·`[[adr-NNN]]`·bare `adr-NNN` 은 경로가 아니므로 변경 금지(critic 지적 — code-architecture 에 adr.md path 없음).
- **앵커 strip 확인**: phase-01 에서 본문 `<a id="adr-NNN">` 가 제거됐는지(파일 1개당 내부 앵커 불요).

## 완료 조건

1. `grep -rn "adr\.md" CLAUDE.md docs/ .claude/skills/ README.md skills/ src/` → `docs/adr/` 외 0건.
2. docs-check SKILL 검증 스크립트가 `docs/adr/` 모델로 재작성·동작(수동 1회 실행 확인).
3. wikilink 파일 존재 검증 MISSING 0.
4. `pnpm run build` 정상.
5. index.json `status: completed` 마킹.

## 커밋

```
refactor(adr): docs/adr.md 참조 전수 갱신 + docs-check 검증 스크립트 디렉터리 모델 재작성 (ADR-018 완료)
```
