---
id: credential-loader-reinvented-swallow
category: code-review
title: 새 read helper 가 기존 정규 로더를 재사용 않고 자체 try/catch 로 파싱 오류까지 삼킴
triggers: [자격증명, config 읽기, helper 추가, try catch, 에러 삼킴]
tool_catchable: false
source: [PR51]
related: [json-parse-as-cast, optional-credential-empty-fallback]
---

**증상**: 자격증명/config 를 읽는 새 helper 를 추가하면서 기존 정규 로더(`loadCredentialsOrEmpty` 등 — "파일 없음→빈 값, JSON 파싱 오류→NhnCloudCliError rethrow" 규약 보유)를 재사용하지 않고 자체 `try { loadCredentials() } catch { return [] }` 로 감싼다.
"파일 없음"과 "파일 손상(JSON 파싱 오류)"을 구분 없이 전부 삼켜, 손상된 `credentials.json` 이면 사용자는 "파일 확인" 에러 대신 조용히 "설정 없음"으로 처리돼 손상을 인지 못한 채 다음 단계로 진행한다. 로직 중복이면서 동시에 기존 컨벤션보다 관대(=덜 안전)해지는 회귀.

**Good**: 자체 try/catch 를 만들지 말고 기존 정규 로더를 위임 재사용한다.

```ts
// BAD — 파싱 오류까지 삼켜 손상 파일이 조용히 "없음"으로
export async function listProfilesWithUak(): Promise<string[]> {
  let credentials: Credentials;
  try {
    credentials = await loadCredentials();
  } catch {
    return [];
  }
  return Object.entries(credentials.profiles)
    .filter(([, p]) => isUserAccessKey(p["userAccessKey"]))
    .map(([name]) => name);
}

// GOOD — 정규 로더 재사용: 파일 없음→빈 값, 파싱 오류→NhnCloudCliError rethrow
export async function listProfilesWithUak(): Promise<string[]> {
  const credentials = await loadCredentialsOrEmpty();
  return Object.entries(credentials.profiles)
    .filter(([, p]) => isUserAccessKey(p["userAccessKey"]))
    .map(([name]) => name);
}
```

**Self-check**: 새 read helper 에 `catch { return [] }` / `catch { return {} }` 같은 무조건 빈값 반환이 있으면, 같은 파일에 이미 에러 노출 규약을 가진 로더(`loadCredentialsOrEmpty` 등)가 있는지 grep 하고 있으면 그것을 위임 재사용한다.

**Why**: PR #51 review — `listProfilesWithUak` 가 `loadCredentialsOrEmpty` 와 같은 목적인데 자체 catch 로 파싱 오류까지 삼켜, 파일 손상 시 사용자 미인지. tsc 는 통과하므로 도구로 못 잡는다.

관련: [[json-parse-as-cast]], [[optional-credential-empty-fallback]]
