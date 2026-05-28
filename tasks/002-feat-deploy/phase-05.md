# Phase 5: 빌드 검증 + smoke test + SKILL.md 갱신

## 컨텍스트

`nhncloud deploy` 명령군 구현 완료 (Phase 1~4). 이 phase 는 전체 빌드를 검증하고, 공개 스킬(`skills/nhncloud-cli/SKILL.md`)에 deploy 시나리오를 추가한다.

먼저 아래 문서를 읽어라:

- `docs/flow.md` — deploy 명령 시그니처 (SKILL 의도→커맨드 매핑 근거)
- `CLAUDE.md` — 출력 모드, 마크다운 가독성

기존 코드 참조:

- `skills/nhncloud-cli/SKILL.md` (task 001 에서 생성된 logncrash 섹션 — 같은 형식으로 deploy 추가)

## 목표

빌드·타입·smoke 통과 + SKILL.md 에 deploy 섹션 추가.

## 작업 목록

- [ ] 빌드 게이트
  - `pnpm tsc --noEmit` 0건, `pnpm run build` 성공
  - smoke: `node dist/index.js deploy run --help`, `deploy artifacts --help`
- [ ] `skills/nhncloud-cli/SKILL.md` 에 deploy 섹션 추가
  - 설정 예시 — credentials deploy(UAK) + config deploy target (placeholder 만)
  - 의도→커맨드 매핑 (배포 실행 / 아티팩트·서버그룹·이력 조회)
  - 체이닝 예시 (`deploy artifacts --json | jq` 로 artifactId 찾기 → run)
  - 동기/`--async`, target override flag 설명
- [ ] `README.md` 에 deploy 사용예 추가 (planning 영향표 "신규 CLI 명령" 행 — 사용자 가이드 docs)
  - 기존 logncrash 사용예와 같은 형식으로 deploy 명령 4종 짧은 예시 추가 (외과적 변경 — 기존 섹션 보존)
  - **`CLAUDE.md` 의 "지원 명령 (1개)" 카운트는 건드리지 않는다** — 결정 docs 이므로 team-lead 가 phase 루프 밖 별도 commit 으로 보완 (갱신 시점 분리 규약)

## 성공 기준

```bash
# cwd: <레포 루트 (worktree)>
pnpm tsc --noEmit 2>&1 | grep -E "^src/" | wc -l   # 기대: 0
pnpm run build && echo BUILD_OK
node dist/index.js deploy run --help 2>&1 | grep -c "\-\-async"   # 기대: >=1
grep -c "deploy run" skills/nhncloud-cli/SKILL.md                 # 기대: >=1
grep -c "deploy" README.md                                        # 기대: >=1
# PII 게이트 (public repo)
grep -rnE "[0-9]{15,}" skills/ 2>/dev/null | grep -vE "<appkey>|<artifactId>|<serverGroupId>|<id" | wc -l   # 기대: 0
```

## 주의사항

- SKILL.md 의 자격증명·target 예시는 placeholder 만 (실제 UAK/appKey/ID 금지).
- 마크다운 가독성 6패턴 준수.
- 기존 logncrash 섹션은 건드리지 않고 deploy 섹션만 추가 (외과적 변경).

## Blocked 조건

- 빌드/타입 실패가 이전 phase 결함이면: `PHASE_BLOCKED: phase {N} 재작업 필요 — {증상}`
