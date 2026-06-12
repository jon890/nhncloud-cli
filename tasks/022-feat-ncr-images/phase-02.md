# Phase 02 — 공개 docs 반영 + 완료 마킹 (게이트 통과 시에만)

> phase-01 의 실측 게이트가 통과해 코드가 실제로 동작할 때만 본 phase 를 진행한다. 게이트 실패(blocked)면 이 phase 를 건너뛴다.

## 목표

이미지/태그 조회 명령(`ncr images`/`ncr tags`)을 사용자 facing docs 에 반영한다.

## 구현 항목

### 1. `README.md`

- 사용 예에 추가:
  ```bash
  nhncloud ncr images <registry>
  nhncloud ncr tags <registry> <repository>
  ```
- task 021 에서 남긴 "이미지/태그는 후속" 문구를 실제 명령으로 교체.
- **7-1 회피**: `--help` 출력과 옵션·인자 표기 대조.

### 2. `skills/nhncloud-cli/SKILL.md`

- 빠른 참조 표에 `ncr images` / `ncr tags` 행 추가.
- 자동화 시나리오("레지스트리의 이미지와 태그를 보고 싶다" → `ncr images <registry> --json` → `ncr tags <registry> <repo> --json`).
- 개인 식별 정보: registry·repository 는 placeholder(`<registry>`/`<repository>`).

### 3. CLAUDE.md 지원 명령

- `ncr images` / `ncr tags` 2줄 추가 + "지원 명령 (N개)" 카운트 갱신(42 → 44).
- (인증 모델 표·ADR 참조 표 행은 phase-01 의 ADR-017 작성 시 이미 추가됨 — 중복 금지)

> CLAUDE.md 지원 명령 목록은 명령 카운트 단일 소스라 코드 확정 후 갱신(거울 구조 — docs 영향 표의 "신규 CLI 명령" 행).

## 검증

- 개인 식별 정보 grep 2종(CLAUDE.md) → 0건.
- `node dist/index.js ncr --help` 가 list/get/images/tags 4개 노출.
- index.json `status: completed`, `current_phase: 2`.
