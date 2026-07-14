---
id: delimiter-concat-hash-collision
category: code-review
title: 여러 자격/필드를 구분자 concat 해 해시·키를 만들면 값에 구분자가 섞일 때 collision
triggers: [지문, fingerprint, 해시, 캐시 키, dedup 키, concat, credentialHash]
tool_catchable: false
source: [PR55]
related: [cache-consistency]
---

**증상**: 여러 값을 `` `${a}:${b}:${c}` `` 처럼 고정 구분자로 이어 붙여 sha256 지문·캐시 키·dedup 키를 만든다.
  구분자(`:`)가 값 안에 등장할 수 있으면 서로 다른 입력이 같은 문자열로 인코딩돼 **같은 해시**를 낸다.
  예: `username="a", password="b:c"` 와 `username="a:b", password="c"` 는 둘 다 `"tenant:a:b:c"` → 지문 동일.
  자격 지문에서 충돌하면 자격을 바꿨는데 stale 캐시가 만료 전까지 재사용되는 원래 버그(#53)가 그대로 재현된다.

**Good**: 요소 경계가 **명확한 인코딩**으로 넘긴다. `JSON.stringify([...])` 는 각 요소를 따옴표로 감싸고 내부 `"`·`\` 를 escape 하므로 경계가 모호해지지 않는다.

```ts
// ❌ 구분자 concat — 값에 ':' 섞이면 collision
const hash = fingerprint(`${tenantId}:${username}:${password}`);
// ✅ 경계 명확
const hash = fingerprint(JSON.stringify([tenantId, username, password]));
```

`\x00` 같은 "값에 안 나오는" 구분자도 대안이지만, 값 도메인을 확신 못 하면 JSON 인코딩이 더 안전하다.

**Self-check**: 해시·캐시 키·dedup 키를 **2개 이상 값**을 이어 붙여 만드는가? 그 값 중 사용자 지정(비밀번호·이름 등)이 있어 구분자가 섞일 수 있는가? 그렇다면 concat 대신 JSON.stringify(배열) 등 경계 명확 인코딩을 쓴다.

**Why**: tsc·test 모두 통과한다(정상 입력엔 충돌이 안 나서 테스트가 초록). 충돌은 특정 값 조합에서만 드러나 탐지가 느리고, 결과가 "자격 바꿨는데 옛 캐시 재사용" 이라 원인 추적이 어렵다.

관련: [[cache-consistency]]
