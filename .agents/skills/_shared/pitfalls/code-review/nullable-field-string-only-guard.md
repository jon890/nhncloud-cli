---
id: nullable-field-string-only-guard
category: code-review
title: 외부 API nullable 필드를 string-only 가드로 검증 → null 항목 하나가 전체 응답 거부
triggers: [nullable, string only, 가드]
tool_catchable: false
source: [PR###]
related: []
---

**증상**: 배열 응답의 각 요소를 `every(isX)` 로 검증하는데 가드가 `typeof obj["name"] === "string"` 처럼 string 만 허용.
외부 API 스펙상 그 필드가 nullable 이면(예: Glance v2 `image.name`) name 이 null 인 항목 하나가 `every` 를 false 로 만들어 **전체 페이지/응답이 "형식 오류" 로 거부**된다. 5-5 와 반대 방향 — 5-5 는 가드가 너무 느슨, 이건 너무 엄격.
**Good**: 공식 스펙이 nullable 인 필드는 `typeof v === "string" || v === null` 로 허용하고 타입도 `string | null`, 출력부는 `?? "-"`. 실제로 항상 채워진다고 실측되면 그 사실을 ADR 트레이드오프에 남기고 엄격 유지.

```bash
# 외부 목록 API 가드의 string-only 검사 + 해당 필드가 공식 스펙상 nullable 인지 대조
grep -nE "typeof obj\[\"[a-z_]+\"\] === \"string\"" src/services/
```

**Why**: PR #12 (plan010) — Glance `image.name` 이 nullable 인데 string-only 가드라 name=null private 이미지 하나가 페이지 전체 리스팅을 끊음. **재발**: PR #22(plan017) — `isVolume` 가 `name` 을 string-only 로 요구(Cinder 는 `--name` 미지정 시 `name: null`) → 같은 코드베이스에 이미 `isImage` 선례가 있는데 새 서비스 가드가 답습 안 함. critic 이 잡음.
**Self-check**: 목록 응답 요소 가드의 각 필드가 외부 스펙상 nullable/optional 인지 확인했는가? string-only 가 과잉 거부를 일으키지 않는가? **새 서비스 가드를 쓸 때 같은 repo 의 기존 가드(`isImage`/`isBinary`)가 이미 학습한 nullable·number|string 관용을 답습했는가** — 새 가드가 기존보다 엄격하면 의심.

# 6. API/HTTP 패턴
