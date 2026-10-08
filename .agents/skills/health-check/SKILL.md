---
name: health-check
description: "의존성 버전, 취약점(pnpm audit), 저장소 규약, 구조와 유지보수성을 점검하고 작업 단위 표와 적용 경로를 만든다. /health-check, 정기 점검, 의존성 점검, 패키지 버전 낡았나, pnpm audit, 취약점 확인, 메이저 업그레이드 해도 되나, 구조 검토, 유지보수성 평가 같은 요청이면 스킬 이름을 말하지 않아도 이 스킬을 쓴다. 새 버전 배포는 release 가 맡는다."
---

# /health-check로 저장소 정기 점검

**목표: 작업 단위 표를 받은 사용자가 단위마다 적용 경로를 정했다.**

- 측정은 스크립트가 하고 판단이 필요한 곳만 사람과 에이전트가 본다.
- 작업 중인 checkout 에서 갱신을 시험하지 않는다. 시험은 `trial-update.mjs` 가 만드는 임시 worktree 에서 한다.

## 워크플로우 개요

| 단계 | 이름 | 통과 조건 | reference |
|---|---|---|---|
| 1 | 측정 | `deps-report.mjs` 와 `conventions.mjs` 가 종료 코드 0 이나 1 로 끝났다 | |
| 2 | 범위 안 갱신 시험 | `trial-update.mjs --range` 가 종료 코드 0 이고, 남은 취약점마다 해소 방법이나 남기는 이유가 있다 | |
| 3 | 메이저 판단 | 메이저 대상마다 올림, 코드 수정 후 올림, 보류 중 하나와 이유가 있다 | `references/major-upgrade.md` |
| 4 | 구조와 유지보수성 검토 | 보고 표의 높음 항목마다 확인한 파일과 줄이나 「확인하지 않음」이 적혀 있다 | `references/review-axes.md` |
| 5 | 보고와 적용 경로 결정 | 작업 단위 표를 보여 줬고, 어느 단위를 어느 경로로 할지 사용자가 정했다 | `references/major-upgrade.md` |

4단계는 사용자가 구조나 유지보수성 평가를 요청했거나 1단계 규약 검사에 error 가 있을 때만 돈다.

명령 블록은 저장소 root 에서 붙여넣는다. 스크립트가 root 를 스스로 확인한다.

## 1. 측정

```bash
OUT="$(mktemp -d)"
node .agents/skills/health-check/scripts/deps-report.mjs > "$OUT/deps.md"; echo "deps=$?"
node .agents/skills/health-check/scripts/conventions.mjs > "$OUT/conventions.md"; echo "conventions=$?"
echo "$OUT"
```

- 종료 코드 2 는 측정 실패다. 표를 읽지 말고 stderr 의 원인을 고친 뒤 다시 돈다.
- `deps.md` 는 취약점 표에서 경로가 `runtime` 인 행을 먼저 읽는다. 사용자가 설치하는 코드에 닿는 것이기 때문이다.
- `conventions.md` 는 등급이 error 인 행을 먼저 읽는다. warn 과 info 는 4단계의 입력이다.
- 규칙과 근거는 `conventions.mjs` 머리 주석과 각 규칙이 소유한다. 새 규칙은 문서에 쓰지 않고 그 파일에 검사로 더한다.

## 2. 범위 안 갱신 시험

```bash
node .agents/skills/health-check/scripts/trial-update.mjs --range; echo "trial=$?"
```

- 갱신 뒤에도 취약점이 남으면 3단계 전에 1단계 표의 「거쳐 오는 직접 의존성」 열을 본다.
  범위 안에서 풀리는 취약점은 메이저 갱신의 이득으로 세지 않는다.
- peer 로 자동 설치된 개발 도구가 옛 버전에 머물면 `--dev-pkg NAME@SPEC` 으로 직접 선언을 시험한다.
- 시험은 HEAD 커밋 기준이라 커밋하지 않은 변경은 반영되지 않는다. 필요하면 먼저 커밋한다.
- 실패하면 결과 표의 로그 경로를 열어 실패한 테스트 이름을 적는다.
- 시험이 중간에 끊겨 임시 worktree 가 남으면 스크립트가 출력한 정리 명령을 그대로 쓴다.
- 직접 지워야 하면 `git worktree list` 에서 경로가 `worktrees/nhncloud-cli/health-check-<숫자>-<숫자>` 패턴에 정확히 맞는 것만 `git worktree remove --force` 대상이다. 이름에 `health-check` 가 들어도 그 패턴이 아니면(예: 이 스킬을 만든 작업 worktree) 지우지 않는다.

## 3. 메이저 판단

1단계 표에서 갱신 종류가 「메이저」인 패키지마다 `references/major-upgrade.md` 를 읽고 판정한다.
시험은 블록 앞에서 `PKGS` 배열에 1단계 표의 메이저 대상을 넣어 돌린다.

```bash
PKGS=(--pkg "NAME@SPEC")   # 메이저 대상마다 --pkg "패키지@목표버전" 을 한 쌍씩 넣는다
node .agents/skills/health-check/scripts/trial-update.mjs --range "${PKGS[@]}"; echo "trial=$?"
```

타입 오류는 `tsc.log` 에서 파일과 줄을 읽어 수정량으로 적는다.

## 4. 구조와 유지보수성 검토

`references/review-axes.md` 에 따라 읽기 전용 검토를 한다.
높음 항목은 근거 파일과 줄을 직접 열어 확인한다. 확인하지 못했으면 「확인하지 않음」이라고 적는다.

## 5. 보고와 적용 경로 결정

작업 단위 표를 보여 준다.

| 단위 | 내용 | 규모 | 먼저 정할 것 |
|---|---|---|---|

- 버전을 바꾸는 단위에는 `references/major-upgrade.md` 「이유 표」를 붙인다.
- 단위마다 권장 경로를 먼저 적고 사용자가 정한다.

| 규모 | 경로 |
|---|---|
| 시험을 마친 의존성 갱신, 몇 줄짜리 결함 수정 | 이 세션에서 브랜치를 만들어 관심사별로 커밋한다 |
| 여러 명령에 걸치거나 정책을 먼저 정해야 하는 것 | `planning` 으로 문서와 task 를 만든 뒤 `orchestration` 으로 넘긴다 |

- 갱신을 적용할 때는 `trial-update.mjs` 가 남긴 `changes.patch` 를 작업 브랜치에서 `git apply` 하고, 이어서 `pnpm install --frozen-lockfile` 로 node_modules 를 맞춘다.
- patch 는 기본값으로 `os.tmpdir()` 아래에 있어 재부팅하면 사라진다. 적용 전에 있는지 확인하고, 없으면 시험을 다시 돈다.

```bash
PATCH=""   # 2단계나 3단계 결과 표의 patch 경로를 넣는다
test -f "$PATCH" && git apply --check "$PATCH" && git apply "$PATCH" && pnpm install --frozen-lockfile
```

- 의존성 갱신 커밋 본문에는 이유 표를 패키지마다 한 줄씩 옮기고, `pnpm audit` 건수의 전후 변화와 남은 것의 이유를 적는다.
- PR 은 사용자 확인 뒤 만든다.
