---
id: type-optional-cascade-grep-missing
category: plan
title: type optional 완화 시 cascade 파일 grep 누락
triggers: [optional, cascade, 타입 완화]
tool_catchable: false
source: [PR67]
related: []
---

**증상**: 기존 type 의 필드 `code: string` → `code?: string` 같은 optional 완화 / undefined 가능 변경을 plan 본문에 한 번 명시.
  그러나 해당 필드를 *사용하는* 다른 파일에서 type narrowing 이 깨져 tsc 가 실패한다. 표 행을 만드는 `string[][]` 자리에 `string | undefined` 가 들어가는 형태가 대표적이다.
  plan 본문 `## 변경 파일` 섹션에 그 cascade 파일이 누락.

**Good**: type 변경 (특히 optional 완화 / 새 필드 추가 / 필드 제거) 을 plan 에 넣을 때 `grep -rn "\.{필드명}\b" src/` 로 모든 사용처 grep + `## 변경 파일` 에 추가.
  type narrowing 손실 가능성 (배열 element type, .map 결과 type, return type 추론 등) 도 같이 점검.

```bash
# plan 작성 시 (또는 critic 평가 시) 검증:
# 예: src/config/types.ts 의 ServiceCredential.appkey 를 손대는 경우
grep -rn "\.appkey\b" src/ | grep -v "test"      # 사용처 전수 조사
grep -rn "ServiceCredential" src/                # type 참조 전수 조사
# 결과 파일들이 plan 의 `## 변경 파일` 에 모두 있는지 확인
```

**Why**: PR #67 (plan032) critic Major #1 — 한 필드를 `string` 에서 `string | undefined` 로 완화하자 그 필드로 표 행을 만드는 파일이 `(string | undefined)[][]` 가 되어 TS2322 가 났다. plan 본문의 변경 파일 목록에 그 파일이 없었고, executor 가 `?? ""` 패치로 자체 회피했다. plan 대로만 실행하면 tsc 가 실패한다.
  현재 저장소에서 같은 cascade 가 걸리는 자리는 `src/config/types.ts` 의 optional 자격 필드다. `ServiceCredential.appkey` 하나가 `src/commands/ncr/helpers.ts`(:44, :52) 와 `src/commands/configure.ts`(:72, :99, :123) 에서 각각 다른 방식으로 좁혀진다. 타입을 손대면 이 파일들이 모두 변경 파일에 들어가야 한다.
