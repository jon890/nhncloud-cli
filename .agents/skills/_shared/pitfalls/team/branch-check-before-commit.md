---
id: branch-check-before-commit
category: team
title: 브랜치 확인 누락 commit 사고
triggers: [branch, commit, 확인]
tool_catchable: false
source: [plan###]
related: []
---

**증상**: skill / docs 변경 commit 직전 `git branch --show-current` 안 함 → PR 작업 브랜치에 무관 commit 박힘.
**왜**: skill 외부 작업이라도 자동 mode 가 자동 switch 하는 듯. 같은 세션 두 번 발생.

**규칙**: 모든 commit 직전 `git branch --show-current` 강제 확인. main 작업이면 main, PR 브랜치 작업이면 PR 브랜치 확인 후 commit.

## 섹션 2 소진 체크리스트

스폰 / 메시지 / 검증 / commit 단계마다 해당 패턴 self-check.

---

# 3. PR review 학습 (코드 패턴 함정)

`review-fix` 가 PR 리뷰 댓글 처리 후 재발 가능 패턴을 누적하는 자리. 같은 지적이 다음 PR 에서 반복되지 않도록.

> 누적 양식 (CLI# 또는 패턴 한 줄):
>
> ```markdown
> ## 3-N. {짧은 패턴 이름} (PR #N)
> **증상**: {1줄}
> **왜**: {1줄}
> **Good**: {해결책 + 코드 패턴}
> **검출**: {grep / find 명령}
> ```

(아직 누적 항목 없음. PR 리뷰 처리 시 `review-fix` 6.5단계 절차에 따라 채움.)

## 섹션 3 누적 규칙

- 누적 대상: 재현 가능한 라이브러리 / API / 타입 함정 (ky / vitest / commander / imapflow / mailparser / nodemailer 등)
- 누적 금지: 1회성 오타, 특정 plan 컨텍스트 종속 코멘트, 칭찬, 단순 확인 요청
- 도메인 의사결정 가치가 있으면 `docs/adr/` 에 신규 ADR 파일로 (ADR 작성 전 점검 통과 시)

---

# 4. 레포별 +α (dooray-cli — TypeScript / Commander.js / tsup / vitest)
