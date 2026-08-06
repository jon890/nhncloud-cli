---
id: client-dep-in-utils
category: code-review
title: client 의존 helper 를 `utils/` 에 두면 layer 위반
triggers: [client, utils, 의존성]
tool_catchable: false
source: [PR44]
related: []
---

**증상**: 새 helper (`resolveInstanceWithClient(client, ...)`) 가 도메인 응집을 이유로 `src/utils/instance.ts` 에 작성됨.
  utils 는 client 의존 없는 building blocks 가 컨벤션이다.
**Good**: client 를 받는 함수는 `src/services/<svc>/` 또는 해당 `src/commands/<svc>/helpers.ts` 로 둔다. 같은 도메인의 building blocks 는 utils, API 호출 orchestration 은 service/command boundary 로 분리한다. 같은 디렉터리 이름 충돌은 layer 가 우선.
**검출**: `grep -nE "Client|ky|create.*Client" src/utils/*.ts` 결과 0 건 유지. utils 안에 client import 가 등장하면 service/command helper 후보.
**Why**: utils 가 점진적으로 client 의존 모듈로 오염되면 command/service/api 레이어 경계가 무너진다.
  잘못 두면 utils 가 점진적으로 client 의존 모듈로 오염.
