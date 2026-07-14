# docs-verifier 회고 절차

## 트리거

- docs-verifier 의 UPDATE_NEEDED 또는 VIOLATION 판정이 1회 이상 발생하면 PR 생성 직후·팀 shutdown 직전 의무 수행.
- 1-shot 통과(UPDATE_NEEDED / VIOLATION 0회)면 skip.
- 트리거됐으나 추가 패턴이 0개여도 자문 자체는 수행("신규 없음" 보고).

## 반복 가능성 판정

- `pitfalls/INDEX.md` 축적 규칙(재발성·심각도·도구로 못 잡음·추상화 가능 4조건)을 **참조**한다(여기 재정의 금지 — 단일 소스).
- 1회성 typo / 특정 plan 컨텍스트 종속 / 칭찬 / 단순 확인은 제외.

## 갱신 위치 (데이터 단일 소스)

- `.claude/planning-overlay.md` "docs 컨벤션 → 변경 유형별 docs 영향 표" 에 행 추가 또는 기존 행 보강.
- **별도 docs 신설 금지** — `_shared/docs-verifier-pitfalls.md` 등 별도 파일 생성은 문서 단일 출처 원칙 위반.
- 문서 단일 출처 원칙: docs-verifier 는 docs 갱신 누락만 잡으므로 영향 표 자체가 곧 회피 docs.
  별도 파일이 생기는 순간 두 곳에 같은 정의가 존재하게 되어 한쪽만 갱신되는 부패가 반드시 발생한다.

## 작성 형식 + 커밋 규약

- 형식: 영향 표 한 행 — 변경 유형 칸 + 갱신 대상 docs 칸(✓ / – 표시).
- 커밋 경로:
  - plan 진행 중 → 작업 브랜치 PR 에 포함(사전 점검 불요).
  - 사후 → main 직접. **이 경로일 때만** 메인 디렉터리 클린 사전 점검:

    ```bash
    [ "$(git status --short | wc -l | tr -d ' ')" = "0" ] && [ "$(git branch --show-current)" = "main" ] \
      || { echo "🚫 main 직접 commit 차단 — 다른 변경 또는 다른 브랜치 체크아웃 상태."; exit 1; }
    ```

- 커밋 메시지: `docs(skill): accumulate review learnings from PR #<N>` (PR 번호 + 사고 plan 번호 본문 명시).
