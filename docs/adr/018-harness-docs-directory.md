# ADR-018: 하네스 누적 docs 디렉터리 구조 — 단일 파일 → 파일 per 항목과 INDEX

- **결정**: 항목이 계속 append 되는 누적 docs 를 단일 파일이 아니라 **항목 1개 = 파일 1개와 INDEX 라우터**로 운영한다.
  - ADR: `docs/adr/NNN-slug.md`(번호 유지 — 외부 참조 `ADR-NNN` 보존) 과 `docs/adr/INDEX.md` 라우터.
  - 회피 패턴: `docs/pitfalls/{plan,code-review,team}/<slug>.md`(내용 기반 slug — 내부 참조라 번호 불요) 과 `docs/pitfalls/INDEX.md` 라우터. 특정 에이전트 구현과 분리된 저장소 지식으로 관리한다.
  - 회고 절차: build-with-teams 9-7·planning 축적 규칙·review-fix 6.5 에 분산되던 회고 절차를 `_shared/retros/{critic,code-reviewer,docs-verifier}-retro.md` 역할별 단일 소스로 모은다(문서 단일 출처 원칙 — retro 는 *절차*만 담고, 데이터 갱신 위치는 해당 pitfalls 카테고리·planning 영향 표가 단일 소스).
- **맥락**: 단일 누적 파일은 세 가지 비용이 있다.
  - 동시 진행 PR 이 같은 파일 끝에 append 하면 머지 충돌(이번 세션 ADR-016/017 동시 추가 충돌 위험 실측).
  - 통째 로드라 토큰 낭비(pitfalls 987줄과 676줄 통독 부담). INDEX 라우터로 변경 유형에 해당하는 파일만 읽으면 해소.
  - 항목 번호 카운트·인덱스 줄을 양쪽 PR 이 갱신해 추가 충돌.
  - 회고 절차는 데이터 분리와 별개로 build-with-teams·planning·review-fix 3곳에 같은 내용이 분산되어 한쪽만 갱신되는 drift 비용이 있다.
  - 회피 패턴이 `.agents/skills/` 아래에 있으면 특정 에이전트 하네스의 구현 자산처럼 보이고 일반 문서 감사에서 누락되기 쉽다.
- **대안 기각**:
  - 단일 파일 유지 — 충돌·토큰 비용 그대로.
  - `.agents/skills/_shared/pitfalls/` 유지 — 실행 절차와 저장소 지식의 소유 경계가 섞이고 문서 감사 대상이 하네스 경로에 결합된다.
  - 번호만 분리(ADR 식 `NNN-slug`)를 pitfalls 에도 — pitfalls 는 외부 참조가 없어 내용 slug 가 재번호 문제를 아예 없앤다(ADR 은 `ADR-NNN` 외부 참조가 많아 번호 유지).
  - 회고 데이터까지 retro 에 로그형으로 누적 — 별도 데이터 문서가 새 부패 원인이 되어 문서 단일 출처 원칙을 깬다(데이터는 pitfalls·영향 표가 단일 소스로 유지하고 retro 는 절차만 담는다).
- **트레이드오프**: 파일 수가 늘지만 INDEX 가 통람을 대체한다. 소비는 "INDEX 라우터로 필요한 항목만 읽기"가 원칙(전체 통독 금지). 출처는 누적 파일 머지 충돌을 구조로 없애는 일반 패턴(파일 per 항목과 INDEX).
