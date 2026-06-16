---
id: cache-non-atomic-write
category: code-review
title: 캐시 파일 비원자 쓰기 (`writeFile` 직접 호출)
triggers: [캐시, atomic write]
tool_catchable: false
source: [PR###]
related: []
---

**증상**: `~/.nhncloud/cache/` 등 캐시 파일을 `writeFile(path, data)` 로 직접 기록.
프로세스가 쓰기 도중 종료되면 부분 기록 파일이 남는다.
read 시 catch 로 `null` 반환해 graceful 하더라도, 매 만료 전 재사용 캐시가 무효화되어 불필요한 재교환 발생 — 그리고 동시 실행 시 race.

**Good**: temp 파일에 쓰고 `rename` 으로 원자적 교체.

```ts
import { rename } from "node:fs/promises";
import { randomBytes } from "node:crypto";

const tmp = filePath + "." + randomBytes(4).toString("hex") + ".tmp";
await writeFile(tmp, JSON.stringify(data, null, 2), { encoding: "utf-8", mode: 0o600 });
await rename(tmp, filePath);   // 원자적 교체
```

**검출**:
```bash
grep -rnE "writeFile\(" src/cache/   # 캐시 쓰기에 temp+rename 없이 직접 writeFile 의심
# 같은 함수에 rename 호출이 동반되는지 확인
```

**Self-check**: `src/cache/` 의 모든 쓰기가 temp 파일 + `rename` 패턴인가? 비밀 파일이면 `mode: 0o600` 도 동반.

**Why**: plan002 (PR #2) code-reviewer FIX_NEEDED — deploy 토큰 캐시(`token-store.ts`)가 `writeFile` 직접 호출. build-with-teams 검사 항목 #10 이 명시하는데도 executor 가 첫 구현에서 누락 → 구체 grep 으로 사전 차단.
