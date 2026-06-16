---
id: endpoint-version-double-prefix
category: plan
title: 이미 버전 segment(`/v2.0`·`/v2`)를 포함한 endpoint base 에 경로를 붙이며 버전을 또 붙임 → 이중 prefix(404)
triggers: [endpoint, 버전, double prefix]
tool_catchable: false
source: [plan###]
related: []
---

**증상**: 기존 서비스 client 의 endpoint base(`networkEndpoint`·`blockStorageEndpoint`·`imageEndpoint` 등)가 이미 API 버전 segment 를 포함(`https://host/v2.0`)하는데, 새 메서드 URL 을 `${this.networkEndpoint}/v2.0/floatingips` 처럼 버전을 **다시** 붙인다 → 실제 호출은 `https://host/v2.0/v2.0/floatingips` 로 404.
같은 파일의 기존 메서드(`${this.networkEndpoint}/vpcs`)와 내부 모순인데, tsc·`--help` 성공 기준은 URL 문자열을 실행하지 않아 잡지 못하고 수동 QA 첫 호출에서야 404 로 드러난다. plan 이 endpoint 재사용을 주장할수록(같은 catalog type) 재발한다.

**Good**: endpoint 재사용 plan 은 **base 가 버전 segment 를 이미 포함하는지 reference 메서드로 확인**한 뒤 경로만 붙인다.
- 새 메서드 작성 전 기존 메서드 URL 을 grep: `grep -n "this.<endpoint>}" src/services/<svc>/client.ts` → `${...}/vpcs`(버전 없음)면 base 에 버전 포함 → 새 메서드도 `${...}/floatingips`(버전 빼고).
- phase 성공 기준에 음수 검증 grep 추가: `grep -c "<endpoint>}/v2" client.ts` = **0** (base 가 버전 포함일 때).

**Self-check**: endpoint base 변수가 host 만인가, 버전까지 포함하나(`keystone.ts`·endpoint 해석부에서 확인)? 새 URL 이 기존 형제 메서드와 같은 prefix 깊이인가? base 가 버전 포함이면 새 경로에 `/v2`·`/v2.0` 리터럴이 없는가?

**Why**: PR #23 (plan018) critic CRITICAL — floatingip 6개 메서드 전부 `${networkEndpoint}/v2.0/...` 로 이중 `/v2.0`. networkEndpoint 가 이미 `https://host/v2.0`(keystone.ts) 라 전 명령 404. 6곳 모두 `/v2.0` 제거로 해소. compute/image/network/blockstorage 처럼 버전 포함 base 를 공유하는 IaaS 명령마다 재발 가능.
