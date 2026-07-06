# Phase 03 — 공개 docs 반영 (쓰기 명령)

## 목표

Phase 1~2 에서 구현한 NCS 템플릿·워크로드 쓰기/실행제어 명령을 사용자-facing docs 에 반영한다.

## 구현 범위

- `README.md`
  - NCS 쓰기 명령 예시 추가 (`ncs template create --file`, `ncs template delete`, `ncs workload pause/resume/restart/delete`).
  - `--file` payload 규약과 삭제 confirm(`--yes`) 정책을 설명.
- `skills/nhncloud-cli/references/ncs.md` (선행 task 에서 생성됨)
  - 쓰기 명령 시나리오 추가.
  - 위험 명령(`delete`)은 `--yes` 필요성과 payload 파일 사용을 명시.
- `tasks/036-2-feat-ncs-write-control/index.json`
  - `status` 를 `completed` 로 갱신.
  - `current_phase` 를 `3` 으로 유지.
  - 모든 phase `status` 를 `completed` 로 갱신.

## 검증

- `pnpm tsc --noEmit`
- `pnpm run build`
- `node dist/index.js ncs template --help`
- `node dist/index.js ncs workload --help`
- README/skill 의 명령명이 `--help` 출력과 불일치하지 않는지 grep.

## 변경 파일 (정확)

- `README.md`
- `skills/nhncloud-cli/references/ncs.md`
- `tasks/036-2-feat-ncs-write-control/index.json`

## 커밋

```bash
git commit -m "docs(ncs): publish write command guide"
```
