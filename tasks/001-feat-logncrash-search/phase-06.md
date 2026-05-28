# Phase 6: 빌드 검증 + smoke test + SKILL.md

## 컨텍스트

nhncloud-cli 의 `nhncloud logncrash search` 구현 완료 (Phase 1~5). 이 phase 는 전체 빌드를 검증하고, AI 에이전트용 공개 스킬 (`skills/nhncloud-cli/SKILL.md`) 을 작성한다.

먼저 아래 문서를 읽어라:

- `docs/flow.md` — 명령 시그니처 (SKILL 의 의도→커맨드 매핑 근거)
- `CLAUDE.md` — 출력 모드, 스킬 폴더 구분

기존 코드 참조 (dooray-cli, 읽기만):

- `/Users/nhn/personal/dooray-cli/skills/dooray-cli/SKILL.md` — 의도→커맨드 매핑 표 + 체이닝 예시 + 출력 모드 구조

## 목표

빌드·타입·smoke 검증 통과 + 사용자/AI 가이드 SKILL.md 작성.

## 작업 목록

- [ ] 빌드 게이트
  - `pnpm tsc --noEmit` 0건, `pnpm run build` 성공
  - smoke: `node dist/index.js logncrash search --help` 가 옵션 출력
- [ ] `skills/nhncloud-cli/SKILL.md` 작성
  - frontmatter `name: nhncloud-cli` + description
  - 설치/설정 (`~/.nhncloud/credentials.json` 예시, placeholder 만)
  - 출력 모드 표 (테이블/`--json`/`--quiet`) + "AI 에이전트는 --json 사용"
  - 의도→커맨드 매핑 표 (로그 검색)
  - 체이닝 예시 1~2개 (`--json` | `jq`)
  - 시간 입력 (ISO8601/상대시간), 시간 제약 (90일/31일)

## 성공 기준

```bash
# cwd: /Users/nhn/personal/nhncloud-cli
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l   # 기대: 0
pnpm run build && echo BUILD_OK
node dist/index.js logncrash search --help 2>&1 | grep -c "\-\-query"   # 기대: >=1
test -f skills/nhncloud-cli/SKILL.md && echo SKILL_OK
grep -c "name: nhncloud-cli" skills/nhncloud-cli/SKILL.md   # 기대: 1
# PII 게이트 (public repo) — 0건
grep -rnE "tc-ocr|nhnent|nhn-comico|@(nhn|nhnent)\.com" skills/ 2>/dev/null | grep -v "검증 grep\|노출 금지" | wc -l   # 기대: 0
```

## 주의사항

- SKILL.md 의 자격증명 예시는 placeholder (`<appkey>`/`<secretkey>`) 만. 실제 키/사내 식별자 금지.
- `CLAUDE.md` 마크다운 가독성 6패턴 준수 (semantic line break, 인라인 나열 금지).
- README.md 는 본 PoC 범위 외 (필요 시 별도 task).

## Blocked 조건

- 빌드/타입 실패가 이전 phase 결함이면: `PHASE_BLOCKED: phase {N} 재작업 필요 — {증상}`
