---
id: spinner-no-try-catch
category: code-review
title: spinner 시작 후 try/catch 없이 API 호출 → 에러 시 spinner leak
triggers: [spinner, try-catch]
tool_catchable: false
source: [PR46, PR64, PR6]
related: []
---

**증상**: `startSpinner` 직후 외부 API 호출 (`resolveProfile`, `client.getXxx` 등) 을 평이하게 호출. 호출 중 예외 발생 시 `stopSpinner` 가 절대 호출 안 됨 → spinner 가 화면에 정지 상태로 잔존.
**Good**: spinner 가 떠 있는 동안의 모든 외부 호출을 try/catch 로 감싸고 catch 에서 `stopSpinner(false)` 명시 호출 후 re-throw.

```ts
startSpinner("...");
try {
  const result = await client.fetchSomething(...);
  stopSpinner(true, "...");
  // 이후 처리
} catch (e) {
  stopSpinner(false);
  throw e;
}
```

**검출**: `grep -A 20 "startSpinner" src/commands/` 결과에서 `try\s*\{` 가 같은 블록 내 없으면 의심.
**Why**: service client 호출이 spinner 이후 try/catch 밖에 놓이면 에러 경로에서 spinner 가 잔존한다. spinner 를 *언제* 시작하는지(검증 전 시작)는 별개 패턴이므로 두 축을 함께 보지 않는다.

**기존 spinner 블록에 새 헬퍼 호출 추가 / 위치 이동 시 (재발 패턴)**: spinner 블록 내부에 새 헬퍼 호출을 추가하거나 spinner 전에 있던 호출을 spinner 후로 이동하는 경우, 그 새 위치도 동일하게 try/catch 보호가 필요하다. spinner 전에 있을 때는 안전했던 호출 (예: 파일 부재를 throw 하는 payload 읽기) 이 spinner 후 위치로 이동하면 leak 경로가 생긴다.

```ts
// src/commands/ncs/template.ts는 payload 읽기와 client 생성을 일부러 spinner 앞에 둔다.
// 이 순서를 바꿔 spinner 뒤로 옮기면 try/catch 보호가 새로 필요해진다.
const payload = readJsonPayload(opts.file);        // spinner 전 — throw 해도 leak 없음
const { client } = await resolveNcsClient(opts);   // spinner 전
startSpinner("NCS 설계도 생성 중...");
try {
  template = await client.createTemplate(payload);
} catch (e) {
  stopSpinner(false);
  throw e;
}
stopSpinner(true);
```

**Self-check (plan / code review)**: 기존 spinner 블록 내부에 새 호출을 추가하거나 spinner 외부 호출을 내부로 이동하는 diff 가 있으면, 그 호출의 throw 경로를 따로 grep 으로 확인 (`grep -nE "throw new (NhnCloudCliError|Error)" {호출 파일}`). 1건이라도 throw 가능하면 try/catch 보호 필요.

**다단계 spinner 전환 시 직전 spinner stop 누락 (재발 패턴)**: 한 명령이 spinner 를 두 단계로 쓰는 경우 (예: create `--wait` 의 "생성 중..." → "ACTIVE 대기 중...") 두 번째 `startSpinner` 전에 첫 spinner 를 `stopSpinner(true)` 로 닫아야 한다. 안 닫으면 ora 인스턴스 2개가 동시에 stderr 에 프레임을 써서 출력이 깨진다.

```ts
startSpinner("인스턴스 생성 중...");
try { server = await client.create(...); } catch (e) { stopSpinner(false); throw e; }
stopSpinner(true);          // ← 두 번째 spinner 전에 첫 spinner 닫기 (누락 시 leak)
if (opts.wait) {
  startSpinner("ACTIVE 대기 중...");
  try { ... } catch (e) { stopSpinner(false); throw e; }
  stopSpinner(true);
}
```

**Why**: PR #6 (plan004) 🟡에서 create `--wait`가 첫 spinner stop 없이 두 번째 spinner를 시작해 고아 spinner가 생겼다. `--wait`·폴링 같은 다단계 진행 표시 명령마다 재발 가능.

**spinner 구간 안에서 stderr 로 경고 쓰기 (재발 패턴)**: spinner 가 도는 동안 `process.stderr.write` 로 경고를 내면 ora 프레임과 같은 stream 이라 텍스트가 애니메이션 문자와 섞인다 (`src/utils/spinner.ts` 의 `stream: process.stderr`). 저장소 선례는 예외 없이 경고를 spinner **밖**에 둔다 (`floatingip/delete.ts`, `deploy/download.ts` 는 `stopSpinner` 뒤).

경고가 어디에 속하는지는 **그 판정에 API 응답이 필요한가**로 가른다.

```ts
// 입력만 보고 판정하는 경고 → spinner 앞
if (plugins.some((p) => p.pluginType === "CORS")) process.stderr.write("경고: ...\n");
requireYes(opts.yes, "...");
startSpinner("...");
try { result = await client.setPathPlugins(...); } catch (e) { stopSpinner(false); throw e; }
stopSpinner(true);
// 응답을 보고 판정하는 경고 → stopSpinner 뒤
```

**Self-check**: spinner 를 새로 넣는 diff 라면, 그 구간 안으로 들어간 `process.stderr.write` 가 있는지 본다. `awk '/startSpinner/,/stopSpinner\(true\)/' {파일} | grep -c 'process.stderr.write'` 가 0 이어야 한다.

**Why**: PR #86에서 code-review 지적을 반영해 spinner를 추가하면서, 원래 spinner 밖에 있던 경고 두 개가 구간 안으로 들어갔다. **테스트가 spinner를 mock하므로 ora가 실제로 그리지 않아 이 회귀는 테스트로 잡히지 않는다.** stderr write와 `startSpinner`의 호출 순서를 비교하는 테스트를 따로 넣어야 고정된다.
