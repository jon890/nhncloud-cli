# ADR-018: 하네스 누적 docs 디렉터리 구조 — 단일 파일 → 파일 per 항목 + INDEX

- **결정**: 항목이 계속 append 되는 누적 docs 를 단일 파일이 아니라 **항목 1개 = 파일 1개 + INDEX 라우터**로 운영한다.
  - ADR: `docs/adr.md` → `docs/adr/NNN-slug.md`(번호 유지 — 외부 참조 `ADR-NNN` 보존) + `docs/adr/INDEX.md`.
  - 회피 패턴: `.claude/skills/_shared/common-pitfalls.md`·`code-review-pitfalls.md` → `_shared/pitfalls/{plan,code-review,team}/<slug>.md`(내용 기반 slug — 내부 참조라 번호 불요) + `pitfalls/INDEX.md` 라우터.
  - 회고 절차: `_shared/retros/{critic,code-reviewer,docs-verifier}-retro.md` 로 역할별 분리(거울 구조 — 각 retro 가 해당 pitfalls 카테고리·planning 영향 표를 단일 소스로 가리킨다).
- **맥락**: 단일 누적 파일은 세 가지 비용이 있다.
  - 동시 진행 PR 이 같은 파일 끝에 append 하면 머지 충돌(이번 세션 ADR-016/017 동시 추가 충돌 위험 실측).
  - 통째 로드라 토큰 낭비(pitfalls 987줄 + 676줄 통독 부담). INDEX 라우터로 변경 유형에 해당하는 파일만 읽으면 해소.
  - 항목 번호 카운트·인덱스 줄을 양쪽 PR 이 갱신해 추가 충돌.
- **대안 기각**:
  - 단일 파일 유지 — 충돌·토큰 비용 그대로.
  - 번호만 분리(ADR 식 `NNN-slug`)를 pitfalls 에도 — pitfalls 는 외부 참조가 없어 내용 slug 가 재번호 문제를 아예 없앤다(ADR 은 `ADR-NNN` 외부 참조가 많아 번호 유지).
- **트레이드오프**: 파일 수가 늘지만 INDEX 가 통람을 대체한다. 소비는 "INDEX 라우터로 필요한 항목만 읽기"가 원칙(전체 통독 금지). 출처는 누적 파일 머지 충돌을 구조로 없애는 일반 패턴(파일 per 항목 + INDEX).

