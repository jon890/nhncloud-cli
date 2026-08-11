---
id: stale-context-as-doc-evidence
category: plan
title: 세션 요약의 외부 상태를 재확인 없이 문서 근거로 인용
triggers: [외부 상태, 세션 요약, ADR 근거, 게시 여부]
tool_catchable: false
source: [PR86]
related: [external-state-gate-missing, stale-code-in-reuse-claim]
---

**증상**: 이전 세션 요약이나 대화 앞부분에 있던 외부 상태값(npm 게시 여부, 배포 상태, PR 상태, 릴리스 버전)을
재확인 없이 ADR·이슈·PR 본문에 사실로 적는다.

**왜**: 요약은 작성 시점의 스냅샷이고 그 뒤에 바뀐다.
코드나 파일과 달리 외부 상태는 저장소 안에서 검증되지 않으므로 틀려도 tsc·test·grep 이 잡지 못한다.
문서에 들어가면 사실 오류가 영구히 남고, 그 값을 근거로 사용자 결정을 받으면 결정의 전제가 함께 무너진다.

**Good**: 외부 상태를 단정하는 문장을 문서에 넣기 전, 그 값을 만드는 명령을 이 세션에서 실행한다.

```bash
npm view <package> dist-tags        # 게시 여부·latest 버전
gh pr view <N> --json state         # PR 상태
git show <tag>:<path>               # 특정 릴리스에 그 코드가 있었는지
```

**Self-check**: 지금 적는 사실이 이 세션에서 직접 실행한 명령의 출력인가?
요약·기억에서 왔다면 문장을 쓰기 전에 실행한다.
특히 "아직 게시되지 않아서", "이미 배포됐으므로" 처럼 **시점에 의존하는 근거**가 그렇다.

**Why**: PR #86 — 이전 세션 요약의 "v0.13.0 npm 미게시" 를 근거로
`--app-key` 제거가 깨는 변경이 아니라고 판단해 ADR·이슈·사용자 선택지 세 곳에 사실로 적었다.
독립 검토자가 게시 tarball 을 내려 반증했고, `npm view` 한 번이면 막을 수 있었다.
결정 자체는 유지됐지만 근거를 다시 세우고 문서 두 곳을 정정해야 했다.
