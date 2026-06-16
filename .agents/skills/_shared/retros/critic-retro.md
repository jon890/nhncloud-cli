# critic 회고 절차

## 트리거

- critic 의 REVISE 판정이 1회 이상 발생하면 PR 생성 직후·팀 shutdown 직전 의무 수행.
- 1-shot 통과(REVISE 0회)면 skip.
- 트리거됐으나 추가 패턴이 0개여도 자문 자체는 수행("신규 없음" 보고).

## 반복 가능성 판정

- `pitfalls/INDEX.md` 축적 규칙(재발성·심각도·도구로 못 잡음·추상화 가능 4조건)을 **참조**한다(여기 재정의 금지 — 단일 소스).
- 1회성 typo / 특정 plan 컨텍스트 종속 / 칭찬 / 단순 확인은 제외.

## 갱신 위치 (데이터 단일 소스)

- `pitfalls/plan/<slug>.md` 신규 파일 생성.
- frontmatter 필드: `id`·`category`·`title`·`triggers`·`tool_catchable`·`source`·`related`.
- `pitfalls/INDEX.md` 라우터에 해당 카테고리 목록 1줄 추가 + 헤더 카운트 동기.

## 작성 형식 + 커밋 규약

- 형식: frontmatter + 본문(증상 / Good / Self-check / Why).
- 커밋 경로:
  - plan 진행 중 → 작업 브랜치 PR 에 포함(사전 점검 불요).
  - 사후 → main 직접. **이 경로일 때만** 메인 디렉터리 클린 사전 점검:

    ```bash
    [ "$(git status --short | wc -l | tr -d ' ')" = "0" ] && [ "$(git branch --show-current)" = "main" ] \
      || { echo "🚫 main 직접 commit 차단 — 다른 변경 또는 다른 브랜치 체크아웃 상태."; exit 1; }
    ```

- 커밋 메시지: `docs(skill): accumulate review learnings from PR #<N>` (PR 번호 + 사고 plan 번호 본문 명시).
