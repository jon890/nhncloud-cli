# Phase 5: 빌드 검증 + smoke test + SKILL/README 갱신

## 컨텍스트

`nhncloud instance` 구현 완료 (Phase 1~4). 이 phase 는 전체 빌드를 검증하고 사용자/AI 가이드(SKILL.md, README)에 instance 섹션을 추가한다.

먼저 아래 문서를 읽어라:

- `docs/flow.md` — instance 명령 시그니처·옵션·--wait·delete 정책 (SKILL/README 근거)
- `CLAUDE.md` — 지원 명령(10개) + Instance 인증 모델 행 + ADR 참조 표

기존 코드 참조:

- `skills/nhncloud-cli/SKILL.md` (logncrash/deploy/configure 섹션 형식 mirror)
- `README.md` (설정 안내 — iaas 자격증명 추가 + GPU 인스턴스 메모)

## 목표

빌드·타입·smoke 통과 + 공개 docs 에 instance 반영.

## 작업 목록

- [ ] 빌드 게이트
  - `pnpm tsc --noEmit` 0건, `pnpm run build`, smoke `node dist/index.js instance --help` / `instance create --help` / `instance delete --help`
- [ ] `skills/nhncloud-cli/SKILL.md` 에 instance 섹션 추가
  - 의도 → 커맨드 매핑 (인스턴스 발급·조회·삭제, GPU 발급은 `--flavor <gpu-id>`)
  - 체이닝 예시 — `instance create --wait --json` → `jq` IP 추출 → SSH/runner 등록 → 종료 후 `instance delete --yes` (ephemeral CI)
  - `--region` 사용법 (kr1/kr2/kr3/jp1)
- [ ] `README.md` — Instance 설정·사용 예 추가
  - configure 마법사가 묻는 `iaas` 자격증명 (API 비밀번호 안내)
  - 기본 사용 예 3~4개
- [ ] PII 게이트 — `tenantId` 19자리 ID·실제 username 등 placeholder 만

## 성공 기준

```bash
# cwd: <레포 루트>
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l   # 기대: 0
pnpm run build && echo BUILD_OK
node dist/index.js instance create --help 2>&1 | grep -c "\-\-wait"   # 기대: >=1
grep -c "instance create" skills/nhncloud-cli/SKILL.md   # 기대: >=1
grep -cE "iaas|tenantId" README.md   # 기대: >=1
# PII — 실제 19자리 ID·사내 식별자 0건
grep -rnE "[0-9]{15,}" skills/ README.md 2>/dev/null | grep -vE "<.*>|1234567890123456789|9876543210987654321" | wc -l   # 기대: 0
grep -rnE "tc-ocr|nhnent|@(nhn|nhnent)\.com" skills/ README.md 2>/dev/null | wc -l   # 기대: 0
```

## 주의사항

- placeholder 만 사용 (`<tenant-id>`, `<api-password>`, `<flavor-id>` 등).
- "API 비밀번호" 안내 — 로그인 비번과 다름을 명시.
- 마크다운 가독성 6패턴 준수.
- 기존 logncrash/deploy/configure 섹션은 건드리지 않고 instance 섹션만 추가 (외과적 변경).

## Blocked 조건

- 빌드/타입 실패가 이전 phase 결함이면: `PHASE_BLOCKED: phase {N} 재작업 필요 — {증상}`
