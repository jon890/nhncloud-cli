---
id: list-output-column-docs-mismatch
category: plan
title: list/조회 명령의 출력 컬럼을 docs 에 적을 때 실제 `headers: [...]` 배열과 1:1 누락
triggers: [list, 컬럼, docs 불일치]
tool_catchable: false
source: [PR23, PR24]
related: []
---

**증상**: 새 `list` 명령의 가시 컬럼을 CLAUDE.md·flow.md·README 에 "(id·name·status, 전체는 --json)" 식으로 적으면서, 실제 `output()` 의 `headers: [...]` 배열보다 **컬럼을 빠뜨린다**(예: headers 5개인데 docs 엔 4개). 사용자가 docs 만 보고 특정 컬럼이 안 나온다고 오인하거나, docs 에만 있는 유령 컬럼을 기대한다 — 문서 부패(A).

**Good**: 출력 컬럼을 docs 에 나열할 땐 **command 의 `headers` 배열을 grep 해 그대로 옮긴다**.
- `grep -n "headers:" src/commands/<svc>/<cmd>.ts` → 배열 원소를 docs 컬럼 설명과 1:1 대조.
- 컬럼이 4개 이상이면 모두 적거나 "주요 N개 + 전체는 --json" 로 명시(임의 누락 금지).

**Self-check**: docs 의 "(컬럼1·컬럼2·…)" 가 실제 `headers` 배열 길이·원소와 일치하는가? CLAUDE.md·flow.md·README 세 곳의 컬럼 나열이 서로, 그리고 코드와 일관되는가?

**Why**: PR #23 (plan018) docs-verifier UPDATE_NEEDED — `floatingip list` headers 는 `[id, floating_ip_address, status, port_id, fixed_ip_address]` 5개인데 CLAUDE.md·flow.md 가 `fixed_ip_address` 누락한 4개로 기재. 두 곳 보강으로 해소. 새 list 명령마다 재발 가능.

> **확장 — 옵션 표도 동일**: README/SKILL 의 새 명령 **옵션 목록**도 commander `.option(...)` 정의와 1:1 이어야 한다. 특히 수치 옵션의 범위·기본값(`--size` 범위 10~100·기본 100)을 docs 에 빠뜨리면 사용자가 허용값을 모른다. `grep -nE "\.option\(" src/commands/<svc>/<cmd>.ts` → README/SKILL 옵션 표와 대조. (PR #24 plan019 docs-verifier UPDATE — export `--size` 범위·`--profile` 가 README 표에 누락.)
