---
id: sequential-endpoint-partial-failure
category: code-review
title: sequential endpoint 호출 — partial-failure stderr 안내 + spinner pair 누락
triggers: [순차 endpoint, 부분 실패]
tool_catchable: false
source: [PR62]
related: []
---

**증상**: 리소스 변경과 그에 딸린 후속 변경을 sequential 로 호출한다 (예: IP ACL 대상 삭제 뒤 관련 Load Balancer 재바인딩).
  atomic 보장이 없으므로 첫 호출 성공 뒤 두 번째가 실패하면 부분 상태가 남는다.
  catch 가 `toNhnCloudCliError` 로 throw 만 하면 사용자는 "전체 실패" 로 오해하고 명령을 재실행해 앞 단계를 중복 적용한다.
**Good**: sequential 호출의 catch 안에서 (1) `stopSpinner(false, "...")`, (2) `process.stderr.write("⚠  본문은 수정되었으나 X 변경에 실패했습니다. 본문 재실행 금지 — ...")`, (3) re-throw.
  phase 본문 작업 항목에 try/catch + stderr 안내 코드 스니펫 명시.
**검출**: phase diff 에 `client.X` + `client.Y` 두 호출이 같은 비-Promise.all 블록에 있으면 의심. grep 패턴:
```bash
git diff main..HEAD -- src/commands/ | grep -E "^\+\s+await client\." | wc -l
# 같은 함수에서 2 이상이면 sequential 패턴 — partial-failure 처리 확인
```
**Why**: PR #62 critic REVISE — 첫 호출이 성공한 뒤 두 번째가 실패하면 앞 변경은 이미 반영된 상태로 남는데, 사용자가 전체 실패로 읽고 재실행해 중복 적용이 났다.
  현재 저장소의 기준 구현은 `src/commands/loadbalancer/rebind.ts` 의 `rebindIpAclSnapshots` 다. 실패한 Load Balancer 를 건너뛰지 않고 계속 시도하면서 `succeeded`·`failed` 와 재시도 명령(`retry_command`)을 구조화해 반환하고, `src/commands/loadbalancer/target.ts` 가 그 결과를 stderr 안내로 풀어 쓴다.
  ADR-022 가 이 계약(자동 원복 금지, 부분 실패 종료 코드, 재시도 명령 제공)을 소유한다. 새 sequential 경로를 추가할 때마다 같은 UX 를 점검한다.
