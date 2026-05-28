# Phase 5: 빌드 검증 + smoke test + SKILL/README 갱신

## 컨텍스트

`nhncloud configure` 구현 완료 (Phase 1~4). 이 phase 는 빌드를 검증하고 사용자/AI 가이드(SKILL.md, README)에 configure 를 반영한다.

먼저 아래 문서를 읽어라:

- `docs/flow.md` — configure 흐름·옵션 (SKILL/README 근거)
- `CLAUDE.md` — 출력 모드, 마크다운 가독성

기존 코드 참조:

- `skills/nhncloud-cli/SKILL.md`, `README.md` (기존 logncrash/deploy 섹션 형식 따라 configure 추가)

## 목표

빌드·타입·smoke 통과 + SKILL/README 에 configure 반영.

## 작업 목록

- [ ] 빌드 게이트 — `pnpm tsc --noEmit` 0건, `pnpm run build`, smoke `node dist/index.js configure --help`
- [ ] `skills/nhncloud-cli/SKILL.md` — configure 섹션 (대화형/비대화형, 의도→커맨드, "첫 설정은 configure")
- [ ] `README.md` — 설정 안내를 수동 JSON 편집 → `nhncloud configure` 로 갱신 (있으면)
- [ ] UAK 모델 변경 반영 — credentials 예시가 `userAccessKey` 구조인지 확인 (구 `deploy.uakId` 잔재 제거)

## 성공 기준

```bash
# cwd: <레포 루트>
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l   # 기대: 0
pnpm run build && echo BUILD_OK
node dist/index.js configure --help 2>&1 | grep -c "uak"   # 기대: >=1
grep -c "configure" skills/nhncloud-cli/SKILL.md   # 기대: >=1
# 구 UAK 구조 잔재 없어야 (문서 예시)
grep -rn "uakId\|deploy.*uakSecret" skills/ README.md 2>/dev/null | wc -l   # 기대: 0
# PII 게이트
grep -rnE "[0-9]{15,}" skills/ 2>/dev/null | grep -vE "<.*>" | wc -l   # 기대: 0
```

## 주의사항

- 자격증명 예시는 placeholder 만.
- SKILL/README 의 credentials 예시를 `userAccessKey` 새 구조로 통일 (구 `deploy.uakId` 잔재 제거).
- 마크다운 가독성 6패턴 준수.

## Blocked 조건

- 빌드/타입 실패가 이전 phase 결함이면: `PHASE_BLOCKED: phase {N} 재작업 필요 — {증상}`
