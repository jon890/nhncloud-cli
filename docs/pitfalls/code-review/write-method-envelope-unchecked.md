---
id: write-method-envelope-unchecked
category: code-review
title: write/void 메서드가 응답 봉투를 파싱하지 않아 200 + isSuccessful=false 를 삼킴
triggers: [봉투, unwrapHeader, delete, write, isSuccessful, void]
tool_catchable: false
source: [PR48]
related: [new-endpoint-envelope-assumed, sequential-endpoint-partial-failure]
---

**증상**: HTTP 200 고정 + `header.isSuccessful` 로만 성공 판별하는 API(NCS·Deploy·Log&Crash 계열, ADR-006/020)에서, 값을 반환하는 read/create 메서드는 `.json()` + `unwrapHeader()` 를 거치는데 **void 를 반환하는 write 메서드(delete/pause/resume/restart 등)만 `await ky.delete(url, ...)` 로 응답을 버린다.**
  서버가 `200 + { header: { isSuccessful: false } }` 를 돌려줘도 throw 하지 않아, 삭제·실행제어가 실제로 실패했는데 CLI 는 "✓ 삭제되었습니다" 를 출력한다(거짓 성공).
  PR48(NCS): deleteTemplate·deleteTemplateVersion·pauseWorkload·resumeWorkload·restartWorkloadTask·deleteWorkload 6개가 봉투 미검사 — code-reviewer 2라운드가 create/update/patch 만 보고 delete/action 계열을 놓침. tsc·test 도 통과(mock 이 봉투 성공을 강제하지 않았음).
**Good**: void write 메서드도 `const res = await ky.delete(...); unwrapHeader(await res.json<NhnEnvelope<unknown>>());` 로 봉투를 반드시 검사한다. catch 는 `if (err instanceof NhnCloudCliError) throw err;` 후 `toNhnCloudCliError(err)`. 테스트에 `isSuccessful=false → EXIT_API_ERROR throw` 케이스를 메서드마다 추가(성공 mock 만 두면 회귀를 못 잡음).
**Self-check**: `grep -A6 "async \(delete\|pause\|resume\|restart\|stop\|start\)\w*(" src/services/<svc>/client.ts | grep -L "unwrapHeader"` — 봉투 검사 없는 write 메서드 후보. read/create 는 봉투 보는데 void 반환 메서드만 빠졌으면 확정.
**Why**: 200-고정 API 는 HTTP 에러가 안 나므로 `toNhnCloudCliError` 만으로는 실패를 못 잡는다. 봉투 파싱을 건너뛰면 destructive 작업의 실패가 조용히 성공으로 보고돼 사용자가 오판한다 — 값을 안 쓰더라도 봉투는 반드시 unwrap.
