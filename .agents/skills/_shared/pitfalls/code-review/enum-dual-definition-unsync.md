---
id: enum-dual-definition-unsync
category: code-review
title: 같은 enum/목록이 두 곳에 정의 → 동기화 누락
triggers: [enum, 이중 정의, 동기화]
tool_catchable: false
source: [PR###]
related: []
---

**증상**: 동일한 허용값 집합 (region·flavor·status 등) 이 두 파일에 따로 정의되고 한쪽만 갱신됨.
예: configure 대화형 region select choices = `kr1/kr2/jp1/us1` 인데 endpoints 의 host 맵 = `kr1/kr2/kr3/jp1`.
사용자가 한쪽에만 있는 값 (us1) 을 고르면 다른 경로에서 `EXIT_PARAM_ERROR`, 한쪽에만 있는 값 (kr3) 은 선택 불가.

**Good**: 허용값은 단일 소스 (예: endpoint host 맵) 에서 파생하거나, 두 목록이 정확히 같은지 grep 으로 대조.

**검출**:
```bash
# 두 정의처의 토큰 집합을 각각 추출해 비교
grep -oE "kr[0-9]|jp[0-9]|us[0-9]" src/commands/configure.ts | sort -u
grep -oE "kr[0-9]|jp[0-9]|us[0-9]" src/api/endpoints.ts | sort -u   # 두 결과가 동일해야 함
```

**Why**: PR #6 (plan004) 🟠 — configure region choices 가 INSTANCE_HOST 맵과 불일치 (us1 잉여·kr3 누락). region·flavor 등 enum 을 추가하는 작업마다 재발 가능.

**Self-check**: 새 허용값 집합을 추가/수정했는가? 같은 집합을 참조하는 다른 정의처가 있고, 두 곳이 정확히 일치하는가?
