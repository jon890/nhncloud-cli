# 0004 — 결정 문서만 갱신하고 그 결정을 서술하는 다른 문서를 훑지 않았다

- plan: 064-fix-ncr-ncs-appkey-profile-only
- 상태: 해결

## 무슨 일이 있었나

planning 이 `--app-key` 제거를 결정하며 ADR-029 를 갱신하고 task 를 만들었다.
그런데 같은 옵션을 **살아 있는 동작으로 서술하던 다른 문서 7건**은 그대로 남았다.

- `docs/flow.md` 4건 — ncr·ncs 의 옵션 표 행과 appKey 해석 순서 서술
- `docs/code-architecture.md` 1건 — ncr `list.ts` 의 옵션 주석
- `docs/adr/016-ncr-management-api.md` 1건, `docs/adr/020-ncs-container-service-api.md` 1건

계획은 이 7건을 아예 인지하지 못했고, phase-03 은 `docs/` 를 "다시 손대지 않는다" 로만 적었다.
그 문장은 "planning 이 이미 다 했다" 로 읽힌다. 실제로는 절반만 했다.

critic 이 계획 평가에서 grep 으로 7건을 실측해 올렸다.

## 왜 일어났나

`.claude/planning-overlay.md` 는 "planning 결정 docs 는 task 생성 전 즉시 반영하고 commit" 을 정한다.
이 규칙을 **결정을 기록하는 문서 하나**로 읽으면 ADR-029 를 쓰는 것으로 끝난다.

빠진 것은 반대 방향이다. 결정이 바뀌면 **그 결정을 서술하던 문서**도 거짓이 된다.
ADR 을 쓰는 순간에는 그 문서들이 시야에 없다. 찾으려면 따로 훑어야 하는데 그 단계가 절차에 없었다.

## 무엇을 바꿨나

이번 PR 에서 team-lead 가 코드 phase 이후 별도 docs 커밋으로 7건을 메웠다.
문서 성격에 따라 다르게 다뤘다.

- 지금 동작을 적는 자리(`flow.md`·`code-architecture.md`)는 서술을 갱신했다.
- ADR 은 그때의 결정 기록이라 본문을 보존하고 `대체된 부분` 한 줄만 결정 절 아래에 붙였다.
  사후에 서술을 지우면 역사가 사라진다.
- ADR-029 에 016·020 으로의 역참조를 넣어 양방향 추적을 이었다.

## 다음에 할 것

결정 문서를 갱신할 때, **그 결정이 만든 사용자 표면을 문자열로 grep** 해 서술하는 다른 문서를 함께 찾는다.
이번 경우 `grep -rn '\-\-app-key' docs/` 한 번이면 7건이 전부 나왔다.

`대체된 부분` 표기는 이번에 처음 세운 형식이다. 다음 ADR 폐기에서도 같은 문면을 쓴다.
