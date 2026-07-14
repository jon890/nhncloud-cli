---
id: test-module-const-mock-timing
category: plan
title: 모듈 최상위 const(homedir/env 파생) 테스트 — SUT 정적 import 시 mock 이 늦어 상수가 잘못 굳음
triggers: [테스트, vitest, vi.mock, homedir, 모듈 상수, 캐시 경로]
tool_catchable: false
source: [plan039]
related: [test-self-mock]
---

**증상**: SUT 가 `const CACHE_DIR = join(homedir(), ...)` 처럼 모듈 최상위 const 를 **import 시점 1회** 평가한다.
  테스트가 `vi.mock("node:os", ...)` 로 `homedir` 를 temp dir 로 바꾸고 값은 `beforeAll` 에서 채우는 패턴을 쓸 때, SUT 를 파일 상단에서 **정적 import** 하면 상수 평가가 `beforeAll` 보다 먼저 일어난다.
  그 시점 mock 값이 초기값(`vi.hoisted(() => ({ dir: "" }))` → `""`)이라 상수가 상대경로(`.nhncloud/cache`)로 굳는다.
  결과: 테스트가 repo 작업트리에 untracked 파일을 만들고, read/write 가 같은 잘못된 경로로 일관돼 assertion 은 **거짓 통과**한다 (`pnpm test` 초록, 실제로는 격리 검증 실패 + 파일 잔재).

**Good**: `beforeAll` 에서 mock 값을 set 한 **직후 동적 `await import("./sut.js")`** 로 SUT 를 로드하고, 반환 module 의 함수를 호출한다.

```ts
const home = vi.hoisted(() => ({ dir: "" }));
vi.mock("node:os", async (orig) => {
  const actual = await orig<typeof import("node:os")>();
  return { ...actual, homedir: () => home.dir };
});

let store: typeof import("./sut.js");   // 정적 import 금지
beforeAll(async () => {
  home.dir = await mkdtemp(path.join(tmpdir(), "prefix-"));
  store = await import("./sut.js");     // 상수 평가가 이 시점 = mock 반영 후
});
```

함수에 경로를 **인자로** 넘겨 homedir 비의존인 모듈(예: `skill-install.test.ts`)은 정적 import 로 충분하다 — 이 함정은 모듈 상수를 내부 사용하는 SUT 에만 해당한다.

**Self-check**: 테스트 대상 모듈이 `homedir()`·`process.env`·`cwd()` 등을 **모듈 로드 시점 const** 로 굳히는가? 그렇다면 테스트가 그 함수를 mock 한 뒤 SUT 를 **정적 import** 하고 있지 않은가? 정적이면 동적 import(mock set 이후)로 바꾼다. 확인: 테스트 실행 후 `git status --short` 에 새 untracked 파일이 없는지.

**Why**: tsc·vitest 모두 통과하므로 도구가 못 잡는다. 거짓 초록 + 작업트리 오염이라 수동 `git status` 검사로만 드러나 탐지가 느리다. plan 의 test scaffold 지시가 import 순서를 명시하지 않으면 executor 가 repo 관행(정적 import)을 따라 곧장 이 함정에 빠진다.

관련: [[test-self-mock]]
