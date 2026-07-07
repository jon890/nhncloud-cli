# Phase 04 — 공개 docs 반영 (조회 명령)

## 목표

Phase 1~3 에서 구현한 NCS 조회 명령을 사용자-facing docs 에 반영한다.
NCS 는 이번 task 이후에도 write/malware 명령이 추가될 예정이므로, 이 phase 는 조회 명령 범위만 반영한다.

## 구현 범위

- `README.md`
  - NCS quick examples 추가 (`ncs template list`, `ncs template get`, `ncs workload list`, `ncs workload logs` 등).
  - UAK OAuth 토큰 재사용(Deploy 와 동일 계정 단위 캐시), `--app-key` 또는 profile `ncs` 블록 해석 방식을 설명.
  - region 은 `kr1`·`kr3` 만 지원함을 명시.
- `skills/nhncloud-cli/SKILL.md`
  - NCS 자동화 시나리오(router 레벨) 추가 — 상세는 `references/` 로 분리.
- `skills/nhncloud-cli/references/` 에 NCS reference 문서 추가(파일명은 기존 서비스 reference 명명 규칙을 따른다. 예: `ncs.md`).
  - template/workload 조회 명령 예시와 옵션 설명.
- `tasks/036-feat-ncs-foundation-read/index.json`
  - `status` 를 `completed` 로 갱신.
  - `current_phase` 를 `4` 로 유지.
  - 모든 phase `status` 를 `completed` 로 갱신.

## 검증

- `pnpm tsc --noEmit`
- `pnpm run build`
- `node dist/index.js ncs --help`
- README/skill 의 명령명이 `--help` 출력과 불일치하지 않는지 grep.

## 회피 항목

- `grep -rn "ncs" README.md skills/nhncloud-cli/SKILL.md` → 최소 1건 이상(문서 누락 방지).

## 변경 파일 (정확)

- `README.md`
- `skills/nhncloud-cli/SKILL.md`
- `skills/nhncloud-cli/references/ncs.md`
- `tasks/036-feat-ncs-foundation-read/index.json`

## 커밋

```bash
git commit -m "docs(ncs): publish read command guide"
```
