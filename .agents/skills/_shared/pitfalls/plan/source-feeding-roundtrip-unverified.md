---
id: source-feeding-roundtrip-unverified
category: plan
title: source-feeding 명령의 round-trip 미검증 — list 가 내놓는 id 가 소비 명령에 실제 먹히는지 안 봄
triggers: [source, roundtrip, 검증]
tool_catchable: false
source: [PR20, PR17]
related: []
---

**증상**: 새 "조회/목록" 명령의 존재 이유가 다른 명령의 인자 소스("이 `list` 의 id 를 `create --X` 에 넣어라")인데, 실측·docs 가 **목록 API 가 200 인지**만 확인하고 **그 id 가 소비 명령에 실제 round-trip 되는지**는 확인 안 한다.
공개 docs(README/SKILL)·CLI help(`.description`)에 "이 id 를 --X 에 그대로" 단정을 ship 하는데, 실제로는 다른 id(상위/하위 리소스 id)를 요구하면 사용자가 발급 실패하고 원인을 못 찾는다.

**Good**: source-feeding 명령은 **round-trip 을 명시 검증**한다 — (a) 소비 명령(`create` 등)의 해당 인자 docs 예제로 어느 id 인지 확인, (b) read-only 로 기존 리소스의 첨부 정보(`get`/`list --json`)에서 그 id 가 어느 목록의 id 와 일치하는지 대조, (c) 불확정이면 동의 하 1회 테스트로 확정. 확정 전엔 docs·`.description` 에서 "그대로 --X 에" 단정을 빼고 보수 표기. 확정 결과를 모든 docs(README/SKILL/flow/ADR/CLAUDE)+CLI help 에 일관 반영.

**Self-check**: "이 list 의 id 를 다른 명령 인자로" 라는 주장이 있는가? 그 id 가 소비 명령에 실제 먹히는지(상위 vs 하위 리소스 id) 확인하는 단계가 실측·수동 QA 에 있는가? CLI `.description` 같은 바이너리 ship 텍스트의 단정도 확정에 맞췄는가? **`index.json` 의 `description` 필드도 고쳤는가** — 단정 완화 시 phase 본문·README·SKILL·`.description` 은 손대면서 task 메타데이터(index.json description)를 빠뜨리기 쉽다(PR #20/plan015 critic MAJOR — 거기만 옛 단정 잔존). 소비처 옵션이 **아직 없으면**(consumer 미존재 — grep 으로 확인) round-trip 자체가 불가하니 docs 에서 그 연계 단정을 전부 뺀다.

**Why**: PR #17 (plan013) critic MAJOR — `network list` 의 VPC id 가 `instance create --network` 에 먹히는지 미검증인 채 docs 단정. 실측(인스턴스 addresses=VPC name 1:1)으로 "VPC id = --network" 확정 후 반영. availability-zone·floating-ip 등 "조회→다른 명령 인자" 구조마다 재발 가능.
