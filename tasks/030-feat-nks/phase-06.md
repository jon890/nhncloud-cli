# Phase 06 — 공개 문서 반영

## 목표

NKS 구현 완료 후 사용자-facing docs 를 실제 명령 표면과 동기화한다.

## 구현 범위

- `README.md`
  - 지원 명령 수 갱신.
  - NKS quick examples 추가.
  - kubeconfig 저장, JSON payload 입력, 삭제 confirm 정책을 설명.
- `skills/nhncloud-cli/SKILL.md`
  - NKS 자동화 시나리오 추가.
  - cluster/nodegroup/addon 조회와 kubeconfig 저장 예시 추가.
  - 위험 명령은 `--yes` 필요성과 payload 파일 사용을 명시.
- `AGENTS.md`
  - “NKS 구현 완료 시 예정” 표현을 실제 지원 명령 수로 확정.
  - 지원 명령 목록을 실제 구현된 명령과 1:1 동기화.
- `docs/code-architecture.md`
  - `nks(계획)` 표현을 실제 `src/services/nks` / `src/commands/nks` 구조 설명으로 바꾼다.
- `tasks/030-feat-nks/index.json`
  - `status` 를 `completed` 로 갱신.
  - `current_phase` 를 `6` 으로 유지.
  - 모든 phase `status` 를 `completed` 로 갱신.

## 검증

- `pnpm tsc --noEmit`
- `pnpm run build`
- `node dist/index.js nks --help`
- README/skill 의 명령명이 `--help` 출력과 불일치하지 않는지 grep.

## 변경 파일 (정확)

- `README.md`
- `skills/nhncloud-cli/SKILL.md`
- `AGENTS.md`
- `docs/code-architecture.md`
- `tasks/030-feat-nks/index.json`

## 커밋

```bash
git commit -m "docs(nks): publish command guide"
```
