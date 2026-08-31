# Phase 02: 사용자 가이드 갱신과 완료 검증

**Execution profile**: standard

---

## 목표

사용자가 `logncrash export` 실패 뒤 API 재조회 여부와 복구 파일 처리 방법을 판단할 수 있게 공개 가이드를 갱신한다.
명령 표면이 바뀌지 않았음을 명령 카탈로그와 전체 검증으로 확인하고 task를 완료 상태로 바꾼다.

**범위 외**: `src/commands/logncrash/export.ts`와 테스트의 구현 책임은 phase-01에 있다.
새 명령, 옵션, 자동 복구와 자동 재실행을 추가하지 않는다.
planning 결정 문서와 ADR-034는 docs-first 커밋 `76fec48`에 있으므로 이 phase에서 편집하지 않는다.

이 phase는 phase-01이 만드는 `.complete`와 `.unfinalized` 동작을 전제한다.
해당 토큰이나 대상 테스트가 없으면 base와 phase 상태를 확인하고 멈춘다.

---

## 작업 항목 (3)

### 1. README에 대량 export 사용 예를 추가한다

`README.md`의 “에이전트 없이 직접 쓰기” 명령 예에 `nhncloud logncrash export` 한 줄을 추가한다.
기존 검색 예와 가까운 위치에 두고 `<lucene>`, 상대 시간과 `logs.jsonl` 같은 공개 가능한 예시만 사용한다.

명령이나 옵션은 새로 만들지 않는다.
현재 명령 카탈로그 170개와 `--help` 안내 문구도 바꾸지 않는다.

README 전체 가독성 검사를 막는 기존 엠대시 2건도 같은 파일 안에서 함께 고친다.

- `설치된다 — 관리 저장소에`는 콜론이나 두 문장으로 바꾼다.
- `import 하지 않는다 — 역류는 금지다`는 두 문장으로 바꾼다.

현재 `python3 ~/.claude/scripts/check-readability.py README.md`의 기준값은 이 두 건이다.
다른 문장이나 구조를 정리하는 범위로 넓히지 않는다.

### 2. 공개 스킬에 세 결과 상태와 복구 방법을 설명한다

`skills/nhncloud-cli/references/logncrash.md`의 “대량 export” 절을 ADR-034와 실제 구현에 맞춘다.

- 조회 중 실패의 `<output>.partial`은 기존 이어받기 절에 그대로 둔다.
- `<output>.<id>.complete`는 전체 결과라 API를 다시 호출하지 않고 원하는 최종 경로로 옮겨 쓸 수 있다고 설명한다.
- `<output>.<id>.unfinalized`는 모든 데이터를 받았지만 JSON 배열 마무리가 필요하므로 마지막 `]`과 JSON 파싱을 확인한 뒤 옮기라고 설명한다.
- `.complete`와 `.unfinalized`는 실행별 고유 파일이며 이후 성공한 실행도 자동 삭제하지 않는다고 밝힌다.
- 복구 이동까지 실패하면 stderr가 알려준 temp 경로를 먼저 보존하라고 설명한다.

`skills/nhncloud-cli/SKILL.md`의 라우터 설명은 이미 scroll 대량 추출을 포함하므로 바꾸지 않는다.
복구 절차를 router에 복제하지 않는다.

### 3. 전체 검증 뒤 index.json을 완료 처리한다

대상 테스트, 타입 검사, 전체 테스트, 빌드와 명령 카탈로그를 아래 순서로 실행한다.
문서 검사와 공개 정보 검사도 통과시킨다.

모든 검증이 통과한 뒤 `tasks/066-fix-logncrash-complete-export-preservation/index.json`을 다음 상태로 바꾼다.

- task `status`: `completed`
- `current_phase`: `2`
- phase 1과 phase 2의 `status`: 모두 `completed`
- `updated_at`: 완료 시점의 UTC ISO 8601 값
- `error_message`와 `blocked_reason`: `null` 유지

완료 마킹은 이 phase 산출물과 같은 최종 commit에 포함하도록 team-lead에 보고한다.
executor는 commit, push와 PR 생성을 수행하지 않는다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `README.md` | 수정: `logncrash export` 직접 실행 예 |
| `skills/nhncloud-cli/references/logncrash.md` | 수정: 완료 상태별 복구 파일과 재조회 판단 |
| `tasks/066-fix-logncrash-complete-export-preservation/index.json` | 수정: 검증 통과 뒤 task와 phase 완료 마킹 |

## 검증

```bash
# cwd: <레포 루트>
pnpm exec vitest run src/commands/logncrash/export.test.ts
pnpm tsc --noEmit
pnpm test
pnpm run build
node dist/index.js commands --json > /tmp/nhncloud-066-commands.json
node -e 'const fs=require("fs"); const x=JSON.parse(fs.readFileSync("/tmp/nhncloud-066-commands.json","utf8")); if(x.commands.length!==170) process.exit(1)'
git diff --check
```

모든 명령은 종료 코드 0이어야 하고 명령 카탈로그는 170개여야 한다.

```bash
# cwd: <레포 루트>
~/.claude/scripts/korean-style-check.sh README.md skills/nhncloud-cli/references/logncrash.md
python3 ~/.claude/scripts/check-readability.py README.md skills/nhncloud-cli/references/logncrash.md

# README 직접 실행 예와 공개 스킬의 복구 상태가 있어야 한다.
grep -n 'logncrash export' README.md
grep -n '\.partial\|\.complete\|\.unfinalized' skills/nhncloud-cli/references/logncrash.md
```

두 문서 검사기는 종료 코드 0이어야 하고 두 grep은 각각 출력이 있어야 한다.

```bash
# cwd: <레포 루트>
# 공개 허용 목록 밖의 도메인은 출력이 없어야 한다.
if grep -rnoE "(https?://|@)[A-Za-z0-9.-]+\.(com|co\.kr|net)" README.md skills/ docs/ AGENTS.md CLAUDE.md src/ 2>/dev/null \
  | grep -vE "nhncloud\.com|nhncloudservice\.com|github\.com|npmjs\.com|example\.com|openai\.com|anthropic\.com"; then exit 1; fi

# placeholder가 아닌 긴 비밀 형태는 출력이 없어야 한다.
if grep -rnE "(secret|password|appkey)['\"]?[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9]{16,}" README.md skills/ docs/ AGENTS.md CLAUDE.md src/ 2>/dev/null; then exit 1; fi

# task와 두 phase가 완료 상태여야 한다.
grep -c '"status": "completed"' tasks/066-fix-logncrash-complete-export-preservation/index.json
grep -c '"current_phase": 2' tasks/066-fix-logncrash-complete-export-preservation/index.json
```

보안 검사 두 개는 출력 없이 종료 코드 0이어야 한다.
첫 번째 완료 grep은 `3`, 두 번째 grep은 `1`을 출력해야 한다.

## 의도 메모

- 공개 가이드는 “무슨 파일이 남는가”보다 “API를 다시 호출해야 하는가”를 먼저 판단하게 한다.
- README는 발견용 짧은 예만 소유하고, 복구 절차의 단일 소스는 서비스 reference에 둔다.
- 명령과 옵션을 추가하지 않으므로 카탈로그 개수는 바뀌지 않는다.
- 결정 문서를 phase에서 다시 편집하지 않아 planning과 executor의 소유권을 분리한다.

## Blocked 조건

- phase-01의 대상 테스트가 실패하거나 `.complete`와 `.unfinalized` 구현이 없으면 `PHASE_BLOCKED: phase-01 산출물 미완료`를 출력하고 종료한다.
- 명령 카탈로그가 170개가 아니면 구현에서 명령 표면이 바뀌었는지 조사하고, 의도하지 않은 변경이면 `PHASE_BLOCKED: 명령 카탈로그 변경`을 출력하고 종료한다.
