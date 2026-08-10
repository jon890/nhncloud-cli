---
id: exitcode-param-error-in-api-path
category: code-review
title: catch 의 `err.exitCode` 분기 시 `toNhnCloudCliError` 의 실제 매핑 미확인
triggers: [exitCode, EXIT_PARAM_ERROR, API]
tool_catchable: false
source: [PR63]
related: []
---

**증상**: resolver / command 에서 `catch (err)` 후 `err instanceof NhnCloudCliError && err.exitCode === EXIT_PARAM_ERROR` 같은 분기로 "특정 에러만 변환 + 나머지 re-throw" 를 시도. 하지만 `toNhnCloudCliError` (src/api/httpError.ts) 는 HTTP 에러에 `EXIT_AUTH_ERROR` (401/403) 또는 `EXIT_API_ERROR` (그 외, 404 포함) 만 부여. `EXIT_PARAM_ERROR` (3) 는 CLI 자체 입력 검증 경로에서만 발생 — API 호출 경로의 catch 에서는 절대 매칭 안 됨. 결과: 분기 조건이 항상 false → "특정 에러 변환" 코드가 dead path 가 되고, 사용자는 의도된 친절 메시지 대신 raw 에러를 봄.

**Good**: catch 안에서 HTTP 에러를 분류하려면 `EXIT_API_ERROR` (404 포함 4xx/5xx) 와 `EXIT_AUTH_ERROR` (401/403) 중에서 선택. status code 까지 구분하려면 `err.message` 의 `(404)` 패턴이나 별도 metadata 가 필요 — 단순 exitCode 비교로는 404 / 5xx / timeout 을 구별 못함을 인지하고 설계.

```ts
// BAD — EXIT_PARAM_ERROR 는 API 경로에서 절대 발생 안 함 → 분기 항상 false
try { await client.getLoadBalancer(loadBalancerId); } catch (err) {
  if (err instanceof NhnCloudCliError && err.exitCode === EXIT_PARAM_ERROR) {
    throw new NhnCloudCliError("찾을 수 없습니다", EXIT_PARAM_ERROR);
  }
  throw err;
}

// GOOD — toNhnCloudCliError 의 실제 매핑 (EXIT_API_ERROR for 404) 사용
try { await client.getLoadBalancer(loadBalancerId); } catch (err) {
  if (err instanceof NhnCloudCliError && err.exitCode === EXIT_API_ERROR) {
    throw new NhnCloudCliError("찾을 수 없습니다", EXIT_PARAM_ERROR);
  }
  throw err;   // EXIT_AUTH_ERROR / 네트워크 에러는 분류 보존
}
```

**검출**: catch 안의 exitCode 검사 패턴 + `EXIT_PARAM_ERROR` 사용 여부.
```bash
grep -rnE "exitCode\s*===\s*EXIT_PARAM_ERROR" src/commands/ src/services/ src/api/
# 결과 있으면 → API 경로의 catch 인지 확인. API 경로면 → EXIT_API_ERROR 로 교체
```

**Self-check**: catch 안에서 exitCode 분기를 쓰는 코드를 작성/리뷰할 때, `src/api/httpError.ts` 의 `toNhnCloudCliError` 가 그 에러 케이스에 어떤 exitCode 를 *실제로* 부여하는지 grep 으로 확인했는가? mock 으로 짠 테스트가 그 exitCode 를 mirror 하는가?

**Why**: PR #63 (plan029) — 한 resolver 의 catch 가 `EXIT_PARAM_ERROR` 를 검사했다. 테스트도 같은 값으로 reject 해서 7/7 PASS 였지만 실제 production path 의 `toNhnCloudCliError` 는 `EXIT_API_ERROR` 를 부여해 분기가 dead 였다. code-reviewer 가 catch 케이스와 `toNhnCloudCliError` 매핑을 대조해 잡았다.
  현재 저장소에서 같은 함정이 앉는 자리는 `src/commands/loadbalancer/helpers.ts` 의 `resolveLoadBalancerId`·`resolveIpAclGroupId` 다. 이 resolver 들은 이름 조회 실패를 스스로 `EXIT_PARAM_ERROR` 로 던지면서 그 안에서 `client.listLoadBalancers()` 를 호출하므로, 호출부 catch 가 exitCode 만 보면 자신이 던진 param 오류와 API 오류를 구별하지 못한다.
