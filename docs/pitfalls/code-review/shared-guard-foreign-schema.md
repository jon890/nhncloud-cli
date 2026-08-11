---
id: shared-guard-foreign-schema
category: code-review
title: 스키마가 다른 리소스에 공용 타입 가드 재사용
triggers: [공용 가드, 타입 가드 재사용, 응답 형식이 올바르지 않습니다]
tool_catchable: false
source: [ISSUE79]
related: [optional-response-field-guard, numeric-response-string-number-mixed]
---

**증상**: 여러 리소스를 훑는 공용 가드(`isNksNamedResource` 처럼 `uuid`·`id`·`name`·`status` 를 보는 형태)를
스키마가 다른 새 리소스에도 그대로 쓴다.
새 리소스의 필드 하나가 타입만 다르면(예: `id` 가 문자열이 아니라 정수) 가드가 응답 전체를 거부하고,
명령은 서버가 정상 응답을 줬는데도 "응답 형식이 올바르지 않습니다" 로 끝난다.

**오류 메시지가 원인을 가리지 않는다**: 공용 가드는 실패한 필드를 알려주지 않는다.
호출부가 적어 둔 문구("events 배열이 없습니다")가 그대로 나가는데 배열은 실제로 있다.
그래서 조사하는 사람이 엉뚱한 곳(배열 유무·봉투 형태)을 먼저 파고, 진짜 원인인 필드 타입에 도달하지 못한다.

**Good**: 리소스마다 전용 타입과 가드를 둔다. 식별자 필드만 필수로 보고 나머지는 선택으로 남긴다.
서버가 필드를 늘려도 조회가 깨지지 않는다.

```ts
export function isNksClusterEvent(val: unknown): val is NksClusterEvent {
  if (!isPlainObject(val)) return false;
  if ("header" in val || "body" in val) return false;
  return typeof val["id"] === "number" && typeof val["uuid"] === "string";
}
```

**검출**: 새 엔드포인트를 붙일 때 공용 가드를 재사용하려면, 실제 응답 한 건의 **필드별 타입**을 먼저 확인한다.
필드명만 대조하면 놓친다 — 이슈 #79 의 원인은 필드 부재가 아니라 `id` 의 타입이었다.

```bash
# 공용 가드를 여러 리소스가 공유하는지
grep -rn "isNksNamedResource\|getFlatNamedResource" src/services/
```

**출력 열도 함께 본다**: 공용 가드를 재사용하면 출력 열도 같이 복사되기 쉽다.
스키마가 다르면 그 열이 빈 칸으로 나온다 — 이슈 #79 의 events 는 `name`·`status` 가 없는데
헤더가 `id / name / status` 였다. 리소스에 실제로 있는 필드로 열을 바꾼다.

**Why**: 이슈 #79 — `nks cluster events` 가 `isNksNamedResource` 를 재사용했다.
이벤트의 `uuid` 는 문자열이라 "하나 이상이 문자열" 조건은 통과했지만,
`id` 가 정수라 `(id === undefined || typeof id === "string")` 제약에서 거부됐다.
39건이 정상으로 오는데도 항상 실패했다.

**Self-check**: 새 응답 타입에 공용 가드를 쓰려 하는가?
그 가드가 요구하는 필드 타입을 실제 응답으로 하나씩 대조했는가?
출력 열이 그 리소스에 실제로 있는 필드인가?
