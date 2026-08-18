# 0006 — 폐지 서술 훑기에서 prd.md 가 grep 범위에 없었다

- plan: 065-feat-deploy-appkey-profile
- 상태: 해결

## 무슨 일이 있었나

`docs/prd.md` 가 폐지된 `deploy run <target>` 시그니처를 살아 있는 MVP 범위로 서술한 채 남았다.

```
- `run <target>` — 배포 실행 (OAuth 토큰 교환, 동기/`--async`)
- `artifacts` / `server-groups <target>` / `histories <target>` — 조회
```

이 plan 은 `<target>` 위치 인수를 8개 명령에서 모두 없앴다.
그런데 `prd.md` 는 planning 이 갱신한 여섯 문서 목록에도, phase-04 의 범위에도 없었다.

code-reviewer 와 docs-verifier 둘 다 이것을 올리지 않았다.
두 검토가 자기 레인에서 성실했는데도 놓쳤다 — code-reviewer 는 `git diff` 에 든 파일을 봤고 `prd.md` 는 diff 에 없었다.
docs-verifier 는 `grep -rn "deploy.targets\|--app-key\|getDeployTarget\|DeployTarget" docs/` 로 훑었는데
`prd.md` 의 문제 문자열은 `<target>` 이라 그 패턴 넷 어디에도 걸리지 않았다.

team-lead 가 검토 반영 중 `grep -rn '<target>' docs/ skills/ README.md AGENTS.md src/` 를 돌려 찾았다.

## 왜 일어났나

회고 0004 가 "결정이 만든 사용자 표면을 문자열로 grep 하라" 를 세웠고 이번에 그대로 따랐다.
따르는 방식이 좁았다. **바뀐 것의 이름으로만 grep 했다.**

`deploy.targets`·`--app-key`·`getDeployTarget`·`DeployTarget` 은 모두 이 변경이 **없앤 식별자** 다.
그런데 `prd.md` 는 그 식별자를 쓰지 않는다. 명령 시그니처의 **인수 자리 표기** 인 `<target>` 을 쓴다.
같은 결정이 만든 표면인데 문자열이 달라 그물에 걸리지 않았다.

문서 목록 쪽도 좁았다. planning 이 갱신한 여섯 문서는 자격증명·흐름·구조·ADR 이다.
`prd.md` 는 "무엇을 만드는가" 를 적는 문서라 구현 세부가 바뀔 때 떠오르지 않는다.
그런데 그 안에 명령 시그니처가 예시로 들어 있었다.

## 무엇을 바꿨나

`prd.md` 의 두 줄에서 위치 인수를 걷어내고 ADR-033 참조를 한 줄 더했다.
`docs/flow.md` 의 종료 코드 표와 대화형 순서, `docs/code-architecture.md` 의 트리 주석 다섯 줄도 같은 패스에서 고쳤다.

## 다음에 할 것

폐지 서술을 훑을 때 grep 을 **두 벌** 돌린다.

- **없앤 식별자** — 함수명, 타입명, 옵션명. 회고 0004 가 세운 것이다.
- **없앤 사용자 표면 표기** — 명령 시그니처의 인수 자리(`<target>`·`[target]`), 도움말 예시 문구.
  코드에서 지운 인수는 문서에서 이 형태로만 나타난다.

grep 범위에 `docs/prd.md` 를 반드시 포함한다.
`prd.md` 는 제품 범위 문서라 구현 변경 때 후보로 떠오르지 않지만, 명령 시그니처를 예시로 담고 있다.
`README.md`·`AGENTS.md`·`skills/` 와 함께 고정 범위로 둔다.

검색 결과를 셋으로 가른다. 이번에 `<target>` 은 여섯 곳에서 나왔고 판정이 셋으로 갈렸다.

- 살아 있는 동작 서술 — 고친다. `prd.md` 두 줄이 여기였다.
- 그때의 결정 기록 — 보존한다. `docs/adr/008` 이 여기다.
- 같은 문자열의 다른 의미 — 손대지 않는다. `docs/pitfalls/plan/` 의 `<target>` 은 git ref placeholder다.
