# Phase 02 — 공개 docs 반영 + 완료 마킹

## 목표

코드 산출물(phase-01 의 실제 명령 인자·옵션)에 맞춰 사용자 facing docs(README, 공개 SKILL)를 갱신한다. planning 결정 docs(adr/code-architecture/CLAUDE.md/flow)는 이미 선반영됐으므로 **건드리지 않는다**(갱신 시점 분리 — README·SKILL 만 코드 확정 후).

## 구현 항목

### 1. `README.md`

- intro "지원 명령" 문구에 ncr 추가(레지스트리 조회).
- 사용 예 섹션에 `ncr` 블록 추가:
  ```bash
  nhncloud ncr list --region kr1 --app-key <appkey>
  nhncloud ncr get <registry> --app-key <appkey>
  ```
- 실제 phase-01 에서 확정된 옵션명과 정확히 일치시킨다(`--app-key`/`--region`). **7-1 회피**: docs 표현이 코드 옵션과 어긋나지 않게 `node dist/index.js ncr list --help` 출력으로 대조.

### 2. `skills/nhncloud-cli/SKILL.md`

- 빠른 참조 표에 `ncr list` / `ncr get` 행 추가.
- 자동화 시나리오 1~2개("레지스트리 목록을 보고 싶다" → `ncr list --json`).
- 프론트매터 description 에 ncr(Container Registry) 키워드 추가.
- **개인 식별 정보 회피**(CLAUDE.md): appkey/uak 는 `<appkey>`·`<uak-id>` placeholder. 실제 레지스트리 이름·사내 도메인 노출 금지.

### 3. 이미지/태그 부재 명시

README·SKILL 에 "이미지·태그 목록은 후속(task 022, Docker Registry v2 우회 실측 후)" 한 줄을 남겨, 사용자가 `ncr images` 를 기대했다가 없어서 혼란하지 않게 한다.

## 검증

- `grep` 개인 식별 정보 사전 점검(CLAUDE.md 의 grep 2종) → 0건.
- README/SKILL 의 옵션 표기가 `--help` 출력과 일치.
- index.json `status: completed`, `current_phase: 2`.
