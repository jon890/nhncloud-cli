# Phase 02 — 공개 docs 반영 + 완료 마킹

## 목표

이미지/태그 조회 명령(`ncr images`/`ncr tags`)을 사용자 facing docs(README, 공개 SKILL)에 반영한다. 결정 docs(adr/code-architecture/CLAUDE.md/flow/prd)는 docs-first 단계(ADR-017 신설 커밋)에서 이미 반영됐으므로 **건드리지 않는다**(갱신 시점 분리).

## 구현 항목

### 1. `README.md`

- 기존 NCR 섹션의 "이미지·태그 목록은 후속 task 022" 안내를 실제 명령으로 교체.
- 사용 예 추가:
  ```bash
  nhncloud ncr images <registry>
  nhncloud ncr tags <registry> <repository>
  ```
- **7-1 회피**: `node dist/index.js ncr images --help` / `ncr tags --help` 출력과 옵션·인자 표기를 대조(`--region`/`--app-key`/`--profile`).

### 2. `skills/nhncloud-cli/SKILL.md`

- 빠른 참조 표·의도→커맨드 매핑에 `ncr images` / `ncr tags` 행 추가.
- 자동화 시나리오: "레지스트리의 이미지와 태그를 보고 싶다" → `ncr images <registry> --json` → `ncr tags <registry> <repository> --json`.
- 기존 "이미지/태그는 후속 task 022" 안내 제거.
- frontmatter description 에 ncr images/tags 키워드 추가.
- **개인 식별 정보**(CLAUDE.md): registry·repository 는 placeholder(`<registry>`/`<repository>`), 실제 레지스트리명·host·appkey 노출 금지.

## 검증

- 개인 식별 정보 grep 2종(CLAUDE.md) → 0건.
- README/SKILL 의 옵션·인자 표기가 `--help` 출력과 일치.
- `node dist/index.js ncr --help` 가 list/get/images/tags 4개 노출.
- index.json `status: "completed"`, `current_phase: 2`, 모든 phase `status: "completed"` (이게 마지막 phase).
