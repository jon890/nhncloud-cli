# Phase 04 — 완료 상태와 커밋 인계

**Execution profile**: fast
**Status**: completed

---

## 목표

삭제 근거 대장을 남기고 임시 감사 자료를 제거한 뒤, 최신 원격 상태·최종 검증·task 완료 상태를 확인해 관심사별 커밋을 team-lead에게 인계한다.

**범위 외**: executor는 commit, push, rebase와 PR 생성을 수행하지 않는다.

---

## 작업 항목 (4)

### 1. 브랜치와 외부 상태 확인

```bash
# cwd: <repo root>
# branch: refactor/046-refactor-pitfalls-prune
# shell: bash 또는 zsh — POSIX sh 로 실행하지 않는다 (프로세스 치환과 탭 리터럴을 쓴다)
set -e
test "$(git branch --show-current)" = "refactor/046-refactor-pitfalls-prune"
git fetch origin
git merge-base --is-ancestor origin/main HEAD
git cat-file -e origin/main:docs/pitfalls/INDEX.md
! git cat-file -e origin/main:.agents/skills/_shared/pitfalls/INDEX.md 2>/dev/null
prune_pr_count="$(gh pr list --state open --head refactor/046-refactor-pitfalls-prune --json number --jq 'length')"
test "$prune_pr_count" -le 1
```

`origin/main`의 문서 개수는 고정하지 않는다. 선행 관계 확인으로 충분하고, 실행 중 다른 회고 커밋이 `main`에 들어오면 정당한 상태에서 차단될 수 있다.

### 2. 삭제 근거 대장 생성

임시 분류표를 지우기 전에 삭제 근거를 team-lead가 커밋 메시지로 옮길 수 있는 형태로 만든다.

```bash
# cwd: <repo root>
set -e
AUDIT=.omc/pitfalls-audit.tsv
tsv_cnt="$(awk -F '\t' 'NR>1 && $2 ~ /^delete-/ {c++} END{print c+0}' "$AUDIT")"
awk -F '\t' 'NR>1 && $2 ~ /^delete-/ {print $1" — "$2" — "$3}' "$AUDIT" > .omc/prune-ledger.txt
test "$(wc -l < .omc/prune-ledger.txt | tr -d ' ')" = "$tsv_cnt"
```

분류표는 커밋되지 않으므로 삭제 근거의 영구 보존 위치는 커밋 메시지와 PR 본문이다.
`.omc/prune-ledger.txt`도 `.gitignore` 대상이며 team-lead가 커밋 메시지로 옮긴 뒤 제거한다.

### 3. 최종 검증과 임시 자료 제거

Phase 3 검증 블록의 1~11번을 다시 실행한다. 기준 커밋은 Phase 3과 같다.
여기에 내용 보존(1-1·1-2), 045 인계 4건(9번), 선지정 `edit` 두 축(10번)이 포함된다.

저장소 회귀 검증(`tsc`·`test`·`build`)은 실행하지 않는다. 근거는 Phase 3 작업 항목 3과 같다.

검증 근거를 확인한 뒤 `.omc/pitfalls-audit.tsv`를 제거하고 git 변경에 포함되지 않았는지 확인한다.

### 4. task 완료 상태와 실행 기록

`tasks/046-refactor-pitfalls-prune/index.json`의 최상위와 네 phase `status`를 `completed`로 바꾼다.
`current_phase`는 `4`, `updated_at`은 실제 UTC 완료 시각으로 갱신하고 오류 필드는 `null`로 유지한다.
네 phase 파일의 `**Status**:` 줄도 `completed`로 바꾼다.
`index.json`만 갱신하면 phase 파일이 `pending`으로 남아 선행 task 관례와 어긋난다.
`docs/retrospectives/RUNS.md`에 실제 `build-with-teams` 결과 한 줄을 추가한다.

---

## team-lead 커밋·push 인계

team-lead는 다음 관심사별로 변경이 있는 커밋만 만든다.

1. 패턴 정리와 활성 소비 경로: `refactor(pitfalls): prune obsolete guidance`.
   커밋 메시지 본문에 `.omc/prune-ledger.txt`의 내용을 그대로 담는다. 삭제 파일마다 `<경로> — <verdict> — <evidence>` 한 줄이다.
   PR 본문에도 같은 목록을 넣어 검토자가 근거를 대조할 수 있게 한다.
2. task 상태와 실행 기록: `docs(retro): record pitfalls guidance prune`.

planning 문서와 task 파일은 `045`를 통해 `main`에 병합된 뒤 이 브랜치가 최신 `main`으로 rebase되어 있어야 한다.

---

## Critical Files

| 파일 | 변경 |
|---|---|
| `.omc/pitfalls-audit.tsv` | 검증 후 제거, 커밋 금지 |
| `.omc/prune-ledger.txt` | 커밋 메시지로 옮긴 뒤 제거, 커밋 금지 |
| `tasks/046-refactor-pitfalls-prune/index.json` | 최상위·phase 완료 상태와 완료 시각 |
| `tasks/046-refactor-pitfalls-prune/phase-0*.md` | phase 파일 Status 갱신 |
| `docs/retrospectives/RUNS.md` | build-with-teams 실행 결과 |

## 검증

```bash
# cwd: <repo root>
# branch: refactor/046-refactor-pitfalls-prune
# shell: bash 또는 zsh — POSIX sh 로 실행하지 않는다 (프로세스 치환과 탭 리터럴을 쓴다)
set -e

# 1. 완료 마킹
test "$(grep -c '"status": "completed"' tasks/046-refactor-pitfalls-prune/index.json)" = "5"
test "$(grep -c '"current_phase": 4' tasks/046-refactor-pitfalls-prune/index.json)" = "1"
test "$(grep -c '"status": "pending"' tasks/046-refactor-pitfalls-prune/index.json)" = "0"
test "$(rg -c '^\*\*Status\*\*: completed' tasks/046-refactor-pitfalls-prune/phase-0*.md | grep -c ':1$')" = "4"

# 2. 실행 기록
test "$(rg -c '046-refactor-pitfalls-prune' docs/retrospectives/RUNS.md)" -ge "1"

# 3. 임시 자료가 남지 않았다
test ! -f .omc/pitfalls-audit.tsv
test "$(git status --porcelain | grep -c '^??')" = "0"
git diff --check
```

## 완료 조건

- 삭제된 모든 파일에 `delete-*` 근거가 있고, `delete-*` 판정한 파일은 모두 삭제됐다.
- 삭제 근거가 커밋 메시지와 PR 본문에 남아 검토자가 감사할 수 있다.
- `retain` 파일은 기준 커밋과 바이트 단위로 같고, `retain`·`edit` 모두 frontmatter가 불변이다.
- 남은 파일은 현재 저장소 표면과 일치하고 frontmatter가 유효하다.
- 045 인계 4건(진행 메모 제거·표 닫힘·알파벳 순서·`.gitkeep` 제거)과 선지정 `edit` 두 축이 반영됐다.
- INDEX 의 헤더 숫자·목록 항목 수·실제 파일 수가 일치하고 모든 링크가 실재 파일을 가리킨다.
- 이전 경로 잔존이 0건이고 `docs/adr/018-harness-docs-directory.md`의 기각 대안 기록은 예외로 보존된다.
- 공개 정보 검사가 0건이고 npm 배포 표면이 바뀌지 않았다.
- 임시 분류표가 작업 트리에 남지 않는다. 대장은 team-lead가 커밋 메시지로 옮긴 뒤 제거한다. 둘 다 `.gitignore` 대상이라 커밋에는 어느 쪽도 들어가지 않는다.
- `index.json`의 최상위와 네 phase가 `completed`이고 phase 파일 `Status`도 `completed`다.

## Blocked 조건

- 최신 `main`이 선행 관계가 아니면 `PHASE_BLOCKED: 045 병합 후 branch rebase 필요`를 보고한다.
- 같은 브랜치의 열린 PR이 둘 이상이면 `PHASE_BLOCKED: branch PR 상태 확인 필요`를 보고한다.
- 삭제 근거가 규칙의 부분 중복이나 자동 검사의 일부 보장에 그치면 `PHASE_BLOCKED: 삭제 근거 부족`을 보고하고 해당 문서를 보존한다.
- `delete-rule` 근거가 에이전트·스킬 임베드를 가리키면 `PHASE_BLOCKED: 파생 사본을 삭제 근거로 사용`을 보고한다.
